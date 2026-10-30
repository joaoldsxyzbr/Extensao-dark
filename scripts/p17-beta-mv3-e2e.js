#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {ROOT,launch,waitFor}=require('./browser-e2e.js');
const OUTPUT=path.join(ROOT,'browser-results/p17-beta-e2e');
const PROBE="(()=>{\n'use strict';\nconst delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));\nconst snap=()=>{\n const card=document.querySelector('#card');\n return {active:document.documentElement.getAttribute('data-extensao-dark')==='on',\n cardBackground:card?getComputedStyle(card).backgroundColor:null,\n modelApproved:globalThis.DarkExtensionAIFirstBeta?.CAPABILITIES?.regionalModelApproved};\n};\n(async()=>{\n const previous=await chrome.storage.local.get(['aiFirstBeta']);\n await delay(750);\n const initial=snap();\n await chrome.storage.local.set({aiFirstBeta:true});\n await delay(400);\n const requested=snap();\n await chrome.storage.local.set({enabled:false});\n await delay(500);\n const disabled=snap();\n await chrome.storage.local.set({enabled:true,aiFirstBeta:false});\n await delay(750);\n const restored=snap();\n document.documentElement.setAttribute('data-p17-ci-result',JSON.stringify({\n  kind:'p17-mv3-fallback-smoke-v1',defaultOff:previous.aiFirstBeta===undefined,\n  initial,requested,disabled,restored,promotionEligible:false,realModelLoaded:false\n }));\n})().catch(()=>document.documentElement.setAttribute('data-p17-ci-result',\n JSON.stringify({kind:'p17-mv3-fallback-smoke-v1',error:true})));\n})();";
function stageExtension(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dark-p17-beta-'));
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'),'utf8'));
  const scripts=manifest.content_scripts?.[0]?.js;
  if(manifest.manifest_version!==3||!Array.isArray(scripts)||
   manifest.permissions.join(',')!=='storage,activeTab'||
   manifest.host_permissions!==undefined||
   scripts.indexOf('content/ai-first-beta.js')<0||
   scripts.indexOf('content/ai-first-beta.js')>scripts.indexOf('content/content.js')||
   scripts.includes('content/p17-ci-probe.js'))
   throw Error('P17: invalid MV3 test manifest');
  for(const rel of scripts){
   const dst=path.join(dir,rel);
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   fs.copyFileSync(path.join(ROOT,rel),dst);
  }
  for(const rel of ['icons','popup'])
   fs.cpSync(path.join(ROOT,rel),path.join(dir,rel),{recursive:true});
  fs.writeFileSync(path.join(dir,'content/p17-ci-probe.js'),PROBE+'\n',{flag:'wx'});
  scripts.push('content/p17-ci-probe.js');
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return dir;
 }catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
}
function verify(data){
 if(!data||data.error||data.kind!=='p17-mv3-fallback-smoke-v1'||
  data.defaultOff!==true||data.promotionEligible!==false||
  data.realModelLoaded!==false)throw Error('P17: misleading beta result');
 const {initial,requested,disabled,restored}=data;
 if(!initial||!requested||!disabled||!restored||
  [initial,requested,disabled,restored].some(x=>x.modelApproved!==false)||
  initial.active!==true||requested.active!==true||
  disabled.active!==false||restored.active!==true||
  !initial.cardBackground||initial.cardBackground==='rgb(245, 245, 245)'||
  initial.cardBackground!==requested.cardBackground||
  disabled.cardBackground!=='rgb(245, 245, 245)'||
  restored.cardBackground!==initial.cardBackground)
  throw Error('P17: classic fallback / rollback regression');
 return {kind:'p17-mv3-classic-fallback-ci-v1',
  status:'verified-on-disposable-chromium',
  betaOffByDefault:true,requestStillClassic:true,
  disableRestoresOriginal:true,reenableRestoresClassic:true,
  realModelEnabled:false,holdoutEvaluated:false,promotionEligible:false};
}
async function main(){
 if(process.argv.length!==2)throw Error('P17: unsupported arguments');
 fs.mkdirSync(OUTPUT,{recursive:true});
 const dir=stageExtension();
 const fixture=fs.readFileSync(path.join(ROOT,'tests/browser-fixture.html'));
 const server=http.createServer((req,res)=>{
  if(req.url!=='/fixture'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fixture);
 });
 let browser=null;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await launch(dir);
  await browser.page.navigate('http://127.0.0.1:'+
   server.address().port+'/fixture',{fixtureReady:true});
  await waitFor(async()=>Boolean(await browser.page.eval(
   'document.documentElement.getAttribute("data-p17-ci-result")')),12000);
  const result=verify(JSON.parse(await browser.page.eval(
   'document.documentElement.getAttribute("data-p17-ci-result")')));
  fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log('P17 beta MV3 test',JSON.stringify(result));
 }finally{
  if(browser)await browser.stop();
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
if(require.main===module)main().catch(error=>{
 console.error('P17 MV3 E2E:',error.stack||error);process.exitCode=1;
});
module.exports=Object.freeze({PROBE,stageExtension,verify});
