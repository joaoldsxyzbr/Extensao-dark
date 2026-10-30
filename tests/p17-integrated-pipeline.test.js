'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planFixture,fixtureCandidate,FIXTURE_GRAPH,browserTrial}=
 require('../scripts/p17-integrated-pipeline.js');
const {KIND,infer,loadCandidate}=require('../content/region-ai.js');
const core=require('../vendor/neural_core/neural-core.js');
test('P17 integrated synthetic model produces only two safe proposed regions',()=>{
 const plan=planFixture();
 assert.deepEqual(plan,[
  {index:0,background:[5,5,5],foreground:[250,250,250]},
  {index:1,background:[5,5,5],foreground:[250,250,250]}
 ]);
 assert.equal(infer(FIXTURE_GRAPH,null).rows.every(r=>r.action==='abstain'),true);
 assert.equal(infer(FIXTURE_GRAPH,core,loadCandidate(core,fixtureCandidate()))
  .rows[3].reason,'unsafe-region');
});
test('P17 integrated fixture has no personal data, remote model, or release eligibility',()=>{
 const candidate=fixtureCandidate();
 assert.equal(candidate.kind,KIND);
 assert.equal(candidate.source,'synthetic-experimental-no-release');
 assert.doesNotMatch(JSON.stringify(FIXTURE_GRAPH),/https?:|cookie|inputValue|textContent|url/);
 assert.doesNotMatch(browserTrial.toString(),/fetch\(|localStorage|chrome\.storage/);
});
