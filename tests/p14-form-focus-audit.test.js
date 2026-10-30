'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessFormFocus}=require('../scripts/p14-form-focus-audit.js');
const fixture=(color='rgb(255, 255, 255)',parent='rgb(18, 18, 18)',width='3px',style='solid')=>({
  complete:true,rows:[0,1].map(()=>({focused:true,outlineWidth:width,
    outlineStyle:style,outlineColor:color,adjacentBackground:parent}))});
test('P14 focus: two accessible-looking outlines are observations, never approval',()=>{
  const before=fixture('rgb(240, 240, 240)','rgb(18, 18, 18)');
  const after=fixture('rgb(255, 255, 255)','rgb(18, 18, 18)');
  const x=assessFormFocus(before,after);
  assert.equal(x.status,'visible-in-sample');
  assert.equal(x.controlsMeasured,2);
  assert.equal(x.keyboardNavigationMeasured,false);
  assert.equal(x.promotionEligible,false);
});
test('P14 focus: missing outline or low contrast must require review',()=>{
  assert.equal(assessFormFocus(fixture(),fixture('rgb(255, 255, 255)','rgb(18, 18, 18)','0px','none')).reason,
    'focus-indicator-missing');
  const bad=assessFormFocus(fixture(),fixture('rgb(40, 40, 40)','rgb(18, 18, 18)'));
  assert.equal(bad.status,'needs-review');
  assert.equal(bad.reason,'focus-indicator-contrast-risk');
});
test('P14 focus: never count unknown, translucent or unfocused controls',()=>{
  const altered=[
    {...fixture(),url:'https://private.example/'},
    {...fixture(),complete:false},
    {...fixture(),rows:[fixture().rows[0]]},
    fixture('rgba(255, 255, 255, 0.5)'),
    fixture('rgb(255, 255, 255)','transparent'),
    {...fixture(),rows:fixture().rows.map(x=>({...x,focused:false}))}
  ];
  for(const x of altered){
    assert.equal(assessFormFocus(x,fixture()).status,'inconclusive');
    assert.equal(assessFormFocus(fixture(),x).promotionEligible,false);
  }
});
test('P14 focus: an outline that worsens but remains high enough is still a regression',()=>{
  const x=assessFormFocus(fixture('rgb(255, 255, 255)','rgb(18, 18, 18)'),
    fixture('rgb(184, 184, 184)','rgb(18, 18, 18)'));
  assert.equal(x.status,'needs-review');
  assert.equal(x.reason,'focus-indicator-contrast-risk');
});
