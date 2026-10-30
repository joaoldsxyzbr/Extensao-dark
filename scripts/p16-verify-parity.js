#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../vendor/neural_core/neural-core.js');
const {loadCandidate}=require('../content/region-ai.js');
function verify(data,candidate,report){
 assert.equal(candidate.source,'synthetic-experimental-no-release');
 assert.equal(report.kind,'p16-synthetic-parity-v1');
 for(const key of ['humanLabels','holdoutEvaluated','p14HoldoutAccessed','promotionEligible'])
  assert.equal(report[key],false);
 const val=data.samples.filter(r=>r.split==='validation');
 assert.equal(val.length,8);
 assert.equal(report.predictions.length,8);
 const model=loadCandidate(core,candidate);
 for(let i=0;i<8;i++){
  assert.equal(val[i].id,report.predictions[i].id);
  const predicted=core.predict(model.decision,val[i].x)[0];
  const palette=core.predict(model.palette,val[i].x);
  assert.ok(Math.abs(predicted-report.predictions[i].decision)<1e-4);
  for(let j=0;j<6;j++)assert.ok(
   Math.abs(palette[j]-report.predictions[i].palette[j])<1e-4);
 }
 return {kind:'p16-python-js-parity',checked:8,promotionEligible:false};
}
if(require.main===module){
 if(process.argv.length!==2)throw Error('P16: no arbitrary paths');
 const load=name=>JSON.parse(fs.readFileSync(
  path.join(__dirname,'../data',name),'utf8'));
 console.log(JSON.stringify(verify(load('p16-demo-ci-data.json'),
  load('p16-demo-ci-candidate.json'),load('p16-demo-ci-report.json'))));
}
module.exports=Object.freeze({verify});
