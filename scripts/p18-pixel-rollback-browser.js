#!/usr/bin/env node
'use strict';
// P18 only: screenshot pixels of an authored localhost fixture. No holdout.
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const {ROOT,launch}=require('./browser-e2e.js');
const {HTML}=require('./p17-preview-browser.js');
const {createSession}=require('./p17-preview-session.js');
const {compareAuthoredScreenshot}=require('./p15-authored-pixel-oracle.js');

const OUTPUT=path.join(ROOT,'browser-results/p18-pixel-rollback');
const POINTS=Object.freeze([{x:200,y:85},{x:200,y:235},{x:200,y:390}]);
const expected=(a,b,c)=>POINTS.map((p,i)=>({
  x:p.x,y:p.y,expected:[a,b,c][i]
}));
const BEFORE=expected('bright','bright','bright');
const PREVIEW=expected('dark','dark','bright');
const AFTER=expected('bright','bright','bright');

function phase(name,result){
 if(!result||result.kind!=='p15-authored-screenshot-landmarks-v1'||
    result.status!=='matched'||result.checks!==3||
    result.matched!==3||result.mismatches!==0||
    result.independentVisualReview!==false||result.promotionEligible!==false)
  throw Error('P18 pixel: mismatched screenshot in '+name);
 return {status:'matched',checks:3};
}
function summarize(before,preview,after,rollback){
 const phases={
  before:phase('before',before),
  preview:phase('preview',preview),
  after:phase('after',after)
 };
 if(!rollback||rollback.status!=='rolled-back'||
    rollback.restored!==3||rollback.conflicts!==1)
  throw Error('P18 pixel: rollback not proven');
 return {kind:'p18-synthetic-pixel-rollback-v1',
  status:'matched-authored-only',phases,
  siteMutationPreserved:true,protectedPanelPreserved:true,
  publicSitesEvaluated:false,areaCoverage:null,
  independentlyReviewed:false,holdoutInspected:false,
  extensionModified:false,promotionEligible:false};
}
function script(action){
 if(!['apply','rollback'].includes(action))throw Error('P18 pixel: unknown action');
 const start='(()=>{const nodes=Array.from(document.querySelectorAll("[data-p17-preview]"));'+
  'if(nodes.length!==3)throw Error("P18 pixel: fixture changed");';
 const apply='globalThis.__p18Preview=('+createSession.toString()+')(nodes);'+
  'return globalThis.__p18Preview.apply('+
  JSON.stringify([{index:0,background:[16,20,24],foreground:[242,245,247]},
    {index:1,background:[16,20,24],foreground:[242,245,247]}])+');';
 const rollback='nodes[1].style.setProperty("background-color",'+
  '"rgb(248, 239, 226)","important");'+
  'const result=globalThis.__p18Preview.rollback();'+
  'delete globalThis.__p18Preview;return result;';
 return start+(action==='apply'?apply:rollback)+'})()';
}
async function run(){
 if(process.argv.length!==2)throw Error('P18 pixel: no options');
 fs.mkdirSync(OUTPUT,{recursive:true});
 const server=http.createServer((req,res)=>{
  if(req.url!=='/synthetic'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(HTML);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser=null;
 try{
  browser=await launch(null);
  await browser.page.navigate('http://127.0.0.1:'+
    server.address().port+'/synthetic',{fixtureReady:true});
  const before=await compareAuthoredScreenshot(browser,BEFORE);
  const applied=await browser.page.eval(script('apply'));
  assert.equal(applied.status,'preview-only');
  assert.equal(applied.painted,2);
  const preview=await compareAuthoredScreenshot(browser,PREVIEW);
  const rolled=await browser.page.eval(script('rollback'));
  const afterCSS=await browser.page.eval(
   '(()=>({safe:getComputedStyle(document.getElementById("safe")).backgroundColor,'+
   'site:getComputedStyle(document.getElementById("site")).backgroundColor,'+
   'protected:getComputedStyle(document.getElementById("protected")).backgroundColor,'+
   'sessionGone:!globalThis.__p18Preview}))()');
  assert.deepEqual(afterCSS,{safe:'rgb(255, 255, 255)',
   site:'rgb(248, 239, 226)',protected:'rgb(255, 255, 255)',sessionGone:true});
  const after=await compareAuthoredScreenshot(browser,AFTER);
  const report=summarize(before,preview,after,rolled);
  fs.writeFileSync(path.join(OUTPUT,'report.json'),
    JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('P18 authored pixel regression',JSON.stringify(report));
 }finally{
  if(browser)await browser.stop();
  await new Promise(resolve=>server.close(resolve));
 }
}
if(require.main===module)run().catch(error=>{
 console.error('P18 pixel rollback:',error.stack||error);
 process.exitCode=1;
});
module.exports=Object.freeze({POINTS,BEFORE,PREVIEW,AFTER,phase,summarize,script});
