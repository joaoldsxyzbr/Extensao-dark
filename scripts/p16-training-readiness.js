#!/usr/bin/env node
'use strict';
// P16 conservative pre-training audit. Never trains, exports rows, promotes
// weights or asserts independent human review. No holdout or network calls.
const fs=require('node:fs');
const {LOCAL,TEMPLATE}=require('./p16-review-intake.js');
const {quarantine}=require('./p16-supervised-quarantine.js');

// Planning minima only: NOT a statistical proof of generalization.
const MIN=Object.freeze({
 trainDomains:8,validationDomains:3,
 trainCases:24,validationCases:8,
 trainRegions:48,validationRegions:16,
 trainConvert:12,validationConvert:4,
 trainPreserve:12,validationPreserve:4
});
const BOOLS=new Set([0,1,2,3,4,5,6,7,8,9,10,17,18,19]);
const near=(a,b)=>a.every((n,i)=>
  Math.abs(n-b[i])<=(BOOLS.has(i)?0:0.005));

function auditTrainingReadiness(ledger){
 const checked=quarantine(ledger); // validates split, votes, palette, privacy
 const {train,validation}=checked.rows,source=checked.report;
 const failures=[];
 const requirement=(pass,reason)=>{if(!pass)failures.push(reason)};
 const tr=source.train,va=source.validation;
 for(const [key,minimum,actual] of [
  ['train-domains',MIN.trainDomains,tr.domains],
  ['validation-domains',MIN.validationDomains,va.domains],
  ['train-cases',MIN.trainCases,tr.cases],
  ['validation-cases',MIN.validationCases,va.cases],
  ['train-regions',MIN.trainRegions,tr.rows],
  ['validation-regions',MIN.validationRegions,va.rows],
  ['train-convert',MIN.trainConvert,tr.convert],
  ['validation-convert',MIN.validationConvert,va.convert],
  ['train-preserve',MIN.trainPreserve,tr.preserve],
  ['validation-preserve',MIN.validationPreserve,va.preserve],
 ])requirement(actual>=minimum,'insufficient-'+key);
 let nearPairs=0;
 for(const a of train){
  for(const b of validation){
   // E.g. same structure from two sites with only geometry jitter.
   if(near(a.features,b.features))nearPairs++;
  }
 }
 requirement(nearPairs===0,'near-duplicate-across-splits');
 requirement(source.excluded.pending===0,'pending-votes');
 requirement(source.excluded.disputed===0,'disputed-votes');
 requirement(source.excluded.uncertain===0,'uncertain-votes');
 // The existing ledger deliberately contains NO cryptographically validated
 // provenance or independent visual attestation. Size alone cannot authorize.
 requirement(false,'human-review-provenance-not-verified');
 requirement(false,'region-visual-evidence-not-verified');
 requirement(false,'supervised-training-not-authorized');
 if(source.trustedHumanLabels!==0||source.trainingAuthorized!==false||
    source.candidateExported!==false||source.weightsTrained!==false||
    source.promotionEligible!==false)
  throw Error('P16 training gate: untrusted input claims authorization');
 const out=Object.freeze({
  kind:'p16-offline-training-readiness-v1',
  status:'blocked-unverified-supervision',
  train:Object.freeze({...tr}),
  validation:Object.freeze({...va}),
  excluded:Object.freeze({...source.excluded}),
  minimumPlanningTargets:MIN,
  nearDuplicatePairsAcrossSplits:nearPairs,
  blockers:Object.freeze(failures),
  regionDigestVerified:source.regionDigestVerified===true,
  evidenceDigest:source.evidenceDigest??null,
  verifiedIndependentReviewers:0,
  visuallyVerifiedRegions:0,
  trainingAuthorized:false,
  modelTrained:false,candidateExported:false,
  holdoutTouched:false,promotionEligible:false
 });
 return out;
}
function command(args){
 if(!Array.isArray(args)||args.length!==1||
    !['--template','--local'].includes(args[0]))
  throw Error('P16 training gate: only --template or --local; train/export forbidden');
 return args[0];
}
function main(args=process.argv.slice(2)){
 const option=command(args);
 const filename=option==='--template'?TEMPLATE:LOCAL;
 if(fs.lstatSync(filename).isSymbolicLink()||
    fs.statSync(filename).size>262144)
  throw Error('P16 training gate: unsafe private ledger');
 const report=auditTrainingReadiness(JSON.parse(fs.readFileSync(filename,'utf8')));
 // No identifiers, votes, features, palette, URL, human identity or weights.
 console.log(JSON.stringify(report));
}
if(require.main===module){
 try{main();}catch(error){
  console.error('P16 training gate:',error.message);process.exitCode=1;
 }
}
module.exports=Object.freeze({MIN,near,auditTrainingReadiness,command,main});
