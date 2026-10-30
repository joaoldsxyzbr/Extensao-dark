#!/usr/bin/env node
'use strict';
// Experimental P15 -> P16 -> P17 integration against a synthetic Chromium
// fixture only. Never load a trained, released or user-derived model.
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const core=require('../vendor/neural_core/neural-core.js');
const {KIND,infer,loadCandidate}=require('../content/region-ai.js');
const {createSession}=require('./p17-preview-session.js');
const {HTML}=require('./p17-preview-browser.js');
const {ROOT,launch}=require('./browser-e2e.js');
const OUT=path.join(ROOT,'browser-results/p17-integrated-pipeline');

function fixtureRegion(index,parent,luma,flags={}){
 return {index,parent,background:'opaque',ownLuma:luma,effectiveLuma:luma,
  widthFraction:.4,heightFraction:.2,areaFraction:.08,kind:'panel',
  hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
  nativeDark:false,hasPseudoPaint:false,inFrame:false,
  hasOcclusionRisk:false,hasComplexAncestorPaint:false,
  hasMotionRisk:false,...flags};
}
const FIXTURE_GRAPH=Object.freeze({kind:'p15-region-graph-v1',status:'ready',
 scanned:4,nodes:[
  fixtureRegion(0,-1,.04,{kind:'canvas'}),
  fixtureRegion(1,0,.94,{hasDirectText:true}),
  fixtureRegion(2,0,.96,{hasDirectText:true}),
  fixtureRegion(3,0,.93,{hasProtectedDescendants:true})
 ]});
function head(out,biases){
 return {formatVersion:1,layers:[{inputSize:20,outputSize:out,
  activation:'sigmoid',weights:Array(20*out).fill(0),biases}]};
}
function fixtureCandidate(){
 return {kind:KIND,formatVersion:1,featuresVersion:1,
  source:'synthetic-experimental-no-release',
  heads:{decision:head(1,[5]),
   palette:head(6,[-4,-4,-4,4,4,4])}};
}
function planFixture(){
 const loaded=loadCandidate(core,fixtureCandidate());
 const decision=infer(FIXTURE_GRAPH,core,loaded);
 if(decision.status!=='exploratory'||decision.rows.length!==4||
   decision.applied!==false||decision.promotionEligible!==false||
   decision.rows[0].action!=='abstain'||
   decision.rows[3].action!=='abstain'||
   decision.rows[3].reason!=='unsafe-region'||
   decision.rows[1].action!=='propose'||
   decision.rows[2].action!=='propose')
  throw Error('P17 integrated: invalid or overbroad P16 proposal');
 // This mapping is defined only for our authored HTML fixture; DOM mapping
 // for real pages is explicitly NOT implemented or approved.
 return decision.rows.slice(1,3).map((row,i)=>({
  index:i,background:row.palette.background,
  foreground:row.palette.foreground
 }));
}
// Serialized into a disposable localhost Chromium page with a known fixture.
function browserTrial(create,plan){
 const nodes=Array.from(document.querySelectorAll('[data-p17-preview]'));
 if(nodes.length!==3||plan.length!==2)throw Error('P17 integrated: fixture changed');
 const colors=()=>nodes.map(n=>getComputedStyle(n).backgroundColor);
 const before=colors();
 const session=create(nodes);
 const applied=session.apply(plan);
 const preview=colors();
 if(applied.painted!==2||preview[0]!==preview[1]||
   preview[0]===before[0]||preview[2]!==before[2])
  throw Error('P17 integrated: unsafe synthetic preview');
 nodes[1].style.setProperty('background-color','rgb(120, 25, 25)','important');
 const rolled=session.rollback(),after=colors();
 if(rolled.restored!==3||rolled.conflicts!==1||
   after[0]!==before[0]||after[1]!=='rgb(120, 25, 25)'||
   after[2]!==before[2])
  throw Error('P17 integrated: rollback changed site-owned style');
 return {kind:'p17-integrated-synthetic-only-v1',
  proposed:plan.length,painted:applied.painted,
  restored:rolled.restored,siteConflictsPreserved:rolled.conflicts,
  protectedUnchanged:true,extensionModified:false,
  realHumanLabels:false,holdoutEvaluated:false,promotionEligible:false};
}
async function main(){
 if(process.argv.length!==2)throw Error('P17 integrated: no arbitrary flags');
 fs.mkdirSync(OUT,{recursive:true});
 const plan=planFixture();
 const server=http.createServer((req,res)=>{
  if(req.url!=='/synthetic'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
   'Cache-Control':'no-store'});
  res.end(HTML);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await launch(null);
  await browser.page.navigate('http://127.0.0.1:'+
   server.address().port+'/synthetic',{fixtureReady:true});
  const program='('+browserTrial.toString()+')('+
   createSession.toString()+','+JSON.stringify(plan)+')';
  const outcome=await browser.page.eval(program);
  assert.equal(outcome.promotionEligible,false);
  assert.equal(outcome.restored,3);
  fs.writeFileSync(path.join(OUT,'report.json'),
   JSON.stringify(outcome,null,2)+'\n');
  console.log('P17 integrated lab',JSON.stringify(outcome));
 }finally{
  if(browser)await browser.stop();
  await new Promise(resolve=>server.close(resolve));
 }
}
if(require.main===module)main().catch(error=>{
 console.error('P17 integrated lab failed',error.stack||error);
 process.exitCode=1;
});
module.exports=Object.freeze({planFixture,fixtureCandidate,
 FIXTURE_GRAPH,browserTrial});
