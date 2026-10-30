#!/usr/bin/env node
'use strict';
// Offline synthetic timing test for a large white app shell under SPA mutation
// churn. Existing Chromium CDP; never navigate real sites or sealed holdout.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const colors=require('../content/colors.js');
const {ROOT,launch,waitFor}=require('./browser-e2e.js');
const {light,snapshot}=require('./p14-white-canvas-browser.js');

const NODE_COUNT=1600;
const LIMIT_MS=2500; // Fail on multi-second white canvas recovery.
const CHURN_EVENTS=45;
const OUTPUT=path.join(ROOT,'browser-results/p14-churn-latency');
const PLACEHOLDER='<script type="application/json"></script>';
const FIXTURE=light.replace('<media-app id="shell">',
  '<div aria-hidden="true">'+PLACEHOLDER.repeat(NODE_COUNT)+
  '</div><media-app id="shell">')
  .replace('<script>window.__fixtureReady=true</script>',
    '<script>window.__fixtureReady=true;'+
    'window.__p14ChurnCount=0;const timer=setInterval(()=>{'+
    'document.documentElement.classList.toggle("p14-spa-churn");'+
    'if(++window.__p14ChurnCount>=45)clearInterval(timer);},5);</script>');
const CHURN_SNAPSHOT='(()=>{const state=('+snapshot.toString()+')();'+
  'return {...state,churnCount:window.__p14ChurnCount};})()';

function assess(original,active){
  if(!original||!active||typeof original!=='object'||typeof active!=='object')
    throw Error('P14 churn: incomplete browser observations');
  const before=colors.parseColor(original.background);
  const after=colors.parseColor(active.background);
  const foreground=colors.parseColor(active.foreground);
  const time=active.recoveryMs;
  if(!before||!after||!foreground||
     !Number.isFinite(time)||time<0||time>LIMIT_MS||
     original.active!==false||active.active!==true||
     original.churnCount!==CHURN_EVENTS||active.churnCount!==CHURN_EVENTS||
     !Number.isSafeInteger(active.churnCountAtRecovery)||
     active.churnCountAtRecovery<0||active.churnCountAtRecovery>CHURN_EVENTS||
     colors.luminance(before)<=.85||colors.luminance(after)>=.2||
     colors.contrastRatio(foreground,after)<8||
     active.protectedBackground!==original.protectedBackground||
     active.protectedForeground!==original.protectedForeground)
    throw Error('P14 churn: slow or unsafe recovery of late white canvas');
  return {kind:'p14-authored-churn-latency-v1',status:'safe-in-authored-sample',
    recoveryMs:time,limitMs:LIMIT_MS,navigationIncluded:true,
    mutationEventsObserved:CHURN_EVENTS,
    recoveredBeforeChurnFinished:active.churnCountAtRecovery<CHURN_EVENTS,
    postChurnStillDark:true,
    pixelCoverageMeasured:false,independentPublicValidation:false,
    holdoutEvaluated:false,promotionEligible:false};
}

async function visit(url,withExtension){
  const browser=await launch(withExtension?ROOT:null);
  try{
    const start=performance.now();
    await browser.page.navigate(url,{fixtureReady:true});
    let atRecovery=null;
    if(withExtension)await waitFor(async()=>{
      const state=await browser.page.eval(CHURN_SNAPSHOT);
      const color=colors.parseColor(state.background);
      if(state.active&&color&&colors.luminance(color)<.2){
        atRecovery=state.churnCount;
        return true;
      }
      return false;
    },LIMIT_MS);
    // Do not pass because the page recovered before the promised 45
    // mutations occurred: verify the canvas remains dark after all of them.
    const recoveryMs=withExtension?Number((performance.now()-start).toFixed(1)):null;
    await waitFor(async()=>await browser.page.eval(
      'window.__p14ChurnCount === '+CHURN_EVENTS),3000);
    const state=await browser.page.eval(CHURN_SNAPSHOT);
    await browser.page.screenshot(path.join(OUTPUT,
      withExtension?'churn-mv3.png':'churn-original.png'));
    return {...state,recoveryMs,churnCountAtRecovery:atRecovery};
  }finally{await browser.stop();}
}

async function main(){
  if(process.argv.length!==2)throw Error('P14 churn: options are forbidden');
  fs.mkdirSync(OUTPUT,{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url!=='/authored-churn'){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});
    res.end(FIXTURE);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port+'/authored-churn';
    const original=await visit(url,false);
    const active=await visit(url,true);
    const result=assess(original,active);
    fs.writeFileSync(path.join(OUTPUT,'report.json'),
      JSON.stringify(result,null,2)+'\n');
    console.log('P14 synthetic churn',JSON.stringify(result));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{
  console.error('P14 synthetic churn failed:',error.stack||error);
  process.exitCode=1;
});
module.exports=Object.freeze({FIXTURE,NODE_COUNT,LIMIT_MS,CHURN_EVENTS,assess});
