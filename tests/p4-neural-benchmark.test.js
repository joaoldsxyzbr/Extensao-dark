'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {LIMITS,assessBudget}=require('../scripts/p4-neural-benchmark.js');
const valid={formatVersion:1,baselineMedianUs:4.5,candidateMedianUs:9,
 ratio:2,candidateBytes:5500,inputs:{baseline:7,candidate:18}};
test('P4: orçamento de inferência precisa confirmar custo e arquitetura',()=>{
 assert.equal(assessBudget(valid).pass,true);
 for(const variant of [
  {...valid,ratio:LIMITS.maxRelativeRatio+1},
  {...valid,candidateMedianUs:LIMITS.maxCandidateUs+1},
  {...valid,candidateBytes:LIMITS.maxModelBytes+1},
  {...valid,inputs:{baseline:7,candidate:17}},
  {...valid,ratio:NaN},
  {...valid,candidateMedianUs:-1},
  {}
 ])assert.equal(assessBudget(variant).pass,false);
});
