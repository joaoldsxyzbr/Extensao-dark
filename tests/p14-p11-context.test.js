'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {captureP11TextContext}=require('../scripts/p14-p11-context.js');

function node({fg,ancestor,inline='',link=false,connected=true}){
  return {isConnected:connected,_color:fg,parentElement:ancestor?{_color:ancestor}:null,
    style:{getPropertyValue:k=>k==='color'?inline:''},
    closest:selector=>{
      assert.equal(selector,'a[href],[role="link"]');
      return link?{}:null;
    }};
}
function sample(nodes){
  const sandbox={__darkP13Islands:{auditNodes:nodes},
    getComputedStyle:el=>({color:el._color})};
  return vm.runInNewContext('('+captureP11TextContext.toString()+')()',sandbox);
}
test('P14 P11 DOM: link semantics and demonstrable own CSS color only',()=>{
  const rows=sample([
    node({fg:'rgb(0, 40, 150)',ancestor:'rgb(20, 20, 20)',link:true}),
    node({fg:'rgb(20, 20, 20)',ancestor:'rgb(20, 20, 20)',inline:'inherit'}),
    node({fg:'rgb(20, 20, 20)',ancestor:'rgb(20, 20, 20)'}),
  ]);
  assert.equal(rows.truncated,false);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.rows)),[
    {isLink:true,explicitColor:true},
    {isLink:false,explicitColor:true},
    {isLink:false,explicitColor:null}
  ]);
});
test('P14 P11 DOM: absent, disconnected or unbounded text audit never claims context',()=>{
  const x=sample([node({fg:'rgb(20, 20, 20)',connected:false})]);
  assert.equal(x.truncated,true);
  assert.deepEqual(Array.from(x.rows),[]);
  const huge=sample(Array.from({length:241},()=>node({fg:'rgb(20, 20, 20)'})));
  assert.equal(huge.truncated,true);
  const missing=vm.runInNewContext('('+captureP11TextContext.toString()+')()',{});
  assert.equal(missing.truncated,true);
});
test('P14 P11 DOM: metadata extractor does not inspect navigation content',()=>{
  const s=captureP11TextContext.toString();
  assert.doesNotMatch(s,/\.href\b|\.value\b|\.textContent|\.innerText|\.innerHTML|\.outerHTML|document\.cookie|localStorage|fetch\(/);
  assert.match(s,/getComputedStyle/);
  assert.match(s,/closest/);
});
