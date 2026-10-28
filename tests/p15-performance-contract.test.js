'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeP15Performance}=require('../scripts/p15-performance-contract.js');
function sample(first,second,compare,wall,status='stable-in-sample'){
  return {firstCaptureMs:first,secondCaptureMs:second,
    compareMs:compare,totalWallMs:wall,status};
}
test('P15: report observed capture and comparison latency without promotion',()=>{
  const result=summarizeP15Performance([
    sample(1,2,.5,65),
    sample(2,3,.8,66,'inconclusive'),
    sample(3,4,1,67),
    sample(4,5,1.5,68)
  ],4);
  assert.equal(result.kind,'p15-css-capture-cost-v1');
  assert.equal(result.status,'measured-exploratory');
  assert.equal(result.exploratoryCases,4);
  assert.equal(result.measuredCases,4);
  assert.equal(result.incompleteCases,0);
  assert.equal(result.inconclusiveStabilityCases,1);
  assert.deepEqual(result.firstCaptureMs,{p50:2,p95:4,max:4});
  assert.deepEqual(result.secondCaptureMs,{p50:3,p95:5,max:5});
  assert.deepEqual(result.compareMs,{p50:.8,p95:1.5,max:1.5});
  assert.deepEqual(result.totalWallMs,{p50:66,p95:68,max:68});
  assert.equal(result.applied,false);
  assert.equal(result.trained,false);
  assert.equal(result.promotionEligible,false);
  assert.equal(result.independentVisualReview,false);
  assert.equal('performancePassed' in result,false);
});
test('P15: all missing measurements remain inconclusive, never zero-cost',()=>{
  const report=summarizeP15Performance([
    {firstCaptureMs:null,secondCaptureMs:null,
      compareMs:null,totalWallMs:null,status:'inconclusive'}
  ],3);
  assert.equal(report.status,'inconclusive');
  assert.equal(report.measuredCases,0);
  assert.equal(report.incompleteCases,3);
  assert.equal(report.firstCaptureMs,null);
  assert.equal(report.totalWallMs,null);
  assert.equal(report.promotionEligible,false);
});
test('P15: mixed missing measurements report counts, no invented percentile',()=>{
  const report=summarizeP15Performance([
    sample(2,4,1,72),
    {firstCaptureMs:null,secondCaptureMs:null,
      compareMs:null,totalWallMs:null,status:'inconclusive'}
  ],3);
  assert.equal(report.status,'inconclusive');
  assert.equal(report.measuredCases,1);
  assert.equal(report.incompleteCases,2);
  assert.deepEqual(report.firstCaptureMs,{p50:2,p95:2,max:2});
  assert.equal(report.inconclusiveStabilityCases,1);
});
test('P15: refuse unbounded, private or invalid benchmark data',()=>{
  const bad=[
    [sample(-1,2,3,70)],[sample(Infinity,2,3,70)],
    [sample(NaN,2,3,70)],[sample(1,2,3,120001)],
    [{...sample(1,2,3,70),url:'private'}],
    [{...sample(1,2,3,70),status:'approved'}],
    [{firstCaptureMs:1,secondCaptureMs:2,compareMs:3,
      totalWallMs:null,status:'inconclusive'}]
  ];
  for(const samples of bad)
    assert.throws(()=>summarizeP15Performance(samples,1),/P15:/);
  assert.throws(()=>summarizeP15Performance([],0),/P15:/);
  assert.throws(()=>summarizeP15Performance([],13),/P15:/);
  assert.throws(()=>summarizeP15Performance(Array(13).fill(sample(1,2,3,6)),12),/P15:/);
});
