#!/usr/bin/env node
'use strict';
// P14 experimental benchmark: same hand-authored CSS cases for 7D/P11/P13.
// Outputs are ONLY synthetic indicators; never production/real-site claims.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {loadCandidate,featuresFor,predictText}=require('../training/p11-descendant-runtime.js');
const {planIslands}=require('./p13-islands.js');

const ROOT=path.resolve(__dirname,'..');
const CORPUS=path.join(ROOT,'training/datasets/p14-baseline-v1.json');
const OUTPUT=path.join(ROOT,'browser-results/p14-benchmark/report.json');
const SPLITS=Object.freeze(['train','validation','diagnostic']);
const ROLES=new Set(['canvas','card','navigation','content','control','badge','media']);
const ALLOWED_ROW=new Set(['id','family','split','role','background','foreground','ancestor',
  'width','height','fontSize','fontWeight','isLink','control','selected','hasImage',
  'protected','expectedAction']);
const cleanHostname=host=>{
  if(typeof host!=='string'||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host)||
    host.length>253)throw TypeError('P14: invalid hostname');
  return host.replace(/^www\./,'');
};
function validateCorpus(doc){
  if(!doc||doc.schemaVersion!==1||
    doc.origin!=='p14-authored-css-scenarios-no-browser-user-data'||
    !doc.finalBlind||doc.finalBlind.status!=='not-collected'||
    doc.finalBlind.allowedForTuning!==false||
    !Array.isArray(doc.finalBlind.domains)||doc.finalBlind.domains.length||
    !Array.isArray(doc.finalBlind.pages)||doc.finalBlind.pages.length||
    !Array.isArray(doc.knownPublicDiagnostics)||doc.knownPublicDiagnostics.length<12||
    !doc.splits||!Array.isArray(doc.scenarios)||doc.scenarios.length<12)
    throw TypeError('P14: corpus contract invalid or final blind exposed');
  const seenHost=new Set();
  for(const entry of doc.knownPublicDiagnostics){
    if(!entry||Object.keys(entry).sort().join(',')!=='firstUsedPhase,hostname,status'||
      entry.status!=='known-not-blind'||!/^P[0-9]+$/.test(entry.firstUsedPhase))
      throw TypeError('P14: bad diagnostic entry');
    const host=cleanHostname(entry.hostname);
    if(seenHost.has(host))throw TypeError('P14: duplicate known domain');
    seenHost.add(host);
  }
  const familySplit=new Map(),allFamilies=new Set();
  for(const split of SPLITS){
    const groups=doc.splits[split];
    if(!Array.isArray(groups)||groups.length<1)throw TypeError('P14: empty split');
    for(const name of groups){
      if(typeof name!=='string'||!/^[a-z-]+$/.test(name)||
        familySplit.has(name))throw TypeError('P14: leakage between families');
      familySplit.set(name,split);allFamilies.add(name);
    }
  }
  if(Object.keys(doc.splits).sort().join(',')!=='diagnostic,train,validation')
    throw TypeError('P14: split definition changed');
  const usedIds=new Set(),usedFeatures=new Set();
  for(const row of doc.scenarios){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       Object.keys(row).some(key=>!ALLOWED_ROW.has(key))||
       Object.keys(row).length!==ALLOWED_ROW.size)
      throw TypeError('P14: unknown/private CSS field');
    if(typeof row.id!=='string'||!/^[a-z-]+$/.test(row.id)||
      usedIds.has(row.id)||!ROLES.has(row.role)||
      familySplit.get(row.family)!==row.split||
      !['convert','preserve'].includes(row.expectedAction)||
      typeof row.protected!=='boolean'||(row.protected&&row.expectedAction!=='preserve'))
      throw TypeError('P14: invalid synthetic scenario or split leakage');
    usedIds.add(row.id);
    for(const key of ['background','foreground','ancestor']){
      const value=colors.parseColor(row[key]);
      if(!value||value.a!==1)throw TypeError('P14: non-opaque colors not accepted');
    }
    for(const key of ['width','height','fontSize','fontWeight'])
      if(!Number.isFinite(row[key])||row[key]<=0||row[key]>3000)
        throw TypeError('P14: invalid geometric/typographic feature');
    for(const key of ['isLink','control','selected','hasImage'])
      if(typeof row[key]!=='boolean')throw TypeError('P14: invalid boolean');
    const signature=[row.background,row.foreground,row.ancestor,row.width,row.height,
      row.fontSize,row.fontWeight,row.isLink,row.control,row.selected,row.hasImage].join('/');
    if(usedFeatures.has(signature))throw TypeError('P14: duplicate CSS vector across groups');
    usedFeatures.add(signature);
  }
  for(const fam of allFamilies)
    if(!doc.scenarios.some(row=>row.family===fam))throw TypeError('P14: empty family');
  return {knownDomains:seenHost.size,examples:usedIds.size,
    familyCount:allFamilies.size,finalBlindCollected:0};
}
function modelActions(doc,baseline,p11){
  validateCorpus(doc);
  if(!baseline||baseline.inputSize!==7||baseline.outputSize!==1||
     !p11||p11.inputSize!==12||p11.outputSize!==3)
    throw TypeError('P14: incompatible model dimensions');
  const outcome=[];
  for(const row of doc.scenarios){
    const bg=colors.parseColor(row.background),fg=colors.parseColor(row.foreground),
      ancestor=colors.parseColor(row.ancestor);
    const features=colors.neuralFeatures(bg,fg,ancestor,
      {control:row.control,selected:row.selected});
    const score=core.predict(baseline,features)[0];
    if(!Number.isFinite(score))throw TypeError('P14: bad 7D probability');
    const protectedStyle=row.control||row.selected||row.hasImage||
      colors.isVividAccent(bg)||row.protected;
    const context={action:!protectedStyle&&colors.luminance(bg)>=.17?
      'convert':'preserve',kind:row.hasImage?'graphic':'surface',
      control:row.control,selected:row.selected,masked:row.hasImage,
      backgroundImage:row.hasImage,nativeDark:colors.isNativeDarkSurface(
        row.background,row.foreground)};
    const p7=colors.neuralDecision(score,context,7);
    const score7=Boolean(p7.convert&&colors.mapBackground(bg,'deep',true));
    let p13=false,p11Outcome='not-applicable',weakText=false;
    let proposed=null;
    if(!protectedStyle){
      const samples=[{index:0,background:row.background,width:row.width,
        height:row.height,leaf:true,foreground:row.foreground}];
      const planned=planIslands(samples);
      if(planned.length){
        p13=true;proposed=planned[0].target;
        const dest=colors.parseColor(proposed),limit=row.fontSize>=24||
          row.fontSize>=18.66&&row.fontWeight>=700?3:4.5;
        const prediction=predictText(core,p11,featuresFor(colors,{
          background:proposed,text:row.foreground,sourceBackground:row.background,
          isLink:row.isLink,isLarge:limit===3,explicitColor:true
        }),colors);
        p11Outcome=prediction.action;
        const corrected=prediction.action==='suggest'?prediction.color:
          colors.ensureContrast(fg,dest,limit);
        const out=colors.parseColor(corrected||row.foreground);
        weakText=!out||colors.contrastRatio(out,dest)+.0001<limit;
      }
    }
    outcome.push({id:row.id,family:row.family,split:row.split,
      expectedAction:row.expectedAction,area:row.width*row.height,
      model7DConvert:score7,p13Convert:p13,p11Action:p11Outcome,
      predictedBackground:proposed,unsafeSample:weakText});
  }
  return outcome;
}
function summarize(rows){
  const result={};
  for(const split of SPLITS){
    const pool=rows.filter(r=>r.split===split);
    if(!pool.length)throw TypeError('P14: empty split in outputs');
    const positives=pool.filter(r=>r.expectedAction==='convert');
    const protectedCases=pool.filter(r=>r.expectedAction==='preserve');
    let areaEligible=0,area7D=0,areaP13=0;
    for(const row of positives){
      areaEligible+=row.area;
      if(row.model7DConvert)area7D+=row.area;
      if(row.p13Convert)areaP13+=row.area;
    }
    const stats=key=>({
      approved:pool.filter(r=>r[key]).length,
      falsePositives:protectedCases.filter(r=>r[key]).length,
      missedEligible:positives.filter(r=>!r[key]).length,
      eligibleSyntheticAreaFraction:Number((key==='model7DConvert'?area7D:areaP13)/
        (areaEligible||1)).toFixed(4)
    });
    result[split]={examples:pool.length,eligible:positives.length,
      protected:protectedCases.length,model7D:stats('model7DConvert'),
      p13:stats('p13Convert'),
      p11:{opportunities:pool.filter(r=>r.p11Action!=='not-applicable').length,
        proposedSafe:pool.filter(r=>r.p11Action==='suggest').length,
        rejectedToFallback:pool.filter(r=>r.p11Action==='reject').length},
      sampleWeak:pool.filter(r=>r.unsafeSample).length};
  }
  return result;
}
function main(){
  const source=fs.readFileSync(CORPUS);
  const doc=JSON.parse(source);
  const validity=validateCorpus(doc);
  const candidatePath=path.join(ROOT,'data/p11-descendant-ci-candidate.json');
  if(!fs.existsSync(candidatePath))
    throw Error('P14: candidate P11 unavailable; train it before running benchmark');
  const baseline=core.loadModel(JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-model.json'),'utf8')));
  const candidate=loadCandidate(core,JSON.parse(fs.readFileSync(candidatePath,'utf8')));
  const start=performance.now();
  const rows=modelActions(doc,baseline,candidate);
  const durationMs=Number((performance.now()-start).toFixed(3));
  const metrics=summarize(rows);
  const report={
    schemaVersion:1,kind:'p14-synthetic-css-common-benchmark',
    source:'hand-authored-not-real-websites',
    modelRoles:{model7D:'surface-action',p13:'deterministic-surface-action',
      p11:'foreground-only-conditionally-on-p13'},
    realWebsitesTested:0,blindFinalPagesTested:0,
    promotionEligible:false,readyForRelease:false,
    fairnessWarning:'7D and P13 decide surfaces; P11 predicts text only. No ranking across these roles.',
    corpusSha256:crypto.createHash('sha256').update(source).digest('hex'),
    validity,metrics,diagnosticTimingMs:durationMs,
    timingWarning:'single Node.js process; not a browser p95/CPU benchmark'
  };
  assert.equal(rows.length,doc.scenarios.length);
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log('P14 baseline '+JSON.stringify({validity,metrics,
    realWebsitesTested:0,promotionEligible:false}));
}
if(require.main===module)main();
module.exports=Object.freeze({validateCorpus,modelActions,summarize,SPLITS});
