'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessFormAppearance}=require('../scripts/p14-form-control-audit.js');
const sample=(background='rgb(240, 240, 240)',foreground='rgb(20, 20, 20)')=>({
  complete:true,rows:Array.from({length:2},()=>({
    background,foreground,border:'rgb(100, 100, 100)'}))
});
test('P14: genuinely legible recolored controls remain observations, never approvals',()=>{
  const result=assessFormAppearance(sample(),
    sample('rgb(24, 24, 24)','rgb(238, 238, 238)'));
  assert.equal(result.controlsSampled,2);
  assert.equal(result.controlsChanged,2);
  assert.equal(result.status,'legible-in-sample');
  assert.equal(result.focusMeasured,false);
  assert.equal(result.visualReview,false);
  assert.equal(result.promotionEligible,false);
});
test('P14: worsening contrast blocks automatic acceptance',()=>{
  const result=assessFormAppearance(sample(),
    sample('rgb(22, 22, 22)','rgb(60, 60, 60)'));
  assert.equal(result.status,'contrast-regression');
  assert.equal(result.reason,'new-control-text-contrast-below-threshold');
  assert.ok(result.minimumContrastAfter<4.5);
});
test('P14: unknown colors, transparency, missing controls and extra fields are inconclusive',()=>{
  const bad=[
    {complete:false,rows:[]},
    {...sample(),text:'secret'},
    {complete:true,rows:sample().rows.slice(0,1)},
    sample('rgba(240, 240, 240, 0.5)'),
    sample('var(--private-color)')
  ];
  for(const row of bad){
    assert.equal(assessFormAppearance(sample(),row).status,'inconclusive');
    assert.equal(assessFormAppearance(row,sample()).promotionEligible,false);
  }
});
test('P14: preexisting illegibility cannot count as improvement evidence',()=>{
  const result=assessFormAppearance(
    sample('rgb(22, 22, 22)','rgb(60, 60, 60)'),sample());
  assert.equal(result.status,'inconclusive');
  assert.equal(result.reason,'original-controls-below-threshold');
});
