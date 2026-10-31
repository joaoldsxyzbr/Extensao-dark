'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {regionDigest,validateLedger}=require('../scripts/p16-review-intake.js');
const {target,draft,EMPTY}=require('../scripts/p16-public-capture.js');
const {applyVote,parseArgs}=require('../scripts/p16-review-vote.js');
const {quarantine}=require('../scripts/p16-supervised-quarantine.js');
const {auditTrainingReadiness}=require('../scripts/p16-training-readiness.js');
const {makeDataset}=require('../scripts/p16-build-demo.js');
const HEX=/^[0-9a-f]{64}$/;
const domains=[
 {rootDomain:'go.dev',split:'train'},
 ...Array.from({length:14},(_,i)=>({rootDomain:'t'+i+'.example',split:'train'})),
 {rootDomain:'astro.build',split:'validation'},
 ...Array.from({length:4},(_,i)=>({rootDomain:'v'+i+'.example',split:'validation'}))
];
const record=(index,caseId,split='train',patch={})=>{
 const base={caseId,rootDomain:split==='train'?'go.dev':'astro.build',
  split,regionIndex:index,features:[...makeDataset().samples[index].x],
  firstReview:'pending',secondReview:'pending',palette:null};
 return {...base,regionDigest:regionDigest(base),...patch};
};
const make=(index,parent,light,kind='panel',flags={})=>({
 index,parent,background:'opaque',ownLuma:light,effectiveLuma:light,
 widthFraction:.4,heightFraction:.2,areaFraction:.08+index*.01,kind,
 hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
 nativeDark:false,hasPseudoPaint:false,inFrame:false,
 hasOcclusionRisk:false,hasComplexAncestorPaint:false,hasMotionRisk:false,
 ...flags});
const graph={kind:'p15-region-graph-v1',status:'ready',scanned:3,nodes:[
 make(0,-1,.04,'canvas'),make(1,0,.94,'panel',{hasDirectText:true}),
 make(2,0,.96,'form',{hasProtectedDescendants:true})]};
test('P16 capture stamps every region with a deterministic sha256 evidence digest',()=>{
 const choice=target('go.dev','case-digest-001');
 const rows=draft(graph,choice);
 assert.equal(rows.length,3);
 for(const row of rows){
  assert.match(row.regionDigest,HEX);
  assert.equal(row.regionDigest,regionDigest({
   caseId:row.caseId,rootDomain:row.rootDomain,split:row.split,
   regionIndex:row.regionIndex,features:row.features}));
 }
 const again=draft(JSON.parse(JSON.stringify(graph)),choice);
 assert.deepEqual(again.map(x=>x.regionDigest),rows.map(x=>x.regionDigest));
});
test('P16 ledger v2 binds identity and features to the captured digest',()=>{
 const entry=record(1,'case-digest-001');
 const doc={schemaVersion:2,kind:'p16-local-region-reviews-v2',
  origin:'manually-entered-unverified',scope:'train-validation-only',
  independenceVerified:false,entries:[entry]};
 assert.equal(validateLedger(doc,domains).recordedRegions,1);
 for(const tampered of [
  {...entry,features:entry.features.map((x,i)=>i===2?0.5:x)},
  {...entry,regionIndex:2},
  {...entry,caseId:'case-digest-002'},
  {...entry,rootDomain:'astro.build',split:'validation'},
  {...entry,regionDigest:entry.regionDigest.toUpperCase()},
  {...entry,regionDigest:'0'.repeat(63)},
  {...entry,regionDigest:'not-a-digest'}
 ]){
  assert.throws(()=>validateLedger({...doc,entries:[tampered]},domains),
   /P16 intake:/);
 }
});
test('P16 quarantine and readiness carry verified evidence digests without approving',()=>{
 const doc={...EMPTY(),entries:[
  record(1,'case-digest-001','train',
   {firstReview:'convert',secondReview:'convert',
    palette:[.06,.07,.08,.95,.96,.97]}),
  record(5,'case-digest-002','validation',
   {firstReview:'preserve',secondReview:'preserve'})
 ]};
 const out=quarantine(doc);
 assert.equal(out.rows.train[0].regionDigest,doc.entries[0].regionDigest);
 assert.equal(out.report.regionDigestVerified,true);
 assert.match(out.report.evidenceDigest,HEX);
 assert.equal(out.report.trainingAuthorized,false);
 assert.equal(out.report.promotionEligible,false);
 const readiness=auditTrainingReadiness(doc);
 assert.equal(readiness.regionDigestVerified,true);
 assert.equal(readiness.evidenceDigest,out.report.evidenceDigest);
 assert.equal(readiness.trainingAuthorized,false);
 const empty=quarantine(EMPTY());
 assert.equal(empty.report.regionDigestVerified,true);
 assert.equal(empty.report.evidenceDigest,null);
 assert.equal(auditTrainingReadiness(EMPTY()).evidenceDigest,null);
 const quarantined=JSON.stringify(out.report);
 assert.doesNotMatch(quarantined,/features|0\.9[0-9]/);
});
test('P16 tampered digests block quarantine and votes never rewrite evidence',()=>{
 const doc={...EMPTY(),entries:[record(1,'case-digest-001','train')]};
 const foreign=record(5,'case-digest-002','validation');
 assert.throws(()=>quarantine({...doc,entries:[
  {...doc.entries[0],regionDigest:foreign.regionDigest}]}),/P16/);
 const voted=applyVote(doc,parseArgs([
  '--case=case-digest-001','--region=1','--slot=first','--vote=preserve']));
 assert.equal(voted.ledger.entries[0].regionDigest,doc.entries[0].regionDigest);
 assert.equal(voted.report.promotionEligible,false);
});
