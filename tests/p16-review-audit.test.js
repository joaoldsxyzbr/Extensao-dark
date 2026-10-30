'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {audit}=require('../scripts/p16-review-audit.js');
const {EMPTY,target,draft,merge}=require('../scripts/p16-public-capture.js');
const make=(index,parent,luma)=>({
 index,parent,background:'opaque',ownLuma:luma,effectiveLuma:luma,
 widthFraction:.4,heightFraction:.2,areaFraction:.07+index*.01,kind:'panel',
 hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
 nativeDark:false,hasPseudoPaint:false,inFrame:false,
 hasOcclusionRisk:false,hasComplexAncestorPaint:false,hasMotionRisk:false
});
const graph={kind:'p15-region-graph-v1',status:'ready',scanned:3,nodes:[
 make(0,-1,.05),make(1,0,.92),make(2,0,.96)]};
const caseRows=(domain,id)=>draft(graph,target(domain,id));
test('P16 readiness audit reports empty template as zero independently reviewed',()=>{
 const result=audit(EMPTY());
 assert.equal(result.status,'empty-review-queue');
 assert.equal(result.recordedRegions,0);
 assert.equal(result.train.cases,0);
 assert.equal(result.validation.cases,0);
 assert.equal(result.trainingAuthorized,false);
 assert.equal(result.promotionEligible,false);
 assert.equal(result.verifiedIndependentReviews,0);
});
test('P16 local readiness counts queue by frozen split with no identifying output',()=>{
 const train=caseRows('go.dev','case-go-private');
 const validation=caseRows('astro.build','case-astro-private');
 const first=merge(EMPTY(),target('go.dev','case-go-private'),train);
 const second=merge(first.ledger,target('astro.build','case-astro-private'),validation);
 const result=audit(second.ledger);
 assert.equal(result.recordedRegions,6);
 assert.equal(result.train.cases,1);
 assert.equal(result.validation.cases,1);
 assert.equal(result.train.pending,3);
 assert.equal(result.validation.pending,3);
 assert.equal(result.verifiedReviewers,0);
 assert.equal(result.humanLabelQualityVerified,false);
 assert.doesNotMatch(JSON.stringify(result),/go\.dev|astro\.build|case-go-private|case-astro-private/);
});
test('P16 audit never mistakes declared agreements for verified human evidence',()=>{
 const rows=caseRows('go.dev','case-go-private');
 rows[0]={...rows[0],firstReview:'preserve',secondReview:'preserve'};
 rows[1]={...rows[1],firstReview:'convert',secondReview:'preserve'};
 rows[2]={...rows[2],firstReview:'uncertain',secondReview:'preserve'};
 const result=audit({...EMPTY(),entries:rows});
 assert.equal(result.train.declaredAgreement,1);
 assert.equal(result.train.disputedOrUncertain,2);
 assert.equal(result.trainingAuthorized,false);
 assert.equal(result.visualRegionIdentityVerified,false);
 assert.equal(result.promotionEligible,false);
});
test('P16 audit fails closed on split tampering, unknown fields and false review identity',()=>{
 const rows=caseRows('go.dev','case-go-private');
 for(const change of [
  {split:'holdout'}, {rootDomain:'julialang.org'},
  {text:'private'}, {firstReview:'approved'},
  {palette:[0,0,0,1,1,1]},
 ]){
  const data={...EMPTY(),entries:[{...rows[0],...change}]};
  assert.throws(()=>audit(data));
 }
 const data=EMPTY();data.independenceVerified=true;
 assert.throws(()=>audit(data));
});
test('P16 audit has no crawler, renderer, model fit or private log paths',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,
  '../scripts/p16-review-audit.js'),'utf8');
 assert.doesNotMatch(src,/\.screenshot\(|\.navigate\(|\bfetch\s*\(|\btrain\s*\(/);
 assert.doesNotMatch(src,/console\.log\(.*(?:rootDomain|caseId|features)/);
});
