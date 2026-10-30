'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateLedger}=require('../scripts/p16-review-intake.js');
const {makeDataset}=require('../scripts/p16-build-demo.js');
const domains=[
 {rootDomain:'go.dev',split:'train'},
 ...Array.from({length:14},(_,i)=>({rootDomain:'t'+i+'.example',split:'train'})),
 {rootDomain:'astro.build',split:'validation'},
 ...Array.from({length:4},(_,i)=>({rootDomain:'v'+i+'.example',split:'validation'}))
];
const empty=()=>({schemaVersion:1,kind:'p16-local-region-reviews-v1',
 origin:'manually-entered-unverified',scope:'train-validation-only',
 independenceVerified:false,entries:[]});
const feat=i=>makeDataset().samples[i].x.slice();
const record=(x=feat(1),patch={})=>({
 caseId:'case-sample-001',rootDomain:'go.dev',split:'train',
 regionIndex:1,features:x,firstReview:'pending',
 secondReview:'pending',palette:null,...patch});
const inspect=d=>validateLedger(d,domains);
test('P16 intake template never approves training, visual review or holdout',()=>{
 const x=inspect(empty());
 assert.equal(x.recordedRegions,0);
 assert.equal(x.verifiedIndependentReviews,0);
 assert.equal(x.trainingAuthorized,false);
 assert.equal(x.holdoutAccessed,false);
 assert.equal(x.promotionEligible,false);
});
test('P16 intake counts declared agreement and disagreement without certification',()=>{
 const x=empty();x.entries=[
  record(feat(1),{firstReview:'convert',secondReview:'convert',
   palette:[.06,.07,.08,.95,.96,.97]}),
  record(feat(5),{caseId:'case-sample-002',rootDomain:'astro.build',
   split:'validation',firstReview:'preserve',secondReview:'preserve'}),
  record(feat(9),{caseId:'case-sample-003',firstReview:'convert',
   secondReview:'preserve'})
 ];
 const report=inspect(x);
 assert.equal(report.declaredAgreement,2);
 assert.equal(report.convertAgreement,1);
 assert.equal(report.preserveAgreement,1);
 assert.equal(report.disagreements,1);
 assert.equal(report.verifiedIndependentReviews,0);
});
test('P16 intake rejects holdout, extra private fields, bad splits and vectors',()=>{
 const invalid=[
  {rootDomain:'julialang.org',split:'holdout'},
  {rootDomain:'unknown.example'},
  {rootDomain:'astro.build',split:'train'},
  {url:'https://private.example'}, {cookie:'private'},
  {reviewerName:'private'}, {regionIndex:80},
  {features:feat(1).concat([0])},
  {features:feat(1).map((x,i)=>i===2?0.5:x)},
  {features:feat(1).map((x,i)=>i===3?NaN:x)}
 ];
 for(const edit of invalid){
  const x=empty();x.entries=[record(feat(1),edit)];
  assert.throws(()=>inspect(x),/P16 intake:/);
 }
});
test('P16 intake blocks weak contrast, unreviewed labels and unsafe region',()=>{
 for(const edit of [
  {firstReview:'convert',secondReview:'convert',palette:null},
  {firstReview:'convert',secondReview:'convert',
   palette:[.95,.95,.95,.1,.1,.1]},
  {firstReview:'convert',secondReview:'convert',features:feat(2),
   palette:[.06,.07,.08,.95,.96,.97]},
  {firstReview:'preserve',secondReview:'preserve',
   palette:[.06,.07,.08,.95,.96,.97]},
  {firstReview:'convert',secondReview:'pending',
   palette:[.06,.07,.08,.95,.96,.97]}
 ]){
  const x=empty();x.entries=[record(feat(1),edit)];
  assert.throws(()=>inspect(x),/P16 intake:/);
 }
 const x=empty();x.independenceVerified=true;
 assert.throws(()=>inspect(x),/P16 intake:/);
});
test('P16 intake rejects duplicate case regions, feature vectors and cross-split cases',()=>{
 const a=record();
 for(const b of [
  {...a},
  record(feat(1),{caseId:'case-other-001',regionIndex:2}),
  record(feat(5),{rootDomain:'astro.build',split:'validation',regionIndex:2})
 ]){
  const x=empty();x.entries=[a,b];
  assert.throws(()=>inspect(x),/P16 intake:/);
 }
});
