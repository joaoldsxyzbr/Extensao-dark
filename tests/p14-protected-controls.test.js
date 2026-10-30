'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {captureProtectedControls,countProtectedControlChanges}=
  require('../scripts/p14-protected-controls.js');
const rows=(color='rgb(230, 230, 230)')=>({
  truncated:false,rows:[[
    color,'rgb(30, 30, 30)','rgb(90, 90, 90)',
    'rgb(90, 90, 90)','rgb(90, 90, 90)',
    'rgb(90, 90, 90)','rgb(200, 120, 30)','1','visible','inline-block'
  ]]
});
test('P14: protected-control CSS is unchanged or counted, without persisting values',()=>{
  const before=rows();
  assert.equal(countProtectedControlChanges(before,structuredClone(before)),0);
  assert.equal(countProtectedControlChanges(before,rows('rgb(30, 30, 30)')),1);
  assert.deepEqual(before,rows());
});
test('P14: missing, truncated or shifting control samples are inconclusive',()=>{
  const before=rows();
  for(const corrupted of [
    null,{truncated:true,rows:[]},{truncated:false,rows:[]},
    {truncated:false,rows:[[1,2]]},
    {...before,rows:[...before.rows,[]]},
    {...before,privateValue:'secret'}
  ])assert.equal(countProtectedControlChanges(before,corrupted),null);
  assert.equal(countProtectedControlChanges({truncated:false,rows:[]},
    {truncated:false,rows:[]}),0);
});
test('P14: browser-side control capture never reads text, form values or navigation',()=>{
  const source=captureProtectedControls.toString();
  assert.match(source,/querySelectorAll/);
  assert.match(source,/getComputedStyle/);
  assert.doesNotMatch(source,/\.textContent|\.innerHTML|\.innerText|\.outerHTML|\.value\b|\.href\b|document\.cookie|localStorage|sessionStorage/);
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|WebSocket/);
});
