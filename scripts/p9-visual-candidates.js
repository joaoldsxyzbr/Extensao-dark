#!/usr/bin/env node
'use strict';
// P9: renderizacao experimental em Chromium descartavel; NAO integra a extensao distribuida.
// Usa apenas paginas PUBLICAS e CSS computado, sem ler textos, valores de formularios ou cookies.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,sleep,ROOT}=require('./browser-e2e.js');
const {chooseSites,isAllowedLanding}=require('./real-site-audit.js');
const {VISUAL_EXPRESSION}=require('./p9-live-feature-snapshot.js');
const {EXPRESSION:CONTRAST_EXPRESSION,summarize}=require('./real-site-snapshot.js');
const {validateSample}=require('./p9-real-site-shadow.js');
const {repairDescendantText}=require('./p10-descendant-color.js');
const COLOR_SOURCE=fs.readFileSync(path.join(ROOT,'content/colors.js'),'utf8');
const {decode:decodeP7}=require('../training/neural-color-runtime.js');
const {loadCandidate,predictColors}=require('../training/neural-color-p8-runtime.js');

const OUTPUT_ROOT=path.join(ROOT,'browser-results');
const DEFAULT_OUTPUT=path.join(OUTPUT_ROOT,'p9-rendered-candidates');
const siteArg=process.argv.find(arg=>arg.startsWith('--sites='));
const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
const SITES=chooseSites(siteArg?.slice('--sites='.length)||'example,wikipedia,mdn,github');
const OUTPUT=path.resolve(outputArg?.slice('--output='.length)||DEFAULT_OUTPUT);

function outputFolder(destination){
  const folder=path.resolve(destination);
  if(!folder.startsWith(OUTPUT_ROOT+path.sep)||folder===OUTPUT_ROOT)
    throw new TypeError('P9: capturas fora de browser-results bloqueadas');
  return folder;
}

// Esta visualizacao conservadora nao e a integracao completa dos candidatos no runtime MV3.
// Rejeita elementos protegidos, cores ilegiveis e saidas neuralmente invalidas.
function buildPlan(samples,predict){
  if(!Array.isArray(samples)||samples.length>140||!samples.every(validateSample)||
     typeof predict!=='function')throw new TypeError('P9: vetor visual invalido');
  const operations=[],stats={
    sampled:samples.length,protected:0,modelConversions:0,guarded:0,
    preserved:0,lowContrastRejected:0,protectionRejected:0
  };
  for(let index=0;index<samples.length;index++){
    const sample=samples[index];
    const result=predict(sample.x);
    if(!result||!['convert','preserve'].includes(result.action)||
      !Number.isFinite(result.confidence)||result.confidence<0||result.confidence>1)
      throw new TypeError('P9: resposta neural invalida');
    if(sample.reasons.length)stats.protected++;
    if(result.action==='preserve'){stats.preserved++;continue;}
    stats.modelConversions++;
    if(sample.reasons.length){stats.protectionRejected++;continue;}
    const bg=colors.parseColor(result.background),fg=colors.parseColor(result.color);
    if(!bg||!fg||bg.a!==1||fg.a!==1)
      throw new TypeError('P9: cores RGB invalidas');
    if(colors.contrastRatio(bg,fg)<4.5){stats.lowContrastRejected++;continue;}
    operations.push({index,background:result.background,color:result.color});
  }
  stats.guarded=operations.length;
  return {operations,stats};
}

// Medicoes aproximadas em CSS computado, nao um veredito visual automatizado.
function reviewContrast(baseline,candidate){
  const counts=[baseline,candidate].every(item=>item&&
    Number.isSafeInteger(item.sampledText)&&Number.isSafeInteger(item.weakText)&&
    item.sampledText>0&&item.weakText>=0&&item.weakText<=item.sampledText);
  if(!counts)return {status:'inconclusive',reason:'contrast-samples-unavailable'};
  const difference=candidate.weakText-baseline.weakText;
  const oldRate=baseline.weakText/baseline.sampledText;
  const newRate=candidate.weakText/candidate.sampledText;
  return {status:difference>=2&&newRate>oldRate+.03?'needs-review':'observed-no-clear-regression',
    baselineWeakText:baseline.weakText,baselineSampledText:baseline.sampledText,
    candidateWeakText:candidate.weakText,candidateSampledText:candidate.sampledText,
    note:'Amostra CSS, nao certificacao WCAG nem comparacao visual humana'};
}

