'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const {compareProposals,assertProposalRecord}
  =require('../scripts/p14-matched-proposals.js');
const {verifySampledRollback}=require('../scripts/p14-rollback-audit.js');

const rows=()=>[
  {index:0,background:'rgb(245, 245, 245)',foreground:'rgb(20, 20, 20)',
    width:500,height:300,leaf:false},
  {index:1,background:'rgb(25, 30, 35)',foreground:'rgb(230, 230, 230)',
    width:300,height:180,leaf:false}
];
const neural={MODEL:{input:7},probability:x=>x[0]>.5?.95:.2};
const planner=()=>[{index:0}];
const inputs={colors,neural,threshold:.8,planner};

test('P14 matched: compare same computed surface samples, votes only, no mutation',()=>{
  const source=rows(),before=structuredClone(source);
  const result=compareProposals(source,inputs);
  assert.deepEqual(source,before);
  assert.equal(result.inputSurfaces,2);
  assert.equal(result.p13Proposed,1);
  assert.equal(result.legacy7dWouldAccept,1);
  assert.equal(result.agreementOnP13,1);
  assert.equal(result.applied,false);
  assert.equal(result.modelComparisonMatched,false);
  assert.equal(result.promotionEligible,false);
  assert.equal(result.ancestorContext,'unknown-assumed-light');
  assert.equal(assertProposalRecord(result),true);
  assert.ok(!JSON.stringify(result).includes('background'));
});
test('P14 matched: absent P13 proposal does not fabricate comparable coverage',()=>{
  const result=compareProposals(rows(),{...inputs,planner:()=>[]});
  assert.equal(result.p13Proposed,0);
  assert.equal(result.legacy7dWouldAccept,1);
  assert.equal(result.agreementOnP13,0);
  assert.equal(result.modelComparisonMatched,false);
});
test('P14 matched: reject invalid predictions, model versions, samples and injected private fields',()=>{
  assert.throws(()=>compareProposals([],inputs),/P14:/);
  assert.throws(()=>compareProposals(rows(),{...inputs,threshold:.9}),/P14:/);
  assert.throws(()=>compareProposals(rows(),{...inputs,
    neural:{MODEL:{input:18},probability:()=>.95}}),/P14:/);
  assert.throws(()=>compareProposals(rows(),{...inputs,
    neural:{MODEL:{input:7},probability:()=>NaN}}),/P14:/);
  assert.throws(()=>compareProposals(rows(),{...inputs,
    planner:()=>[{index:0},{index:0}]}),/P14:/);
  const data=compareProposals(rows(),inputs);
  assert.throws(()=>assertProposalRecord({...data,url:'https://private.test'}),/P14:/);
  assert.throws(()=>assertProposalRecord({...data,agreementOnP13:2}),/P14:/);
});
const initialAudit=()=>({rows:[{fg:'rgb(15, 15, 15)',bg:'rgb(240, 240, 240)',
  size:16,weight:400,protected:false}],truncated:false});
const grid=()=>({gridPoints:96,valid:90,dark:0,bright:90,unknown:6});

test('P14 rollback: require equal original and restored computed CSS and viewport samples',()=>{
  const input={rollback:{ok:true},beforeAudit:initialAudit(),
    afterAudit:initialAudit(),beforeGrid:grid(),afterGrid:grid()};
  assert.equal(verifySampledRollback(input),true);
  assert.throws(()=>verifySampledRollback({...input,
    afterAudit:{...initialAudit(),rows:[{...initialAudit().rows[0],
      fg:'rgb(238, 238, 238)'}]}}),/computed text CSS/);
  assert.throws(()=>verifySampledRollback({...input,
    afterGrid:{...grid(),bright:89,dark:1}}),/viewport colors/);
  assert.throws(()=>verifySampledRollback({...input,
    rollback:{ok:false}}),/inline CSS/);
  assert.throws(()=>verifySampledRollback({...input,
    afterAudit:{rows:[],truncated:false}}),/missing or truncated/);
  assert.throws(()=>verifySampledRollback({...input,
    afterGrid:{...grid(),valid:89}}),/incomplete viewport/);
});
