#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 http=require('node:http'),path=require('node:path');
const {ROOT,launch}=require('./browser-e2e.js');
const {createSession}=require('./p17-preview-session.js');
const OUTPUT=path.join(ROOT,'browser-results/p17-preview');
const HTML='<!doctype html><html><head><style>body{font:16px sans-serif}'+
 '.panel{width:360px;height:130px;margin:22px}</style></head><body>'+
 '<section data-p17-preview class="panel" id="safe" style="background-color:rgb(255, 255, 255);color:rgb(12, 12, 12)">A</section>'+
 '<section data-p17-preview class="panel" id="site" style="background-color:rgb(251, 251, 251);color:rgb(14, 14, 14)">B</section>'+
 '<section data-p17-preview class="panel" id="protected" style="background-color:rgb(255, 255, 255);color:rgb(10, 10, 10)"><input aria-label="control"></section>'+
 '<script>window.__fixtureReady=true;</script></body></html>';
function runBrowserTransaction(){
 const nodes=Array.from(document.querySelectorAll('[data-p17-preview]'));
 const tx=createSession(nodes);
 const noPaintBefore=getComputedStyle(nodes[0]).backgroundColor;
 let blocked=false;
 try{tx.apply([{index:2,background:[16,20,24],foreground:[242,245,247]}]);}
 catch{blocked=true;}
 if(!blocked)throw Error('P17 protected fixture was painted');
 const painted=tx.apply([
  {index:0,background:[16,20,24],foreground:[242,245,247]},
  {index:1,background:[16,20,24],foreground:[242,245,247]}]);
 const dark=getComputedStyle(nodes[0]).backgroundColor;
 const protectedBg=getComputedStyle(nodes[2]).backgroundColor;
 nodes[1].style.setProperty('background-color','rgb(120, 25, 25)','important');
 const rollback=tx.rollback();
 const restored=getComputedStyle(nodes[0]).backgroundColor;
 const site=getComputedStyle(nodes[1]).backgroundColor;
 if(!blocked||painted.painted!==2||dark!=='rgb(16, 20, 24)'||
    protectedBg!=='rgb(255, 255, 255)'||
    restored!==noPaintBefore||site!=='rgb(120, 25, 25)'||
    rollback.restored!==3||rollback.conflicts!==1)
  throw Error('P17: real Chromium rehearsal did not preserve CSS');
 return {kind:'p17-rollback-synthetic-v1',rollbackVerified:true,
  siteChangesPreserved:true,protectedPreserved:true,
  appliedToExtension:false,holdoutInspected:false,promotionEligible:false};
}
async function main(){
 if(process.argv.length!==2)throw Error('P17: arbitrary command args forbidden');
 fs.mkdirSync(OUTPUT,{recursive:true});
 const server=http.createServer((req,res)=>{
  if(req.url!=='/fixture'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(HTML);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser=null;
 try{
  browser=await launch(null);
  await browser.page.navigate('http://127.0.0.1:'+server.address().port+'/fixture');
  const script='((createSession)=>('+runBrowserTransaction.toString()+')())('+
    createSession.toString()+')';
  const result=await browser.page.eval(script);
  assert.equal(result.rollbackVerified,true);
  assert.equal(result.promotionEligible,false);
  fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(result,null,2)+'\n');
  console.log('P17 isolated rehearsal',JSON.stringify(result));
 }finally{
  if(browser)await browser.stop();
  await new Promise(resolve=>server.close(resolve));
 }
}
if(require.main===module)main().catch(error=>{
 console.error('P17 Chromium preview failure',error.stack||error);process.exitCode=1;
});
module.exports=Object.freeze({runBrowserTransaction,HTML});
