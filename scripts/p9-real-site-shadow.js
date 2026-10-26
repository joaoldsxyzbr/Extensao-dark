#!/usr/bin/env node
'use strict';
// P9: auditoria em modo sombra de P7/P8 em sites publicos e sem login.
// Nao aplica CSS, nao injeta extensao, nao salva vetores, URL, DOM ou dados de usuario.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,sleep,ROOT}=require('./browser-e2e.js');
const {chooseSites,isAllowedLanding}=require('./real-site-audit.js');
const {EXPRESSION}=require('./p9-live-feature-snapshot.js');
const {decode:decodeP7}=require('../training/neural-color-runtime.js');
const {loadCandidate,predictColors}=require('../training/neural-color-p8-runtime.js');

const APPROVED_REASONS=new Set(['graphic','selected','disabled','translucent',
  'native-dark','decorated','non-surface']);
const outputArg=process.argv.find(x=>x.startsWith('--output='));
const siteArg=process.argv.find(x=>x.startsWith('--sites='));
const OUTPUT_ROOT=path.join(ROOT,'browser-results');
const OUTPUT=path.resolve(outputArg?.slice('--output='.length)||
  path.join(OUTPUT_ROOT,'p9-shadow'));
const SITES=chooseSites(siteArg?.slice('--sites='.length)||
  'example,wikipedia,mdn,github,roblox,youtube');

