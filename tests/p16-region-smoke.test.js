'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeDataset}=require('../scripts/p16-build-demo.js');
const {verify}=require('../scripts/p16-verify-parity.js');
test('P16 authored synthetic train and validation sets are disjoint',()=>{
 const rows=makeDataset().samples;
 assert.equal(rows.length,32);
 assert.equal(rows.filter(x=>x.decision===1).length,8);
 assert.equal(rows.filter(x=>x.split==='holdout').length,0);
 assert.equal(new Set(rows.map(x=>JSON.stringify(x.x))).size,32);
});
test('P16 parity refuses promotion claims',()=>{
 assert.throws(()=>verify(makeDataset(),
  {source:'synthetic-experimental-no-release'},
  {kind:'p16-synthetic-parity-v1',promotionEligible:true}));
});
