'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gate=require('../content/ai-first-beta.js');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const content=fs.readFileSync(path.join(root,'content/content.js'),'utf8');
test('P17 beta is unavailable by default and never auto-approves a model',()=>{
 const x=gate.selectEngine({enabled:true,smartEnabled:true});
 assert.equal(x.engine,'classic');
 assert.equal(x.reason,'beta-off');
 assert.equal(x.requested,false);
 assert.equal(x.promotionEligible,false);
 assert.equal(gate.CAPABILITIES.regionalModelApproved,false);
 assert.equal(gate.CAPABILITIES.regionalInferenceEnabled,false);
 assert.equal(gate.CAPABILITIES.autoTrainingEnabled,false);
 assert.equal(gate.CAPABILITIES.releaseEligible,false);
});
test('P17 explicitly requested beta cannot activate synthetic or external weights',()=>{
 const requests=[
  {enabled:true,smartEnabled:true,aiFirstBeta:true},
  {enabled:true,smartEnabled:true,aiFirstBeta:true,
   model:{kind:'p16-region-ai-candidate-v1',source:'synthetic'}},
  {enabled:false,smartEnabled:true,aiFirstBeta:true},
  {enabled:true,smartEnabled:false,aiFirstBeta:true},
  {enabled:true,smartEnabled:true,aiFirstBeta:'true'},
  null,{},1
 ];
 for(const options of requests){
  const outcome=gate.selectEngine(options);
  assert.equal(outcome.engine,'classic');
  assert.equal(outcome.modelApproved,false);
  assert.equal(outcome.promotionEligible,false);
 }
 assert.equal(gate.selectEngine(requests[0]).reason,'regional-model-not-approved');
 assert.equal(gate.selectEngine(requests[2]).reason,'extension-disabled');
 assert.equal(gate.selectEngine(requests[3]).reason,'neural-mode-disabled');
 assert.equal(gate.selectEngine(requests[4]).requested,false);
});
test('P17 MV3 loads local gate before the classic renderer with no permission changes',()=>{
 const scripts=manifest.content_scripts.flatMap(s=>s.js);
 const gateIndex=scripts.indexOf('content/ai-first-beta.js');
 assert.ok(gateIndex>0);
 assert.ok(gateIndex<scripts.indexOf('content/content.js'));
 assert.deepEqual(manifest.permissions,['storage','activeTab']);
 assert.equal(manifest.host_permissions,undefined);
 assert.match(content,/aiFirstBeta: false/);
 assert.match(content,/betaGate\?\.selectEngine\(settings\)/);
 assert.match(content,/route\.engine !== 'classic'/);
 assert.match(content,/Object\.hasOwn\(changes, key\)/);
 assert.ok(content.includes("'aiFirstBeta'].some(key"));
 assert.ok(content.includes("'aiFirstBeta']) {"));
});
test('P17 gate never reads page content, contacts network or changes CSS',()=>{
 const source=fs.readFileSync(path.join(root,'content/ai-first-beta.js'),'utf8');
 for(const expression of [
  /\bfetch\s*\(/,/XMLHttpRequest/,/\bdocument\./,/localStorage/,
  /chrome\.storage/,/textContent/,/querySelector/,/setProperty/,
  /insertRule/,/WebSocket/,/https?:\/\//
 ]){
  assert.doesNotMatch(source,expression);
 }
 assert.equal(Object.isFrozen(gate.CAPABILITIES),true);
 assert.equal(Object.isFrozen(gate.selectEngine({aiFirstBeta:true})),true);
});