function validateSample(sample) {
  return sample&&Array.isArray(sample.x)&&sample.x.length===57&&
    sample.x.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)&&
    Array.isArray(sample.reasons)&&sample.reasons.length<=7&&
    sample.reasons.every(reason=>APPROVED_REASONS.has(reason));
}
function analyze(samples,predictions){
  if(!Array.isArray(samples)||!samples.every(validateSample)||
     !predictions||typeof predictions.p7!=='function'||typeof predictions.p8!=='function')
    throw new TypeError('P9: dados de observacao invalidos');
  const summary={
    samples:samples.length,protected:0,
    models:Object.fromEntries(['p7','p8'].map(name=>[name,{
      convert:0,preserve:0,protectedConversions:0,lowContrastConversions:0,
      protectedByReason:Object.fromEntries([...APPROVED_REASONS].map(key=>[key,0]))
    }])),disagreements:0
  };
  for(const sample of samples){
    const protectedSample=sample.reasons.length>0;
    if(protectedSample)summary.protected++;
    const actions={};
    for(const name of ['p7','p8']){
      const output=predictions[name](sample.x);
      if(!output||!['convert','preserve'].includes(output.action)||
        !Number.isFinite(output.confidence)||output.confidence<0||output.confidence>1)
        throw new TypeError('P9: resposta neural invalida');
      actions[name]=output.action;
      const stats=summary.models[name];
      stats[output.action]++;
      if(output.action==='convert'){
        if(protectedSample){
          stats.protectedConversions++;
          for(const reason of new Set(sample.reasons))stats.protectedByReason[reason]++;
        }
        const bg=colors.parseColor(output.background);
        const fg=colors.parseColor(output.color);
        if(!bg||!fg||bg.a!==1||fg.a!==1)
          throw new TypeError('P9: cores neurais invalidas');
        if(colors.contrastRatio(bg,fg)<4.5)stats.lowContrastConversions++;
      }
    }
    if(actions.p7!==actions.p8)summary.disagreements++;
  }
  return summary;
}
function safeOutput(folder){
  const target=path.resolve(folder);
  if(target!==OUTPUT_ROOT&&!target.startsWith(OUTPUT_ROOT+path.sep))
    throw new TypeError('P9: relatorio fora da pasta isolada browser-results');
  return target;
}
async function inspect(site,predict){
  let session;
  try{
    session=await launch(null);
    await session.page.navigate(site.url,{fixtureReady:false});
    const landing=await session.page.eval('location.origin + "/"');
    // Verificar permissao antes de analisar ou fotografar o DOM.
    if(!isAllowedLanding(site,landing))return {site:site.id,status:'inconclusive',reason:'landing-outside-allowlist'};
    await sleep(600);
    const observed=await session.page.eval(EXPRESSION);
    if(!observed||!Number.isSafeInteger(observed.scanned)||
      !Number.isSafeInteger(observed.visible)||!Array.isArray(observed.samples)||
      observed.samples.length<Math.min(8,site.minSamples)||
      observed.samples.length>140)
      return {site:site.id,status:'inconclusive',reason:'insufficient-valid-css-samples'};
    const metrics=analyze(observed.samples,predict);
    const screenshot=site.id+'-unmodified.png';
    let screenshotAvailable=false;
    try{await session.page.screenshot(path.join(OUTPUT,screenshot));screenshotAvailable=true;}
    catch{ /* Imagem ausente nao e revisao visual aprovada. */ }
    return {site:site.id,status:'observed',scanned:observed.scanned,
      sampled:metrics.samples,screenshot:screenshotAvailable?screenshot:null,
      ...metrics};
  }catch(error){
    // Saida neural estruturalmente invalida reprova a auditoria, nao vira falta de rede.
    if(error instanceof TypeError)throw error;
    // Erro de rede/CDP nao pode virar aprovacao; nao exportar URLs/dados da pagina.
    return {site:site.id,status:'inconclusive',reason:'navigation-or-browser-error'};
  }finally{if(session)await session.stop();}
}
async function main(){
  safeOutput(OUTPUT);
  fs.mkdirSync(OUTPUT,{recursive:true});
  const p7=core.loadModel(JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-ci-candidate.json'),'utf8')));
  const p8=loadCandidate(core,JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-p8-ci-candidate.json'),'utf8')));
  assert.equal(p7.inputSize,57);
  const predict={p7:x=>decodeP7(core,p7,x),p8:x=>predictColors(core,p8,x)};
  const report={formatVersion:1,kind:'real-public-sites-observational-shadow-only',
    promotionEligible:false,readyForRelease:false,modelsDeployed:false,
    noUserData:true,theme:'deep',source:'computed-css-numeric-vectors-memory-only',
    note:'Protecao de elementos e contraste nominal sao sinais de risco, nao rotulos humanos. Capturas sao da pagina SEM extensao; nenhuma cor neural foi aplicada.',
    results:[]};
  for(const site of SITES){
    const result=await inspect(site,predict);
    report.results.push(result);
    fs.writeFileSync(path.join(OUTPUT,'shadow-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('P9 shadow',site.id,result.status,
      result.status==='observed'?JSON.stringify({sampled:result.sampled,
        protected:result.protected,p7:result.models.p7.protectedConversions,
        p8:result.models.p8.protectedConversions}):result.reason);
  }
  report.completed=true;
  report.observed=report.results.filter(row=>row.status==='observed').length;
  report.inconclusive=report.results.length-report.observed;
  fs.writeFileSync(path.join(OUTPUT,'shadow-report.json'),JSON.stringify(report,null,2)+'\n');
  if(report.observed===0)throw Error('P9: nenhuma pagina publica observada; auditoria inconclusiva');
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=['### P9 — P7 × P8 em observacao sem modificar sites','',
      '| Site | Cobertura | P7: conversoes protegidas | P8: conversoes protegidas |',
      '|---|---|---:|---:|',
      ...report.results.map(r=>'| '+r.site+' | '+r.status+' | '+
        (r.models?.p7.protectedConversions??'—')+' | '+
        (r.models?.p8.protectedConversions??'—')+' |'),'',
      '**Sem autorizacao de promocao.** Nao houve recoloracao de paginas; capturas exigem revisao humana.',''];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  }
  console.log('P9 summary',JSON.stringify({observed:report.observed,
    inconclusive:report.inconclusive,promotionEligible:false}));
}
if(require.main===module)main().catch(error=>{
  console.error('P9 shadow falhou:',error.message);process.exitCode=1;
});
module.exports=Object.freeze({analyze,validateSample,safeOutput,APPROVED_REASONS});
