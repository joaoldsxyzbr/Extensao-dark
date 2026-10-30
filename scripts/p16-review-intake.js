#!/usr/bin/env node
'use strict';
// Review intake is local/offline and NEVER asserts human independence.
// No webpage crawling, image collection, remote storage or holdout.
const fs=require('node:fs'),path=require('node:path');
const {ROOT}=require('./p14-dataset-contract.js');
const {getExplorationCandidates}=require('./p14-public-domains.js');
const {safePalette}=require('../content/region-ai.js');
const TEMPLATE=path.join(ROOT,'training/datasets/p16-review-template.json');
const LOCAL=path.join(ROOT,'training/reviews/p16-local-labels.json');
const VOTES=new Set(['convert','preserve','uncertain','pending']);
const BOOLS=[0,1,2,3,4,5,6,7,8,9,10,17,18,19];
function exact(x,keys){
 if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).length!==keys.length||
    Object.keys(x).some(k=>!keys.includes(k)))
  throw Error('P16 intake: private, missing or unexpected field');
}
function validateLedger(doc,candidates=getExplorationCandidates()){
 exact(doc,['schemaVersion','kind','origin','scope','independenceVerified','entries']);
 if(doc.schemaVersion!==1||doc.kind!=='p16-local-region-reviews-v1'||
    doc.origin!=='manually-entered-unverified'||doc.scope!=='train-validation-only'||
    doc.independenceVerified!==false||!Array.isArray(doc.entries)||doc.entries.length>256)
  throw Error('P16 intake: invalid unsafe ledger');
 const allowed=new Map(candidates.map(x=>[x.rootDomain,x.split]));
 if(allowed.size!==20||[...allowed.values()].filter(x=>x==='train').length!==15||
    [...allowed.values()].filter(x=>x==='validation').length!==5)
  throw Error('P16 intake: invalid frozen P14 split reservation');
 const cases=new Map(),keys=new Set(),vectors=new Set();
 let declaredAgreement=0,convertAgreement=0,preserveAgreement=0;
 let disagreements=0,uncertain=0,unreviewed=0;
 for(const r of doc.entries){
  exact(r,['caseId','rootDomain','split','regionIndex','features',
           'firstReview','secondReview','palette']);
  if(typeof r.caseId!=='string'||!/^case-[a-z0-9-]{4,48}$/.test(r.caseId)||
     typeof r.rootDomain!=='string'||!allowed.has(r.rootDomain)||
     r.split!==allowed.get(r.rootDomain)||
     !Number.isSafeInteger(r.regionIndex)||r.regionIndex<0||r.regionIndex>=80||
     !VOTES.has(r.firstReview)||!VOTES.has(r.secondReview)||
     !Array.isArray(r.features)||r.features.length!==20||
     r.features.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)||
     BOOLS.some(i=>r.features[i]!==0&&r.features[i]!==1))
   throw Error('P16 intake: invalid domain, split, vote or CSS vector');
  const scope=cases.get(r.caseId);
  if(scope&&(scope.rootDomain!==r.rootDomain||scope.split!==r.split))
   throw Error('P16 intake: case reused in another domain or split');
  cases.set(r.caseId,{rootDomain:r.rootDomain,split:r.split});
  const key=r.caseId+':'+r.regionIndex,vector=r.features.join(',');
  if(keys.has(key)||vectors.has(vector))
   throw Error('P16 intake: duplicate case or feature vector');
  keys.add(key);vectors.add(vector);
  const consensus=r.firstReview===r.secondReview&&
    ['convert','preserve'].includes(r.firstReview);
  if(!consensus){
   if(r.palette!==null)throw Error('P16 intake: disputed or unreviewed palette');
   if(r.firstReview==='pending'||r.secondReview==='pending')unreviewed++;
   else if(r.firstReview==='uncertain'||r.secondReview==='uncertain')uncertain++;
   else disagreements++;
   continue;
  }
  declaredAgreement++;
  if(r.firstReview==='convert'){
   if(r.features[2]!==1||r.features[10]!==0||
      r.features.slice(4,11).some(x=>x!==0)||
      !Array.isArray(r.palette)||r.palette.length!==6||!safePalette(r.palette))
    throw Error('P16 intake: unsafe conversion or contrast');
   convertAgreement++;
  }else{
   if(r.palette!==null)throw Error('P16 intake: preserve cannot have palette');
   preserveAgreement++;
  }
 }
 return {kind:'p16-local-review-intake-preflight-v1',
  recordedRegions:doc.entries.length,recordedCases:cases.size,
  declaredAgreement,convertAgreement,preserveAgreement,
  disagreements,uncertain,unreviewed,
  verifiedIndependentReviews:0,trainingAuthorized:false,
  screenshotsVerified:false,holdoutAccessed:false,promotionEligible:false};
}
function main(){
 if(process.argv.length!==2&&!(process.argv.length===3&&process.argv[2]==='--local'))
  throw Error('P16 intake: only --local allowed; arbitrary paths forbidden');
 const filename=process.argv.length===3?LOCAL:TEMPLATE;
 if(fs.statSync(filename).size>262144)throw Error('P16 intake: oversized local file');
 // Only aggregate totals are emitted; no vectors, domain names or images.
 console.log(JSON.stringify(validateLedger(JSON.parse(fs.readFileSync(filename,'utf8')))));
}
if(require.main===module)main();
module.exports=Object.freeze({validateLedger,TEMPLATE,LOCAL});
