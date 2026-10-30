#!/usr/bin/env node
'use strict';
// Privacy-first *structural* review backlog: does NOT authenticate humans,
// train, access the P14 holdout, or turn declared agreement into approval.
const fs=require('node:fs');
const {LOCAL,TEMPLATE,validateLedger}=require('./p16-review-intake.js');
function audit(doc){
 const preflight=validateLedger(doc); // exact schema, public roots and split gates
 const buckets={
  train:{cases:new Set(),regions:0,pending:0,disputed:0,agreed:0},
  validation:{cases:new Set(),regions:0,pending:0,disputed:0,agreed:0}
 };
 for(const item of doc.entries){
  const state=buckets[item.split];
  if(!state)throw Error('P16 review audit: invalid split');
  state.cases.add(item.caseId);
  state.regions++;
  const a=item.firstReview,b=item.secondReview;
  if(a==='pending'||b==='pending')state.pending++;
  else if(a==='uncertain'||b==='uncertain'||a!==b)state.disputed++;
  else state.agreed++;
 }
 const summary=Object.fromEntries(Object.entries(buckets).map(([name,v])=>
  [name,{cases:v.cases.size,regions:v.regions,pending:v.pending,
   disputedOrUncertain:v.disputed,declaredAgreement:v.agreed}]));
 const totals=doc.entries.length;
 if(summary.train.regions+summary.validation.regions!==totals||
   summary.train.declaredAgreement+summary.validation.declaredAgreement!==
   preflight.declaredAgreement||
   preflight.trainingAuthorized!==false||preflight.promotionEligible!==false)
  throw Error('P16 review audit: invalid aggregate or false approval');
 return {kind:'p16-review-readiness-audit-v1',
  status:totals?'unverified-human-evidence-required':'empty-review-queue',
  recordedRegions:totals,train:summary.train,validation:summary.validation,
  reservedHoldoutDomainsNotRead:10,verifiedReviewers:0,
  verifiedIndependentReviews:0,visualRegionIdentityVerified:false,
  humanLabelQualityVerified:false,trainedOnHumanLabels:false,
  trainingAuthorized:false,promotionEligible:false};
}
function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--template','--local'].includes(args[0]))
  throw Error('P16 review audit: choose --template (CI) or --local (private)');
 const filename=args[0]==='--template'?TEMPLATE:LOCAL;
 if(fs.lstatSync(filename).isSymbolicLink()||fs.statSync(filename).size>262144)
  throw Error('P16 review audit: invalid private file');
 const report=audit(JSON.parse(fs.readFileSync(filename,'utf8')));
 // Counts only: no domain, example ID, CSS values or reviewer identities.
 console.log(JSON.stringify(report));
}
if(require.main===module){
 try{main();}catch(e){console.error('P16 review audit:',e.message);process.exitCode=1;}
}
module.exports=Object.freeze({audit,main});
