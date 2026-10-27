'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {load,validateCatalog,validateKnownDomains,selectForExploration,
  reportContract,fingerprint}=require('../scripts/p14-dataset-contract.js');
const {buildPage,getExplorationFixtures}=require('../scripts/p14-fixture-pages.js');
const {validateMeasurement,aggregate,fromP13Report,buildReport}
  =require('../scripts/p14-benchmark-contract.js');
function fresh(){
  return structuredClone(load().catalog);
}
test('P14: freeze 15 authored scenarios, 12 exploratory and 3 sealed by separate family',()=>{
  const catalog=fresh();
  assert.deepEqual(validateCatalog(catalog),{
    total:15,train:9,validation:3,holdout:3,families:15,holdoutLocked:true});
  const exploratory=selectForExploration(catalog);
  assert.equal(exploratory.length,12);
  assert.ok(exploratory.every(x=>x.split!=='holdout'));
  const families=new Set(exploratory.map(x=>x.family));
  assert.ok(catalog.fixtures.filter(x=>x.split==='holdout')
    .every(x=>!families.has(x.family)));
});
test('P14: reject contaminated labels, URLs, leaked splits and duplicate families',()=>{
  const contaminations=[
    c=>{c.fixtures[0].url='https://example.com/my-profile';},
    c=>{c.fixtures[0].text='private message';},
    c=>{c.fixtures[0].label='convert';},
    c=>{c.fixtures[0].split='holdout';},
    c=>{c.fixtures[0].family=c.fixtures[1].family;},
    c=>{c.fixtures[0].background='var(--personal)';},
    c=>{c.origin='collected-from-user-browsing';}
  ];
  for(const change of contaminations){
    const x=fresh();change(x);
    assert.throws(()=>validateCatalog(x),/P14:/);
  }
});
test('P14: known public sites can never be promoted to undisclosed blind holdout',()=>{
  const known=load().known;
  const entries=validateKnownDomains(known);
  assert.equal(entries.size,12);
  assert.ok(entries.has('docs.python.org'));
  assert.ok(entries.has('www.rfc-editor.org'));
  const bad=structuredClone(known);bad.domains[0].domain='my.personal/login?token=secret';
  assert.throws(()=>validateKnownDomains(bad),/P14:/);
});
test('P14: render fully offline exploration fixtures; never render holdout in CI',()=>{
  const samples=getExplorationFixtures();
  for(const row of samples){
    const html=buildPage(row);
    assert.match(html,/<!doctype html>/);
    assert.match(html,/window.__fixtureReady=true/);
    assert.doesNotMatch(html,/<script[^>]+src=/i);
    assert.doesNotMatch(html,/href="https?:\/\//i);
  }
  const holdout=fresh().fixtures.find(x=>x.split==='holdout');
  assert.throws(()=>buildPage(holdout),/sealed holdout/);
  assert.equal(samples.length,12);
});
test('P14: contract metrics cannot conceal missing data or false-safe contrast',()=>{
  const contract=reportContract();
  assert.equal(contract.knownDomains,12);
  assert.equal(contract.candidatePages,0);
  assert.equal(contract.realBlindHoldoutPages,0);
  assert.equal(contract.trainingDataReady,false);
  assert.equal(contract.benchmarkReady,false);
  assert.equal(contract.promotionEligible,false);
  assert.equal(contract.catalogDigest,fingerprint(fresh()));
  const ok={caseId:'canvas-shell',split:'train',model:'p13-rule-baseline',
    status:'safe-in-sample',source:'isolated-browser',auditedText:8,newWeak:0,
    restorationVerified:true,controlsChanged:0,durationMs:1.5};
  assert.equal(validateMeasurement(ok),true);
  assert.throws(()=>validateMeasurement({...ok,newWeak:1}),/cannot pass/);
  assert.throws(()=>validateMeasurement({...ok,restorationVerified:false}),/cannot pass/);
  assert.throws(()=>validateMeasurement({...ok,controlsChanged:1}),/cannot pass/);
  const missingControls={...ok};delete missingControls.controlsChanged;
  assert.throws(()=>validateMeasurement(missingControls),/cannot pass/);
  assert.throws(()=>validateMeasurement({...ok,cookie:'123'}),/private/);
  assert.throws(()=>validateMeasurement({...ok,url:'https://bad.test/'}),/private/);
  assert.throws(()=>validateMeasurement({...ok,durationMs:-1}),/invalid/);
});
test('P14: p95 is measured only on safe samples, no fabricated area coverage',()=>{
  const base={split:'validation',model:'p13-rule-baseline',
    source:'isolated-browser',status:'safe-in-sample',
    auditedText:10,newWeak:0,restorationVerified:true,controlsChanged:0};
  const result=aggregate([
    {...base,caseId:'case-a',durationMs:2,convertedSurfaces:2},
    {...base,caseId:'case-b',durationMs:8,convertedSurfaces:3},
    {...base,caseId:'case-c',durationMs:13,convertedSurfaces:2},
    {...base,caseId:'case-d',durationMs:23,convertedSurfaces:2},
  ]);
  assert.equal(result.durationMedianMs,8);
  assert.equal(result.durationP95Ms,23);
  assert.equal(result.measuredDarkFractionMedian,null);
  assert.equal(result.qualityGate,'not-evaluated');
  assert.equal(result.promotionEligible,false);
  assert.throws(()=>aggregate([
    {...base,caseId:'case-a',durationMs:2},
    {...base,caseId:'case-a',durationMs:8}]),/duplicate/);
});
test('P14: legacy P13 report is diagnostic only; 7D and P11 are NOT comparable',()=>{
  const report={kind:'p13-multi-surface-isolated-preview',scenarios:[
    {id:'project-board',source:'local-fixture',status:'safe-in-sample',
      candidates:2,planned:2,auditedText:10,newWeak:0,repairCount:9,
      restorationVerified:true},
    {id:'rfc-editor',source:'public-page',status:'inconclusive',
      candidates:0}
  ]};
  const summary=fromP13Report(report);
  assert.equal(summary.cases,2);
  assert.equal(summary.safe,1);
  assert.equal(summary.inconclusive,1);
  const built=buildReport(summary);
  assert.equal(built.matchedModelComparisonAvailable,false);
  assert.equal(built.models[0].status,'not-measured-on-matched-p14-fixtures');
  assert.equal(built.models[1].status,'not-measured-on-matched-p14-fixtures');
  assert.equal(built.promotionEligible,false);
  assert.equal(built.holdoutFixturesNotExecuted,3);
  assert.throws(()=>fromP13Report({kind:'fake',scenarios:[]}),/P14:/);
});
