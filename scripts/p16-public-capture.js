#!/usr/bin/env node
'use strict';
// P16: manual-only localhost capture tool. No automatic CI crawling.
// Chromium disposable profile, frozen public hosts, no page content persisted.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {getExplorationCandidates}=require('./p14-public-domains.js');
const {validateLedger,LOCAL}=require('./p16-review-intake.js');
const {captureRegionGraph}=require('../content/region-graph.js');
const {captureReviewFrame}=require('./p16-review-markers.js');
const {vectorize}=require('../content/region-ai.js');
const ID=/^case-[a-z0-9-]{4,48}$/;
const EMPTY=()=>({schemaVersion:1,kind:'p16-local-region-reviews-v1',
 origin:'manually-entered-unverified',scope:'train-validation-only',
 independenceVerified:false,entries:[]});
function target(domain,caseId,candidates=getExplorationCandidates()){
 if(typeof domain!=='string'||typeof caseId!=='string'||!ID.test(caseId)||
   !Array.isArray(candidates)||candidates.length!==20)
  throw Error('P16 public: invalid domain or case');
 const choices=candidates.filter(c=>c.rootDomain===domain);
 if(choices.length!==1||!['train','validation'].includes(choices[0].split)||
   typeof choices[0].host!=='string'||!/^[a-z0-9.-]+$/.test(choices[0].host)||
   choices[0].host!==domain&&!choices[0].host.endsWith('.'+domain))
  throw Error('P16 public: domain outside frozen train/validation allowlist');
 return Object.freeze({rootDomain:domain,host:choices[0].host,
  split:choices[0].split,caseId});
}
function draft(graph,choice){
 const vector=vectorize(graph);
 if(vector.status!=='ready'||vector.rows.length<2||vector.rows.length>80)
  throw Error('P16 public: incomplete regional capture');
 const distinct=new Set(),entries=[];
 for(const row of vector.rows){
  const key=row.features.join(',');
  if(distinct.has(key))continue;
  distinct.add(key);
  entries.push({caseId:choice.caseId,rootDomain:choice.rootDomain,
   split:choice.split,regionIndex:row.index,features:row.features,
   firstReview:'pending',secondReview:'pending',palette:null});
 }
 if(entries.length<2)throw Error('P16 public: insufficient distinct CSS regions');
 return entries;
}
function merge(existing,choice,entries){
 const before=validateLedger(existing);
 if(before.recordedRegions+entries.length>256||
   existing.entries.some(row=>row.caseId===choice.caseId))
  throw Error('P16 public: duplicate case or capacity exceeded');
 const next={...existing,entries:existing.entries.concat(entries)};
 const after=validateLedger(next);
 if(after.recordedRegions!==before.recordedRegions+entries.length||
   after.trainingAuthorized||after.promotionEligible||
   after.verifiedIndependentReviews!==0||after.holdoutAccessed)
  throw Error('P16 public: false validation state');
 return {ledger:next,report:after};
}
function readLocal(){
 if(!fs.existsSync(LOCAL))return EMPTY();
 if(fs.lstatSync(LOCAL).isSymbolicLink()||fs.statSync(LOCAL).size>262144)
  throw Error('P16 public: unsafe private review file');
 return JSON.parse(fs.readFileSync(LOCAL,'utf8'));
}
function saveLocal(ledger){
 const dir=path.dirname(LOCAL);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.realpathSync(dir)!==path.resolve(dir)||
   fs.existsSync(LOCAL)&&fs.lstatSync(LOCAL).isSymbolicLink())
  throw Error('P16 public: unsafe private review directory');
 const data=JSON.stringify(ledger,null,2)+'\n';
 if(Buffer.byteLength(data)>262144)throw Error('P16 public: private file too large');
 const temp=path.join(dir,'.p16-'+crypto.randomUUID()+'.tmp');
 try{
  fs.writeFileSync(temp,data,{flag:'wx',mode:0o600});
  fs.renameSync(temp,LOCAL);
 }finally{if(fs.existsSync(temp))fs.rmSync(temp);}
}
async function collect(choice,{launch,extract=captureRegionGraph,review=false,onInspect=null}){
 if(typeof launch!=='function')throw Error('P16 public: Chromium unavailable');
 if(review&&typeof onInspect!=='function')throw Error('P16 visual: reviewer interaction required');
 const browser=await launch(null,review?{headed:true}:{});
 try{
  await browser.page.navigate('https://'+choice.host+'/',{fixtureReady:false});
  // Evaluate policy inside Chromium: never return path/query/cookie strings.
  // Reject redirect off https/origin, URL params, account/login/checkout
  // routes or any sensitive form even when on a public allowlisted host.
  const safe='(()=>location.protocol==="https:"&&'+
   'location.hostname==='+JSON.stringify(choice.host)+'&&'+
   'location.search===""&&location.hash===""&&'+
   '!/(?:^|\\/)(?:login|log-in|signin|sign-in|account|auth|'+
   'profile|checkout|billing|payment|private)(?:\\/|$)/i.test(location.pathname)&&'+
   '!document.querySelector("input[type=password],'+
   'input[autocomplete=cc-number],input[autocomplete=one-time-code]"))()';
  if(await browser.page.eval(safe)!==true)
   throw Error('P16 public: redirected or sensitive page; no data saved');
  if(!review)return draft(await browser.page.eval('('+extract.toString()+')()'),choice);
  const result=await browser.page.eval('('+captureReviewFrame.toString()+')('+
    extract.toString()+')');
  if(!result||result.status!=='local-visual-unverified'||
     result.markerCount!==result.graph?.nodes?.length||
     result.verifiedHumanLabels!==false||result.trainingAuthorized!==false||
     result.promotionEligible!==false)
   throw Error('P16 visual: marker mismatch');
  const rows=draft(result.graph,choice);
  await onInspect({markers:result.markerCount,rows:rows.length});
  return rows;
 }finally{await browser.stop();}
}
async function main(args=process.argv.slice(2)){
 if(args.length===1&&args[0]==='--plan'){
  const c=getExplorationCandidates();
  if(c.length!==20)throw Error('P16 public: changed split count');
  console.log(JSON.stringify({kind:'p16-public-review-plan-v1',
    trainDomains:c.filter(r=>r.split==='train').length,
    validationDomains:c.filter(r=>r.split==='validation').length,
    holdoutVisited:false,siteVisited:false,humanLabelsCollected:false,
    trainingAuthorized:false,promotionEligible:false}));
  return;
 }
 const review=args.length===3&&args[2]==='--review';
 if(!(args.length===2||review)||!args[0].startsWith('--domain=')||
   !args[1].startsWith('--case='))
  throw Error('P16 public: --plan or --domain=ROOT --case=case-... [--review]');
 if(review&&!process.stdin.isTTY)throw Error('P16 visual: terminal required');
 const choice=target(args[0].slice(9),args[1].slice(7));
 const existing=readLocal();
 validateLedger(existing);
 if(existing.entries.some(r=>r.caseId===choice.caseId))
  throw Error('P16 public: case already exists');
 const {launch}=require('./browser-e2e.js');
 const inspect=review?async({markers,rows})=>{
  const readline=require('node:readline/promises');
  const terminal=readline.createInterface({input:process.stdin,output:process.stdout});
  try{
   process.stdout.write('P16: '+markers+' marcadores R0...; '+
    rows+' registros pendentes. Nenhum parecer aprovado.\n');
   await terminal.question('Inspecione o Chrome e pressione ENTER para fechar: ');
  }finally{terminal.close();}
 }:null;
 const captured=await collect(choice,{launch,review,onInspect:inspect});
 const {ledger,report}=merge(existing,choice,captured);
 saveLocal(ledger);
 console.log(JSON.stringify({kind:'p16-public-review-capture-v1',
   newRegions:captured.length,totalRegions:report.recordedRegions,
   humanReviewsVerified:0,trainingAuthorized:false,holdoutVisited:false,
   promotionEligible:false}));
}
if(require.main===module)main().catch(error=>{
 console.error('P16 public:',error.message);process.exitCode=1;
});
module.exports=Object.freeze({target,draft,merge,collect,EMPTY,main});