// Gate fail-closed. A cor aprovada para o elemento nao garante contraste nos
// filhos: cada modificacao deve ser medida na arvore real antes da captura.
function contrastSafety(before,after){
  const valid=row=>row&&['sampledText','weakText','maskedIcons','weakIcons']
    .every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)&&
    row.sampledText>0&&row.weakText<=row.sampledText&&
    row.weakIcons<=row.maskedIcons;
  if(!valid(before)||!valid(after))
    return {safe:false,reason:'contrast-observation-invalid'};
  if(before.sampledText!==after.sampledText||
     before.maskedIcons!==after.maskedIcons)
    return {safe:false,reason:'css-sample-count-changed'};
  if(after.weakText>before.weakText||after.weakIcons>before.weakIcons)
    return {safe:false,reason:'descendant-contrast-regression',
      extraWeakText:after.weakText-before.weakText,
      extraWeakIcons:after.weakIcons-before.weakIcons};
  return {safe:true,reason:'no-observed-contrast-regression'};
}

// Executa cada hipotese em pagina isolada, restaurando-a pelo callback de
// sondagem. Nao ajusta parametros da rede nem usa os sites como dados de treino.
async function selectSafeOperations(operations,baseline,probe){
  if(!Array.isArray(operations)||operations.length>140||
    typeof probe!=='function')throw new TypeError('P9: preflight invalido');
  if(!contrastSafety(baseline,baseline).safe)
    return {safe:false,reason:'baseline-inconclusive',operations:[],
      descendantContrastRejected:0,combinedContrastRejected:0};
  const approved=[];
  let descendantContrastRejected=0;
  for(const operation of operations){
    const observed=await probe([operation]);
    if(contrastSafety(baseline,observed).safe)approved.push(operation);
    else descendantContrastRejected++;
  }
  // Conversoes isoladamente seguras podem interferir umas nas outras.
  const combined=contrastSafety(baseline,await probe(approved));
  return {safe:combined.safe,reason:combined.reason,
    operations:combined.safe?approved:[],
    descendantContrastRejected,
    combinedContrastRejected:combined.safe?0:approved.length};
}

// Executado SOMENTE dentro de uma aba efemera de Chromium sem extensao instalada.
// Referencias aos elementos e estado original ficam somente na memoria da pagina.
function renderVisualPage(action,operations=[],colorTools,repairText){
  const key='__extDarkP9VisualNodes',backupKey='__extDarkP9SavedStyles';
  const nodes=globalThis[key];
  if(!Array.isArray(nodes)||nodes.length>140)throw Error('P9: handles do DOM ausentes');
  if(action==='apply'){
    if(Object.prototype.hasOwnProperty.call(globalThis,backupKey))
      throw Error('P9: modo visual ativo; restaure antes');
    if(!Array.isArray(operations)||operations.length>140)throw Error('P9: plano invalido');
    const seen=new Set(),backup=[];
    const saved=new Set();
    const saveOriginal=el=>{
      if(saved.has(el))return;
      saved.add(el);
      backup.push({el,background:el.style.getPropertyValue('background-color'),
        backgroundPriority:el.style.getPropertyPriority('background-color'),
        color:el.style.getPropertyValue('color'),
        colorPriority:el.style.getPropertyPriority('color')});
    };
    for(const op of operations){
      if(!op||!Number.isSafeInteger(op.index)||op.index<0||op.index>=nodes.length||
        seen.has(op.index)||typeof op.background!=='string'||typeof op.color!=='string'||
        !/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(op.background)||
        !/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(op.color)||
        !nodes[op.index]?.isConnected||
        (op.repairDescendants!==undefined&&typeof op.repairDescendants!=='boolean'))
        throw Error('P9: operacao visual invalida');
      seen.add(op.index);
      saveOriginal(nodes[op.index]);
    }
    Object.defineProperty(globalThis,backupKey,{value:backup,configurable:true});
    let descendantRepairs=0;
    for(const op of operations){
      const el=nodes[op.index];
      el.style.setProperty('background-color',op.background,'important');
      el.style.setProperty('color',op.color,'important');
    }
    for(const op of operations){
      if(!op.repairDescendants)continue;
      if(!colorTools||typeof repairText!=='function')
        throw Error('P10: reparo contextual indisponivel');
      const result=repairText(nodes[op.index],colorTools,saveOriginal);
      descendantRepairs+=result.repaired;
    }
    return {applied:operations.length,descendantRepairs};
  }
  if(action==='restore'){
    const backup=globalThis[backupKey];
    if(!Array.isArray(backup))throw Error('P9: nenhum estilo para restaurar');
    for(const saved of backup){
      for(const [name,value,priority] of [
        ['background-color',saved.background,saved.backgroundPriority],
        ['color',saved.color,saved.colorPriority]
      ]){
        if(value)saved.el.style.setProperty(name,value,priority);
        else saved.el.style.removeProperty(name);
      }
    }
    let mismatch=0;
    for(const saved of backup){
      if(saved.el.style.getPropertyValue('background-color')!==saved.background||
        saved.el.style.getPropertyPriority('background-color')!==saved.backgroundPriority||
        saved.el.style.getPropertyValue('color')!==saved.color||
        saved.el.style.getPropertyPriority('color')!==saved.colorPriority)mismatch++;
    }
    delete globalThis[backupKey];
    return {restored:backup.length,mismatch};
  }
  if(action==='close'){
    if(Object.prototype.hasOwnProperty.call(globalThis,backupKey))
      throw Error('P9: restaure os estilos antes de encerrar');
    delete globalThis[key];
    return {closed:true};
  }
  throw Error('P9: acao visual desconhecida');
}
const command=(action,operations)=>
  '(()=>{const module={exports:{}};\n'+COLOR_SOURCE+
  '\nreturn ('+renderVisualPage.toString()+')('+JSON.stringify(action)+','+
  JSON.stringify(operations||[])+',module.exports,('+repairDescendantText.toString()+'));})()';

