'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateLandmarks}=require('../scripts/p15-authored-pixel-oracle.js');
const {POINTS,BEFORE,PREVIEW,AFTER,phase,summarize,script}=
 require('../scripts/p18-pixel-rollback-browser.js');
const screenshot=()=>({kind:'p15-authored-screenshot-landmarks-v1',
  status:'matched',checks:3,matched:3,mismatches:0,
  independentVisualReview:false,promotionEligible:false});
const rollback={status:'rolled-back',restored:3,conflicts:1};
test('P18 screenshot milestones use 3 fixed, safe, synthetic points',()=>{
 assert.equal(POINTS.length,3);
 for(const p of [BEFORE,PREVIEW,AFTER])assert.deepEqual(validateLandmarks(p),p);
 assert.deepEqual(BEFORE.map(p=>p.expected),['bright','bright','bright']);
 assert.deepEqual(PREVIEW.map(p=>p.expected),['dark','dark','bright']);
 assert.deepEqual(AFTER.map(p=>p.expected),['bright','bright','bright']);
});
test('P18 has 9 required rendered-pixel matches, no release signal',()=>{
 const result=summarize(screenshot(),screenshot(),screenshot(),rollback);
 assert.equal(result.phases.preview.checks,3);
 assert.equal(result.promotionEligible,false);
 assert.equal(result.publicSitesEvaluated,false);
 assert.equal(result.areaCoverage,null);
});
test('P18 cannot count partial/promotion/incorrect rollback as passed',()=>{
 for(const wrong of [
  {status:'mismatch',matched:2,mismatches:1},
  {checks:2,matched:2},
  {independentVisualReview:true},{promotionEligible:true},
  {kind:'untrusted'}
 ])assert.throws(()=>phase('preview',{...screenshot(),...wrong}),/P18 pixel:/);
 for(const wrong of [{restored:2},{conflicts:0},{status:'failed'}])
  assert.throws(()=>summarize(screenshot(),screenshot(),screenshot(),
   {...rollback,...wrong}),/P18 pixel:/);
});
test('P18 script uses local CSS only with no content/telemetry calls',()=>{
 assert.match(script('apply'),/__p18Preview/);
 assert.match(script('rollback'),/rgb\(248, 239, 226\)/);
 assert.doesNotMatch(script('apply'),/fetch\(|XMLHttpRequest|chrome\.storage|document\.cookie/);
 assert.throws(()=>script('other'),/P18 pixel:/);
});
