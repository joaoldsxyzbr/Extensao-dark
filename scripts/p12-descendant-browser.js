#!/usr/bin/env node
'use strict';
// P12: compara professor e P11 em duas paginas autorais novas. Nao e site real,
// nao integra P11 ao MV3 e nao autoriza publicacao nem promocao de pesos.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,ROOT}=require('./browser-e2e.js');
const {loadCandidate,featuresFor,predictText}=require('../training/p11-descendant-runtime.js');
const PAGES=Object.freeze(['project-board','library-catalog']);
const DARK_BG='rgb(26, 32, 40)';
const OUTPUT_ROOT=path.join(ROOT,'browser-results');
const outputArg=process.argv.find(s=>s.startsWith('--output='));
const OUTPUT=path.resolve(outputArg?.slice('--output='.length)||
  path.join(OUTPUT_ROOT,'p12-descendant'));
const files=Object.fromEntries(PAGES.map(key=>[key,
  fs.readFileSync(path.join(ROOT,'tests/p12-pages',key+'.html'))]));
function validOutput(directory){
  const target=path.resolve(directory);
  if(!target.startsWith(OUTPUT_ROOT+path.sep))throw Error('P12: arquivo protegido');
  return target;
}
function threshold(row){
  const weight=parseInt(row.weight,10);
  return row.size>=24||row.size>=18.66&&(weight>=700||row.weight==='bold')?3:4.5;
}
function probePage(){
  const surface=document.getElementById('p12-surface');
  const s=getComputedStyle(surface);
  const text=[...document.querySelectorAll('[data-p12-text]')];
  return {background:s.backgroundColor,
    texts:text.map(el=>{const st=getComputedStyle(el);
      return {id:el.id,tag:el.tagName,foreground:st.color,
        ownBackground:st.backgroundColor,size:parseFloat(st.fontSize),
        weight:st.fontWeight};}),
    buttonColor:getComputedStyle(document.querySelector('button')||surface).backgroundColor,
    iconFill:getComputedStyle(document.querySelector('svg circle')||surface).fill};
}
function plans(original,predict){
  if(!original||!Array.isArray(original.texts)||original.texts.length<4||
    original.texts.length>30||typeof predict!=='function')throw TypeError('P12: dados inválidos');
  const teacher=[],neural=[],ids=new Set();
  let accepted=0,rejected=0;
  const bg=colors.parseColor(DARK_BG);
  for(const row of original.texts){
    if(!row||typeof row.id!=='string'||!/^[A-Za-z0-9-]+$/.test(row.id)||
      ids.has(row.id)||!Number.isFinite(row.size)||
      colors.parseColor(row.ownBackground)?.a>=.01)
      throw TypeError('P12: elemento ilegível/incerto');
    ids.add(row.id);
    const fg=colors.parseColor(row.foreground);
    if(!fg||fg.a!==1)throw TypeError('P12: cor de origem inválida');
    const minimum=threshold(row);
    const safe=colors.contrastRatio(fg,bg)>=minimum?row.foreground:
      colors.ensureContrast(fg,bg,minimum);
    if(!safe||colors.contrastRatio(colors.parseColor(safe),bg)<minimum)
      throw TypeError('P12: professora sem contraste');
    teacher.push({id:row.id,color:safe});
    const x=featuresFor(colors,{background:DARK_BG,
      text:row.foreground,sourceBackground:original.background,
      isLink:row.tag==='A',isLarge:minimum===3,explicitColor:true});
    const prediction=predict(x);
    if(prediction?.action==='suggest'){
      if(colors.contrastRatio(colors.parseColor(prediction.color),bg)<minimum)
        throw TypeError('P12: cor neural insegura');
      neural.push({id:row.id,color:prediction.color});
      accepted++;
    }else if(prediction?.action==='reject'){
      neural.push({id:row.id,color:safe});
      rejected++;
    }else throw TypeError('P12: saida neural desconhecida');
  }
  return {teacher,neural,stats:{total:teacher.length,neuralAccepted:accepted,
    neuralRejected:rejected,coverage:accepted/teacher.length}};
}
function applyPage(action,operations){
  const surface=document.getElementById('p12-surface');
  const nodes=[...document.querySelectorAll('[data-p12-text]')];
  if(!surface||nodes.length!==operations.length)throw Error('P12: arvore alterada');
  if(action==='apply'){
    if(window.__p12Restore)throw Error('P12: estado anterior pendente');
    const before={surface:surface.getAttribute('style'),
      children:nodes.map(el=>({id:el.id,style:el.getAttribute('style')}))};
    window.__p12Restore=before;
    surface.style.setProperty('background-color','rgb(26, 32, 40)','important');
    surface.style.setProperty('color','rgb(241, 243, 246)','important');
    for(const row of operations){
      const el=nodes.find(node=>node.id===row.id);
      if(!el||typeof row.color!=='string'||
        !/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(row.color))
        throw Error('P12: cor/plano inválido');
      el.style.setProperty('color',row.color,'important');
    }
    return {applied:operations.length};
  }
  if(action==='restore'){
    const before=window.__p12Restore;
    if(!before)throw Error('P12: estilos de origem ausentes');
    const revert=(el,style)=>{
      if(style===null)el.removeAttribute('style');
      else el.setAttribute('style',style);
    };
    revert(surface,before.surface);
    for(const row of before.children){
      const el=nodes.find(node=>node.id===row.id);
      if(!el)throw Error('P12: DOM modificado');
      revert(el,row.style);
    }
    const surfaceMatch=surface.getAttribute('style')===before.surface;
    const mismatches=before.children.filter(row=>nodes.find(el=>el.id===row.id)
      ?.getAttribute('style')!==row.style).map(row=>row.id);
    delete window.__p12Restore;
    return {restored:before.children.length,
      ok:surfaceMatch&&mismatches.length===0,surfaceMatch,badIds:mismatches};
  }
  throw Error('P12: acao inválida');
}
function contrastViolations(sample,baseline){
  const bg=colors.parseColor(sample.background);
  const map=new Map(baseline.texts.map(row=>[row.id,row]));
  let weak=0;
  for(const row of sample.texts){
    const fg=colors.parseColor(row.foreground),base=map.get(row.id);
    if(!fg||!bg||!base||colors.contrastRatio(fg,bg)<threshold(base)-.0001)weak++;
  }
  return weak;
}
const expr=(fn,...args)=>'('+fn.toString()+')('+args.map(JSON.stringify).join(',')+')';
async function inspect(id,predict,port){
  const {page,stop}=await launch(null);
  try{
    await page.navigate('http://127.0.0.1:'+port+'/'+id);
    const baseline=await page.eval(expr(probePage));
    const planned=plans(baseline,predict);
    await page.screenshot(path.join(OUTPUT,id+'-original.png'));
    const results={};
    for(const phase of ['teacher','neural']){
      const applied=await page.eval(expr(applyPage,'apply',planned[phase]));
      assert.equal(applied.applied,planned[phase].length);
      try{
        const state=await page.eval(expr(probePage));
        const weak=contrastViolations(state,baseline);
        assert.equal(weak,0,'P12: contraste ruim em '+phase);
        assert.equal(state.buttonColor,baseline.buttonColor);
        assert.equal(state.iconFill,baseline.iconFill);
        await page.screenshot(path.join(OUTPUT,id+'-'+phase+'.png'));
        results[phase]={weakText:weak,screenshot:id+'-'+phase+'.png'};
      }finally{
        const rollback=await page.eval(expr(applyPage,'restore',planned[phase]));
        assert.equal(rollback.restored,planned[phase].length);
        assert.equal(rollback.ok,true,JSON.stringify(rollback));
      }
    }
    assert.deepEqual(await page.eval(expr(probePage)),baseline,'P12: não restaurado');
    return {page:id,models:planned.stats,phases:results,restorationVerified:true};
  }finally{await stop();}
}
async function main(){
  validOutput(OUTPUT);
  fs.mkdirSync(OUTPUT,{recursive:true});
  const file=path.join(ROOT,'data/p11-descendant-ci-candidate.json');
  const model=loadCandidate(core,JSON.parse(fs.readFileSync(file,'utf8')));
  const predict=x=>predictText(core,model,x,colors);
  const server=http.createServer((req,res)=>{
    const key=String(req.url).slice(1);
    if(!Object.hasOwn(files,key)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(files[key]);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const report={kind:'p12-unseen-local-pages-not-real-websites',
    modelsDeployed:false,promotionEligible:false,readyForRelease:false,
    note:'Templates autorais fora do treino, mas nao sites reais nem avaliacao humana cega.',
    pages:[]};
  try{
    for(const id of PAGES){
      const result=await inspect(id,predict,server.address().port);
      report.pages.push(result);
      console.log('P12',id,JSON.stringify(result.models),'restored',result.restorationVerified);
    }
    report.neuralRejections=report.pages.reduce((n,r)=>n+r.models.neuralRejected,0);
    report.quality=report.neuralRejections>0?'needs-review':'requires-human-review';
    fs.writeFileSync(path.join(OUTPUT,'p12-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('P12 summary',JSON.stringify({pages:report.pages.length,
      neuralRejections:report.neuralRejections,promotionEligible:false}));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(err=>{
  console.error('P12 falhou:',err.stack||err);process.exitCode=1;
});
module.exports=Object.freeze({PAGES,plans,contrastViolations,threshold,validOutput});
