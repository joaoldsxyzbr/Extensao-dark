#!/usr/bin/env node
'use strict';
// Non-deployable supervision preview. Consensus is declared, NEVER verified.
// No training, file export, public crawling, holdout, personal identifiers or weights.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {LOCAL,TEMPLATE,validateLedger}=require('./p16-review-intake.js');
function quarantine(ledger){
 const source=validateLedger(ledger);
 const splits={train:[],validation:[]};
 const deferred={pending:0,disputed:0,uncertain:0};
 for(const r of ledger.entries){
  const agreed=r.firstReview===r.secondReview&&
   ['convert','preserve'].includes(r.firstReview);
  if(!agreed){
   if(r.firstReview==='pending'||r.secondReview==='pending')deferred.pending++;
   else if(r.firstReview==='uncertain'||r.secondReview==='uncertain')
    deferred.uncertain++;
   else deferred.disputed++;
   continue;
  }
  const decision=r.firstReview==='convert'?1:0;
  splits[r.split].push(Object.freeze({
   // Private in-memory scope retained for future split provenance checks.
   caseId:r.caseId,rootDomain:r.rootDomain,regionIndex:r.regionIndex,
   features:Object.freeze([...r.features]),decision,
   regionDigest:r.regionDigest,
   palette:decision?Object.freeze([...r.palette]):null
  }));
 }
 const counts={};
 for(const split of ['train','validation']){
  const rows=splits[split],domains=new Set(rows.map(r=>r.rootDomain));
  counts[split]={rows:rows.length,domains:domains.size,
   cases:new Set(rows.map(r=>r.caseId)).size,
   convert:rows.filter(r=>r.decision===1).length,
   preserve:rows.filter(r=>r.decision===0).length};
 }
 if(counts.train.rows+counts.validation.rows!==source.declaredAgreement||
    source.independenceVerified===true||source.verifiedIndependentReviews!==0||
    source.trainingAuthorized||source.promotionEligible||source.holdoutAccessed)
  throw Error('P16 quarantine: unsafe source or incorrect consensus');
 // Aggregate evidence fingerprint: lets a future training artifact cite the
 // exact captured regions it was built from. Structural only, never a human
 // attestation.
 const evidence=splits.train.concat(splits.validation)
  .map(r=>r.regionDigest).sort();
 const evidenceDigest=evidence.length?crypto.createHash('sha256')
  .update(['p16-evidence-v2',...evidence].join('|')).digest('hex'):null;
 const report=Object.freeze({
  kind:'p16-supervision-quarantine-v1',
  status:'declared-consensus-not-verified',
  train:Object.freeze(counts.train),validation:Object.freeze(counts.validation),
  excluded:Object.freeze(deferred),
  regionDigestVerified:true,
  evidenceDigest,
  reviewedByIndependentHumans:false,
  visualEvidenceVerified:false,verificationAuthorityConfigured:false,
  trustedHumanLabels:0,trainingAuthorized:false,
  holdoutTouched:false,candidateExported:false,
  weightsTrained:false,promotionEligible:false
 });
 return Object.freeze({report,rows:Object.freeze({
  train:Object.freeze(splits.train),validation:Object.freeze(splits.validation)
 })});
}
function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--template','--local'].includes(args[0]))
  throw Error('P16 quarantine: use --template (CI) or --local');
 const filename=args[0]==='--template'?TEMPLATE:LOCAL;
 if(fs.lstatSync(filename).isSymbolicLink()||fs.statSync(filename).size>262144)
  throw Error('P16 quarantine: private file invalid');
 const result=quarantine(JSON.parse(fs.readFileSync(filename,'utf8')));
 // Never print rows/hostnames/opaque cases/numeric vectors or human votes.
 console.log(JSON.stringify(result.report));
}
if(require.main===module){
 try{main();}catch(error){console.error('P16 quarantine:',error.message);process.exitCode=1;}
}
module.exports=Object.freeze({quarantine,main});
