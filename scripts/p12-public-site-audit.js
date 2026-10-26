#!/usr/bin/env node
'use strict';
// P12: primeira observacao de P11 em sites publicos NOVOS, sem login.
// Somente CSS calculado: nunca ler texto, URLs de links ou dados de formulario.
// Modelo nao e injetado, nao recolore o site, nao publica pesos.
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,sleep,ROOT}=require('./browser-e2e.js');
const {featuresFor,loadCandidate,predictText}=require('../training/p11-descendant-runtime.js');

const SITES=Object.freeze([
  Object.freeze({id:'python-docs',url:'https://docs.python.org/3/tutorial/'}),
  Object.freeze({id:'w3c-wcag',url:'https://www.w3.org/TR/WCAG22/'}),
  Object.freeze({id:'gnu-license',url:'https://www.gnu.org/licenses/gpl-3.0.en.html'})
]);
const TARGET_BG='rgb(26, 32, 40)';
const OUTPUT_DIR=path.join(ROOT,'browser-results/p12-public-sites');
const OUTPUT=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||OUTPUT_DIR);
const ALLOWED_KEYS=['background','color','fontSize','fontWeight','tag'];

function publicSnapshot(){
  const roots=document.querySelectorAll('p,a,li,td,th,h1,h2,h3,small,strong,em,code,span');
  const samples=[];
  let scanned=0;
  for(const el of roots){
    if(++scanned>1400||samples.length>=80)break;
    if(el.closest('button,input,textarea,select,svg,canvas,video,script,[role="img"],'+
      '[aria-disabled="true"],[disabled],[aria-selected="true"],[aria-pressed="true"]'))continue;
    const st=getComputedStyle(el),box=el.getBoundingClientRect();
    if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.95||
      box.width<16||box.height<8||box.bottom<=0||box.top>=innerHeight||
      box.right<=0||box.left>=innerWidth||
      st.backgroundImage!=='none'||st.maskImage!=='none'||
      st.webkitMaskImage!=='none')continue;
    if(!/^rgba?\(/.test(st.color)||!/^[a-z0-9]+$/i.test(el.tagName))continue;
    if(st.backgroundColor!=='rgba(0, 0, 0, 0)'&&
      st.backgroundColor!=='transparent')continue;
    let cur=el.parentElement,bg=null,safe=true;
    for(let depth=0;cur&&depth<12;depth++,cur=cur.parentElement){
      const parent=getComputedStyle(cur);
      if(parent.backgroundImage!=='none'||parent.maskImage!=='none'||
        parent.webkitMaskImage!=='none'){safe=false;break;}
      const c=parent.backgroundColor;
      if(!/^rgba?\(/.test(c)){safe=false;break;}
      if(c.startsWith('rgb(')){bg=c;break;}
      const match=c.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
      if(!match){safe=false;break;}
      const opacity=Number(match[1]);
      if(opacity>=.999){bg=c;break;}
      if(opacity>.001){safe=false;break;}
    }
    if(!safe||!bg)continue;
    samples.push({background:bg,color:st.color,fontSize:parseFloat(st.fontSize),
      fontWeight:parseInt(st.fontWeight,10)||400,tag:el.tagName});
  }
  // Dados devolvidos sao somente cores, categoria HTML e medidas numericas.
  return {scanned,samples};
}
const SNAPSHOT_EXPR='('+publicSnapshot.toString()+')()';
function validateRows(rows){
  if(!Array.isArray(rows)||rows.length<1||rows.length>80)
    throw new TypeError('P12: amostras fora do limite');
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||
      Object.keys(row).some(key=>!ALLOWED_KEYS.includes(key)))
      throw new TypeError('P12: campos inesperados na amostra');
    if(!/^(P|A|LI|TD|TH|H1|H2|H3|SMALL|STRONG|EM|CODE|SPAN)$/.test(row.tag))
      throw new TypeError('P12: tag nao permitida');
    if(!colors.parseColor(row.color)||!colors.parseColor(row.background)||
      colors.parseColor(row.color).a<.999||
      colors.parseColor(row.background).a<.999)
      throw new TypeError('P12: cor opaca invalida');
    if(!Number.isFinite(row.fontSize)||row.fontSize<1||row.fontSize>160||
      !Number.isFinite(row.fontWeight)||row.fontWeight<100||row.fontWeight>1000)
      throw new TypeError('P12: medidas invalidas');
  }
  return true;
}
function assess(rows,predict,colorUtils=colors){
  validateRows(rows);
  if(typeof predict!=='function')throw TypeError('P12: inferencia ausente');
  let accepted=0,rejected=0,totalDeviation=0,teacherChanges=0;
  const result=[];
  const bg=colorUtils.parseColor(TARGET_BG);
  for(const row of rows){
    const fg=colorUtils.parseColor(row.color);
    const large=row.fontSize>=24||
      row.fontSize>=18.66&&row.fontWeight>=700;
    const threshold=large?3:4.5;
    const teacher=colorUtils.contrastRatio(fg,bg)>=threshold?row.color:
      colorUtils.ensureContrast(fg,bg,threshold);
    const teacherColor=colorUtils.parseColor(teacher);
    if(!teacherColor||colorUtils.contrastRatio(teacherColor,bg)+1e-6<threshold)
      throw Error('P12: professor sem contraste');
    if(teacher!==row.color)teacherChanges++;
    const features=featuresFor(colorUtils,{background:TARGET_BG,
      text:row.color,sourceBackground:row.background,isLink:row.tag==='A',
      isLarge:large,explicitColor:true});
    const candidate=predict(features);
    let suggested=teacher;
    if(candidate?.action==='suggest'){
      if(!candidate.color||!colorUtils.parseColor(candidate.color)||
        colorUtils.contrastRatio(colorUtils.parseColor(candidate.color),bg)+1e-6<threshold)
        throw Error('P12: sugestao insegura rejeitada pela auditoria');
      accepted++;suggested=candidate.color;
    }else if(candidate?.action==='reject'){rejected++;}
    else throw TypeError('P12: formato de inferencia desconhecido');
    const actual=colorUtils.parseColor(suggested);
    totalDeviation+=(Math.abs(actual.r-teacherColor.r)+
      Math.abs(actual.g-teacherColor.g)+Math.abs(actual.b-teacherColor.b))/3/255;
    if(result.length<24)result.push({
      original:row.color,sourceBackground:row.background,
      teacher,neural:suggested,tag:row.tag
    });
  }
  return {samples:rows.length,accepted,rejected,teacherChanges,
    meanRgbDifference:Number((totalDeviation/rows.length).toFixed(5)),
    promotionEligible:false,needsReview:true,
    palettes:result};
}
function makePalette(palettes,siteId){
  if(!/^[a-z0-9-]+$/.test(siteId)||!Array.isArray(palettes)||palettes.length>24)
    throw Error('P12: paleta invalida');
  const valid=v=>{const x=colors.parseColor(v);if(!x||x.a!==1)throw Error('Cor SVG invalida');return 'rgb('+[x.r,x.g,x.b].join(', ')+')';};
  const out=['<svg xmlns="http://www.w3.org/2000/svg" width="870" height="'+
    (84+palettes.length*38)+'" viewBox="0 0 870 '+(84+palettes.length*38)+'">',
    '<rect width="100%" height="100%" fill="#171c24"/>',
    '<text x="20" y="29" fill="#fff" font-family="sans-serif" font-size="15">P12: estilos CSS reais ('+siteId+'); amostras, nao captura de site recolorido</text>',
    '<text x="20" y="59" fill="#ddd" font-family="sans-serif">Original</text>',
    '<text x="304" y="59" fill="#ddd" font-family="sans-serif">Professor seguro</text>',
    '<text x="590" y="59" fill="#ddd" font-family="sans-serif">Rede P11 (fallback quando necessario)</text>'];
  palettes.forEach((p,i)=>{
    const y=70+i*38;
    for(const [j,key,bgKey] of [[0,'original','sourceBackground'],
      [1,'teacher',null],[2,'neural',null]]){
      const x=20+284*j,bg=bgKey?valid(p[bgKey]):TARGET_BG;
      out.push('<rect x="'+x+'" y="'+y+'" width="260" height="32" rx="4" fill="'+bg+'"/>');
      out.push('<text x="'+(x+12)+'" y="'+(y+21)+'" fill="'+valid(p[key])+'" font-family="sans-serif" font-size="15">Amostra '+String(i+1).padStart(2,'0')+' — Aa 123</text>');
    }
  });
  out.push('</svg>');
  return out.join('\n');
}
function allowedLanding(site,origin){
  try {const initial=new URL(site.url),current=new URL(origin);
    return current.protocol==='https:'&&current.hostname===initial.hostname;
  }catch{return false;}
}
async function observe(site,predict){
  let launched;
  try{
    launched=await launch(null);
    await launched.page.navigate(site.url,{fixtureReady:false});
    const origin=await launched.page.eval('location.origin');
    if(!allowedLanding(site,origin))
      return {site:site.id,status:'inconclusive',reason:'unexpected-origin'};
    await sleep(350);
    const raw=await launched.page.eval(SNAPSHOT_EXPR);
    if(!raw||!Array.isArray(raw.samples)||raw.samples.length<8)
      return {site:site.id,status:'inconclusive',reason:'too-few-visible-color-samples'};
    const result=assess(raw.samples,predict);
    const screenshot=site.id+'-original.png';
    await launched.page.screenshot(path.join(OUTPUT,screenshot));
    const palette=site.id+'-css-palette.svg';
    fs.writeFileSync(path.join(OUTPUT,palette),makePalette(result.palettes,site.id));
    const {palettes,...aggregate}=result;
    return {site:site.id,status:'observed',...aggregate,
      originalScreenshot:screenshot,cssPalette:palette};
  }catch(error){
    if(error instanceof TypeError)throw error;
    // Navegacao e paginas instaveis sao inconclusivas, NUNCA aprovadas.
    return {site:site.id,status:'inconclusive',reason:'navigation-or-screenshot-unavailable'};
  }finally{if(launched)await launched.stop();}
}
async function main(){
  if(OUTPUT!==OUTPUT_DIR)throw Error('P12: destino de artefatos nao autorizado');
  fs.mkdirSync(OUTPUT,{recursive:true});
  const file=JSON.parse(fs.readFileSync(path.join(ROOT,'data/p11-descendant-ci-candidate.json'),'utf8'));
  const model=loadCandidate(core,file);
  const predict=x=>predictText(core,model,x,colors);
  const report={kind:'p12-new-public-css-shadow-not-rendered-mv3',
    modelIntegrated:false,promotionEligible:false,humanReviewed:false,
    note:'Sites publicos novos: apenas CSS computado, capturas originais e paletas sintéticas. Nao ha aplicacao da rede no site.',
    results:[]};
  for(const site of SITES){
    const result=await observe(site,predict);
    report.results.push(result);
    fs.writeFileSync(path.join(OUTPUT,'p12-external-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('P12 external',site.id,result.status,
      result.status==='observed'?JSON.stringify({sampled:result.samples,
        accepted:result.accepted,rejected:result.rejected,
        difference:result.meanRgbDifference}):result.reason);
  }
  report.observed=report.results.filter(row=>row.status==='observed').length;
  report.inconclusive=report.results.length-report.observed;
  report.completed=true;
  fs.writeFileSync(path.join(OUTPUT,'p12-external-report.json'),JSON.stringify(report,null,2)+'\n');
  if(report.observed<2)throw Error('P12: menos de dois sites públicos observados; sem evidencia suficiente');
  console.log('P12 external summary',JSON.stringify({observed:report.observed,
    inconclusive:report.inconclusive,promotionEligible:false}));
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=['### P12 — P11 em CSS público novo (modo sombra)','',
      '| Site | Status | Elementos | Neural aceita | Neural rejeita |',
      '|---|---|---:|---:|---:|',
      ...report.results.map(x=>'| '+x.site+' | '+x.status+' | '+
        (x.samples??'—')+' | '+(x.accepted??'—')+' | '+(x.rejected??'—')+' |'),
      '','**Somente CSS público + paletas isoladas. Não houve renderização neural real, nem promoção.**'];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  }
}
if(require.main===module)main().catch(e=>{console.error('P12 external falhou:',e.message);process.exitCode=1;});
module.exports=Object.freeze({SITES,assess,makePalette,validateRows,OUTPUT_DIR,allowedLanding});
