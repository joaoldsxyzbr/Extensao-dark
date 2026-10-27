'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const {gateP13WithLegacy}=require('../scripts/p14-matched-proposals.js');
const {pairSyntheticModes}=require('../scripts/p14-pairing.js');
const samples=[
  {index:0,background:'rgb(245, 245, 245)',foreground:'rgb(20, 20, 20)',width:400,height:250,leaf:false},
  {index:1,background:'rgb(236, 236, 236)',foreground:'rgb(30, 30, 30)',width:250,height:110,leaf:false}
];
const neural={MODEL:{input:7},probability:x=>x[0]>.9?.95:.1};
const options={colors,neural,threshold:.8};
test('P14 gated paint: 7D only filters genuine P13 patches without inventing colors',()=>{
  const patches=[
    {index:0,source:samples[0].background,target:'rgb(26, 32, 40)'},
    {index:1,source:samples[1].background,target:'rgb(26, 32, 40)'}
  ];
  const original=structuredClone(patches);
  const result=gateP13WithLegacy(samples,patches,options);
  assert.deepEqual(patches,original);
  assert.equal(result.length,1);
  assert.strictEqual(result[0],patches[0]);
});
test('P14 gated paint: never invent fallback or permit invalid decisions/patches',()=>{
  const patches=[{index:0,source:samples[0].background,target:'rgb(26, 32, 40)'}];
  assert.deepEqual(gateP13WithLegacy(samples,[],options),[]);
  assert.throws(()=>gateP13WithLegacy(samples,
    [{...patches[0],index:2}],options),/P14:/);
  assert.throws(()=>gateP13WithLegacy(samples,
    [patches[0],patches[0]],options),/P14:/);
  assert.throws(()=>gateP13WithLegacy(samples,
    [{...patches[0],source:'rgb(1, 1, 1)'}],options),/P14:/);
  assert.throws(()=>gateP13WithLegacy(samples,patches,{...options,
    neural:{MODEL:{input:7},probability:()=>NaN}}),/P14:/);
  assert.throws(()=>gateP13WithLegacy(samples,patches,{...options,
    threshold:.9}),/P14:/);
});
const row=(caseId,mode,digest='a'.repeat(64))=>({
  caseId,split:'train',model:mode,source:'isolated-browser',
  status:'safe-in-sample',auditedText:10,newWeak:0,restorationVerified:true,
  darkAreaFraction:.7,baselineDigest:digest
});
test('P14 paired lab: compare only same scenario and identical baseline CSS',()=>{
  const a=row('canvas-shell','p13-rule-baseline');
  const b=row('canvas-shell','7d-gated-p13-lab');
  b.darkAreaFraction=.4;
  const report=pairSyntheticModes([a],[b]);
  assert.equal(report.kind,'p14-paired-synthetic-lab-not-legacy-runtime');
  assert.equal(report.matchedSyntheticCases,1);
  assert.equal(report.measuredPairs,1);
  assert.equal(report.cases[0].darkFractionP13,.7);
  assert.equal(report.cases[0].darkFractionGated,.4);
  assert.equal(report.cases[0].deltaGatedMinusP13,-.3);
  assert.equal(report.fullEngineComparisonAvailable,false);
  assert.equal(report.promotionEligible,false);
  assert.equal(JSON.stringify(report).includes('baselineDigest'),false);
});
test('P14 paired lab: no invented passing observation or cross-fixture comparisons',()=>{
  const a=row('canvas-shell','p13-rule-baseline');
  const b=row('canvas-shell','7d-gated-p13-lab');
  assert.throws(()=>pairSyntheticModes([a],[{...b,baselineDigest:'b'.repeat(64)}]),/P14:/);
  assert.throws(()=>pairSyntheticModes([a],[{...b,caseId:'other-case'}]),/P14:/);
  assert.throws(()=>pairSyntheticModes([a,a],[b,b]),/P14:/);
  const inconclusive={...b,status:'inconclusive',restorationVerified:null,
    newWeak:null,darkAreaFraction:null};
  const report=pairSyntheticModes([a],[inconclusive]);
  assert.equal(report.measuredPairs,0);
  assert.equal(report.cases[0].deltaGatedMinusP13,null);
  assert.equal(report.promotionEligible,false);
});
