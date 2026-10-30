'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path');
const {PROBE,stageExtension,verify}=require('../scripts/p17-beta-mv3-e2e.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
test('P17 CI probe is absent from production and only included in a temporary copy',()=>{
 assert.equal(manifest.content_scripts[0].js.includes('content/p17-ci-probe.js'),false);
 assert.ok(PROBE.includes('chrome.storage.local.set'));
 for(const bad of ['fetch(', 'XMLHttpRequest','document.cookie','localStorage'])
  assert.equal(PROBE.includes(bad),false);
 const dir=stageExtension();
 try{
  const staged=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.equal(staged.content_scripts[0].js.at(-1),'content/p17-ci-probe.js');
  assert.deepEqual(staged.permissions,manifest.permissions);
  assert.equal(staged.host_permissions,undefined);
  assert.ok(fs.existsSync(path.join(dir,'content/p17-ci-probe.js')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('P17 MV3 rejects false promotion, missing rollback and divergent background',()=>{
 const active={active:true,cardBackground:'rgb(23, 25, 28)',modelApproved:false};
 const valid={kind:'p17-mv3-fallback-smoke-v1',defaultOff:true,
  promotionEligible:false,realModelLoaded:false,
  initial:active,requested:{...active},disabled:{...active,active:false,
   cardBackground:'rgb(245, 245, 245)'},restored:{...active}};
 assert.equal(verify(valid).realModelEnabled,false);
 for(const bad of [
  {...valid,defaultOff:false},
  {...valid,promotionEligible:true},
  {...valid,requested:{...active,cardBackground:'rgb(245, 245, 245)'}},
  {...valid,disabled:{...active,active:true}},
  {...valid,restored:{...active,modelApproved:true}}
 ])assert.throws(()=>verify(bad),/P17:/);
});