async function inspect(site,models){
  let browser,restoreRequired=false;
  try{
    browser=await launch(null);
    await browser.page.navigate(site.url,{fixtureReady:false});
    const landing=await browser.page.eval('location.origin + "/"');
    if(!isAllowedLanding(site,landing))
      return {site:site.id,status:'inconclusive',reason:'landing-outside-allowlist'};
    await sleep(650);
    const observed=await browser.page.eval(VISUAL_EXPRESSION);
    if(!observed||!Array.isArray(observed.samples)||
      observed.samples.length<Math.min(8,site.minSamples)||
      observed.samples.length>140||!observed.samples.every(validateSample))
      return {site:site.id,status:'inconclusive',reason:'insufficient-css-samples'};
    const snapshots={},modelsReport={};
    // Mesma pagina carregada: comparar original com renderizacoes P7 e P8,
    // restaurando exatamente os estilos inline antes de mudar de candidato.
    await browser.page.screenshot(path.join(OUTPUT,site.id+'-original.png'));
    snapshots.original=site.id+'-original.png';
    const baselineContrast=summarize(await browser.page.eval(CONTRAST_EXPRESSION));
    for(const name of ['p7','p8']){
      const plan=buildPlan(observed.samples,models[name]);
      // Cada sonda e uma transacao: aplica, mede CSS computado, restaura.
      const probe=async operations=>{
        const trial=await browser.page.eval(command('apply',operations));
        restoreRequired=true;
        try{
          assert.equal(trial.applied,operations.length);
          return summarize(await browser.page.eval(CONTRAST_EXPRESSION));
        }finally{
          const restored=await browser.page.eval(command('restore'));
          restoreRequired=false;
          assert.equal(restored.restored,trial.applied,'P9: preflight nao restaurou CSS');
          assert.equal(restored.mismatch,0,'P9: CSS divergente apos preflight');
        }
      };
      const jointOps=plan.operations.map(operation=>({...operation,repairDescendants:true}));
      const checked=await selectSafeOperations(jointOps,baselineContrast,probe);
      plan.stats.descendantContrastRejected=checked.descendantContrastRejected;
      plan.stats.combinedContrastRejected=checked.combinedContrastRejected;
      plan.stats.guarded=checked.operations.length;
      plan.stats.preflight=checked.reason;
      if(!checked.safe)return {site:site.id,status:'inconclusive',
        reason:'contrast-preflight-inconclusive'};
      const applied=await browser.page.eval(command('apply',checked.operations));
      plan.stats.descendantRepairs=applied.descendantRepairs;
      restoreRequired=true;
      try{
        assert.equal(applied.applied,checked.operations.length);
        const measured=summarize(await browser.page.eval(CONTRAST_EXPRESSION));
        const safe=contrastSafety(baselineContrast,measured);
        // Nao gerar captura como aprovada se a pagina mudou entre ensaio e aplicacao.
        if(!safe.safe)throw Error('P9: rechecagem do contraste falhou: '+safe.reason);
        await sleep(100);
        await browser.page.screenshot(path.join(OUTPUT,site.id+'-'+name+'-rendered.png'));
        snapshots[name]=site.id+'-'+name+'-rendered.png';
        plan.stats.contrastReview=reviewContrast(baselineContrast,measured);
      }finally{
        const restored=await browser.page.eval(command('restore'));
        restoreRequired=false;
        assert.equal(restored.restored,applied.applied,'P9: estilos nao restaurados');
        assert.equal(restored.mismatch,0,'P9: estilos inline divergentes apos restaurar');
      }
      modelsReport[name]=plan.stats;
    }
    await browser.page.eval(command('close'));
    const quality=Object.values(modelsReport).some(model=>
      model.descendantContrastRejected>0||model.combinedContrastRejected>0||
      model.contrastReview?.status==='needs-review')
      ?'needs-review':Object.values(modelsReport).some(model=>model.contrastReview?.status==='inconclusive')
      ?'inconclusive':'observed-no-clear-regression';
    return {site:site.id,status:'observed',quality,sampled:observed.samples.length,
      models:modelsReport,screenshots:snapshots,restorationVerified:true};
  }catch(error){
    if(error instanceof TypeError||error.code==='ERR_ASSERTION')throw error;
    // Falha de site, CDP ou captura nao deve equivaler a aprovacao.
    return {site:site.id,status:'inconclusive',reason:'browser-or-capture-error'};
  }finally{
    if(browser){
      if(restoreRequired){
        try{await browser.page.eval(command('restore'));}catch{}
      }
      await browser.stop();
    }
  }
}
async function main(){
  outputFolder(OUTPUT);
  fs.mkdirSync(OUTPUT,{recursive:true});
  const p7=core.loadModel(JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-ci-candidate.json'),'utf8')));
  const p8=loadCandidate(core,JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-p8-ci-candidate.json'),'utf8')));
  assert.equal(p7.inputSize,57);
  const models={p7:x=>decodeP7(core,p7,x),p8:x=>predictColors(core,p8,x)};
  const report={
    formatVersion:1,kind:'p9-isolated-rendering-not-integrated-extension',
    promotionEligible:false,readyForRelease:false,modelsDeployed:false,noPersonalData:true,
    note:'Rendering em Chromium efemero sem a extensao. Opera somente em elementos aprovados por gates de seguranca. Capturas de telas publicas; avaliacao humana obrigatoria. Nao equivale ao runtime MV3.',
    results:[]
  };
  for(const site of SITES){
    const r=await inspect(site,models);
    report.results.push(r);
    fs.writeFileSync(path.join(OUTPUT,'visual-comparison.json'),JSON.stringify(report,null,2)+'\n');
    console.log('P9 visual',r.site,r.status,
      r.status==='observed'?JSON.stringify({sampled:r.sampled,
        p7:r.models.p7.guarded,p8:r.models.p8.guarded,
        restored:r.restorationVerified}):r.reason);
  }
  report.completed=true;
  report.observed=report.results.filter(row=>row.status==='observed').length;
  report.inconclusive=report.results.length-report.observed;
  report.needsReview=report.results.filter(row=>row.quality==='needs-review').length;
  fs.writeFileSync(path.join(OUTPUT,'visual-comparison.json'),JSON.stringify(report,null,2)+'\n');
  if(report.observed===0)throw Error('P9: nenhuma pagina renderizada — inconclusivo');
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=['### P9 — capturas experimentais P7/P8 em paginas publicas','',
      '| Site | Resultado | Revisao de contraste | P7 estilizados | P8 estilizados | Restauracao |',
      '|---|---|---|---:|---:|---|',
      ...report.results.map(r=>'| '+r.site+' | '+r.status+' | '+(r.quality??'—')+' | '+
        (r.models?.p7.guarded??'—')+' | '+(r.models?.p8.guarded??'—')+' | '+
        (r.restorationVerified?'ok':'inconclusiva')+' |'),'',
      '**Revisao humana obrigatoria:** capturas apenas de uma parcela do DOM; nao e extensao MV3 integrada nem autorizacao de promocao.',''];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  }
  console.log('P9 visual summary',JSON.stringify({observed:report.observed,
    inconclusive:report.inconclusive,needsReview:report.needsReview,promotionEligible:false}));
}
if(require.main===module)main().catch(err=>{
  console.error('P9 visual falhou:',err.message);process.exitCode=1;
});
module.exports=Object.freeze({buildPlan,renderVisualPage,outputFolder,command,inspect,reviewContrast,contrastSafety,selectSafeOperations});
