#!/usr/bin/env node
'use strict';
// P14: isolated local Chromium regression for huge white application shells.
// It does not collect real website contents, open holdout, or promote weights.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const colors=require('../content/colors.js');
const {ROOT,launch,waitFor}=require('./browser-e2e.js');
const OUTPUT=path.join(ROOT,'browser-results/p14-white-canvas');
const light='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<style>:root{--app-canvas:rgb(255,255,255)}'+
  'html,body{margin:0;min-height:100vh;font:16px system-ui,sans-serif}'+
  'body{background:rgb(255,255,255);color:rgb(18,20,23)}'+
  'media-app{display:block;min-height:100vh;width:100%;'+
  'background:var(--app-canvas);color:rgb(18,20,23)}'+
  'header{height:64px;padding:18px}main{padding:18px}'+
  '#protected{background:rgb(255,255,255);color:rgb(12,12,12);'+
  'padding:18px;width:250px;height:80px}'+
  '</style></head><body><media-app id="shell">'+
  '<header>Original local navigation</header><main><h1>Local dashboard</h1>'+
  '<div id="protected" data-extensao-dark-ignore>Protected graphic-like surface</div>'+
  '</main></media-app><script>window.__fixtureReady=true</script></body></html>';
const dark='<!doctype html><html lang="en" dark><head><meta charset="utf-8">'+
  '<style>html,body{margin:0;min-height:100vh;background:rgb(20,24,29);'+
  'color:rgb(240,241,243);font:16px system-ui}'+
  '</style></head><body><main id="native" style="min-height:100vh">'+
  'Native dark test only</main><script>window.__fixtureReady=true</script></body></html>';
function snapshot(){
  const shell=document.getElementById('shell');
  const node=shell||document.querySelector('#native');
  const css=getComputedStyle(node),body=getComputedStyle(document.body);
  const protectedNode=document.querySelector('#protected');
  const protectedCss=protectedNode?getComputedStyle(protectedNode):null;
  return {active:document.documentElement.getAttribute('data-extensao-dark')==='on',
    background:css.backgroundColor,foreground:css.color,
    bodyBackground:body.backgroundColor,
    protectedBackground:protectedCss?.backgroundColor||null,
    protectedForeground:protectedCss?.color||null};
}
async function inspect(url,extension,caseId){
  const browser=await launch(extension?ROOT:null);
  try{
    await browser.page.navigate(url,{fixtureReady:true});
    if(extension&&caseId==='light')await waitFor(async()=>{
      const s=await browser.page.eval('('+snapshot.toString()+')()');
      const parsed=colors.parseColor(s.background);
      return s.active&&parsed&&colors.luminance(parsed)<.2;
    },10000);
    const state=await browser.page.eval('('+snapshot.toString()+')()');
    await browser.page.screenshot(path.join(OUTPUT,
      caseId+(extension?'-mv3':'-original')+'.png'));
    return state;
  }finally{await browser.stop();}
}
async function main(){
  if(process.argv.length!==2)throw Error('P14 white-canvas: options not allowed');
  fs.mkdirSync(OUTPUT,{recursive:true});
  const server=http.createServer((req,res)=>{
    if(!['/light','/native'].includes(req.url)){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});res.end(req.url==='/light'?light:dark);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let result;
  try{
    const root='http://127.0.0.1:'+server.address().port;
    const original=await inspect(root+'/light',false,'light');
    const active=await inspect(root+'/light',true,'light');
    assert.ok(colors.luminance(colors.parseColor(original.background))>.85,
      'authored baseline should have a bright application canvas');
    assert.ok(colors.luminance(colors.parseColor(active.background))<.2,
      'neural-first extension must recover large white application canvas');
    assert.ok(colors.contrastRatio(colors.parseColor(active.foreground),
      colors.parseColor(active.background))>=8,
      'text on the recovered shell must stay comfortably legible');
    assert.equal(active.protectedBackground,original.protectedBackground,
      'explicitly protected graphic background must remain untouched');
    assert.equal(active.protectedForeground,original.protectedForeground,
      'explicitly protected text must remain untouched');
    const nativeOriginal=await inspect(root+'/native',false,'native');
    const nativeActive=await inspect(root+'/native',true,'native');
    assert.equal(nativeActive.active,false,'native dark must not activate');
    assert.equal(nativeActive.background,nativeOriginal.background,
      'native dark must keep its own surface');
    result={kind:'p14-white-canvas-local-regression',
      canvasRecovered:true,foregroundContrastProtected:true,
      explicitIgnorePreserved:true,nativeDarkPreserved:true,
      publicSiteValidation:false,holdoutInspected:false,
      humanReviewed:false,promotionEligible:false};
    fs.writeFileSync(path.join(OUTPUT,'report.json'),
      JSON.stringify(result,null,2)+'\n');
    console.log('P14 white canvas',JSON.stringify(result));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(e=>{
  console.error('P14 white canvas test:',e.stack||e);process.exitCode=1;
});
module.exports=Object.freeze({light,dark,snapshot});
