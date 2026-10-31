'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeDataset}=require('../scripts/p16-build-demo.js');
const {parseArgs,applyVote}=require('../scripts/p16-review-vote.js');
const {readLocal,saveLocal,EMPTY}=require('../scripts/p16-public-capture.js');
const {quarantine}=require('../scripts/p16-supervised-quarantine.js');
const {regionDigest}=require('../scripts/p16-review-intake.js');
const palette=[.06,.07,.08,.95,.96,.97];
const feature=index=>makeDataset().samples[index].x.slice();
const record=(i,caseId,split='train',patch={})=>{
 const base={caseId,rootDomain:split==='train'?'go.dev':'astro.build',
  split,regionIndex:i,features:feature(i),
  firstReview:'pending',secondReview:'pending',palette:null,...patch};
 return {...base,regionDigest:regionDigest(base)};
};
test('P16 vote CLI rejects unknown paths, forged slots and unsafe palettes',()=>{
 const input=['--case=case-vote-0001','--region=1','--slot=first','--vote=convert'];
 assert.equal(parseArgs(input).vote,'convert');
 assert.deepEqual(parseArgs([...input,'--palette=0.06,0.07,0.08,0.95,0.96,0.97']).palette,palette);
 for(const invalid of [
  ['--case=case-x','--region=1','--slot=first','--vote=convert'],
  ['--case=case-vote-0001','--region=80','--slot=first','--vote=convert'],
  ['--case=case-vote-0001','--region=1','--slot=third','--vote=convert'],
  ['--case=case-vote-0001','--region=1','--slot=first','--vote=pending'],
  [...input,'--url=https://private.example'],
  [...input,'--palette=0.95,0.95,0.95,0.02,0.02,0.02'],
  [...input,'--palette=0.06,0.07,0.08,0.95,0.96,0.97','--palette=0.06'],
 ])assert.throws(()=>parseArgs(invalid),/P16 vote:/);
});
test('P16 records first and second vote once; only final safe convert consensus has a palette',()=>{
 const original={...EMPTY(),entries:[record(1,'case-vote-0001')]};
 const a=applyVote(original,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=first','--vote=convert']));
 assert.equal(a.ledger.entries[0].firstReview,'convert');
 assert.equal(a.ledger.entries[0].secondReview,'pending');
 assert.equal(a.report.trainingAuthorized,false);
 assert.equal(original.entries[0].firstReview,'pending');
 assert.throws(()=>applyVote(a.ledger,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=second','--vote=convert'])),/palette/);
 const b=applyVote(a.ledger,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=second','--vote=convert',
  '--palette=0.06,0.07,0.08,0.95,0.96,0.97']));
 assert.equal(b.report.convertAgreement,1);
 assert.equal(b.report.verifiedIndependentReviews,0);
 assert.equal(b.report.promotionEligible,false);
 assert.deepEqual(b.ledger.entries[0].palette,palette);
 assert.throws(()=>applyVote(b.ledger,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=first','--vote=preserve'])),/already filled/);
});
test('P16 disagreement and uncertain voting remain excluded with no palette',()=>{
 const initial={...EMPTY(),entries:[record(1,'case-vote-0001')]};
 const first=applyVote(initial,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=first','--vote=convert']));
 const second=applyVote(first.ledger,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=second','--vote=preserve']));
 assert.equal(second.report.disagreements,1);
 assert.equal(quarantine(second.ledger).report.excluded.disputed,1);
 assert.throws(()=>applyVote(first.ledger,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=second','--vote=preserve',
  '--palette=0.06,0.07,0.08,0.95,0.96,0.97'])),/palette only/);
 const uncertain=applyVote(initial,parseArgs([
  '--case=case-vote-0001','--region=1','--slot=first','--vote=uncertain']));
 assert.equal(quarantine(uncertain.ledger).report.excluded.pending,1);
});
test('P16 quarantine separates declared train and validation without enabling training',()=>{
 const doc={...EMPTY(),entries:[
  record(1,'case-train-0001','train',{
   firstReview:'convert',secondReview:'convert',palette}),
  record(5,'case-train-0002','train',{
   firstReview:'preserve',secondReview:'preserve'}),
  record(9,'case-val-00001','validation',{
   firstReview:'convert',secondReview:'convert',palette}),
  record(13,'case-val-00002','validation')
 ]};
 const out=quarantine(doc);
 assert.equal(out.rows.train.length,2);
 assert.equal(out.rows.validation.length,1);
 assert.equal(out.report.train.convert,1);
 assert.equal(out.report.train.preserve,1);
 assert.equal(out.report.validation.domains,1);
 assert.equal(out.report.excluded.pending,1);
 assert.equal(out.report.trustedHumanLabels,0);
 assert.equal(out.report.candidateExported,false);
 assert.equal(out.report.weightsTrained,false);
 assert.equal(out.report.trainingAuthorized,false);
 assert.equal(out.report.promotionEligible,false);
 assert.doesNotMatch(JSON.stringify(out.report),/go\.dev|astro\.build|case-train|features/);
 assert.notEqual(out.rows.train[0].features,doc.entries[0].features);
});
test('P16 quarantine rejects holdout, split tampering, duplicates and false verification',()=>{
 const doc={...EMPTY(),entries:[record(1,'case-train-0001')]};
 for(const patch of [
  {rootDomain:'julialang.org',split:'holdout'},
  {rootDomain:'astro.build',split:'train'},
  {cookie:'private'},
  {independenceVerified:true}
 ]){
  const invalid=patch.independenceVerified?
   {...doc,independenceVerified:true}:
   {...doc,entries:[{...doc.entries[0],...patch}]};
  assert.throws(()=>quarantine(invalid));
 }
 assert.throws(()=>quarantine({...doc,entries:[doc.entries[0],doc.entries[0]]}));
});
test('P16 ledger compare-and-swap preserves a later review and refuses a stale capture',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dark-p16-vote-'));
 const file=path.join(dir,'local-labels.json');
 try{
  const previous=EMPTY();
  const first={...EMPTY(),entries:[record(1,'case-train-0001')]};
  saveLocal(first,previous,file);
  const observed=readLocal(file);
  const voted=applyVote(observed,parseArgs([
   '--case=case-train-0001','--region=1','--slot=first','--vote=preserve'])).ledger;
  saveLocal(voted,observed,file);
  assert.equal(readLocal(file).entries[0].firstReview,'preserve');
  assert.throws(()=>saveLocal(first,previous,file),/concurrently/);
  assert.equal(readLocal(file).entries[0].firstReview,'preserve');
  const lock=path.join(dir,'.p16-review-write.lock');
  fs.writeFileSync(lock,'busy');
  assert.throws(()=>saveLocal(first,readLocal(file),file));
  fs.unlinkSync(lock);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
