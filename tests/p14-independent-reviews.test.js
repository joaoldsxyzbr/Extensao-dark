'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadLedger,validateReviewLedger,report}
  =require('../scripts/p14-independent-reviews.js');
const blank=()=>structuredClone(loadLedger());
const reviewed=()=>({
  caseId:'case-demo-001',rootDomain:'go.dev',split:'train',
  scenarioClass:'nested-card',viewport:'desktop',reviewStatus:'confirmed',
  visibleWhiteIsland:'no',contrastRisk:'no',interactionRisk:'no',blindReview:true
});
test('P14: manual review registry is empty, offline and cannot authorize promotion',()=>{
  assert.deepEqual(report(),{
    kind:'p14-manual-review-preflight',registeredCases:0,
    declaredIndependentReviews:0,inconclusiveReviews:0,notReviewed:0,
    observedWhiteIslands:0,observedContrastRisks:0,observedInteractionRisks:0,
    publicSitesAutomaticallyVerified:0,holdoutCasesInspected:0,
    screenshotsIndependentlyVerified:false,matchedModelComparisonAvailable:false,
    promotionEligible:false
  });
});
test('P14: accept only structured declarations for train or validation, never count as verified',()=>{
  const x=blank();x.entries=[reviewed(),{...reviewed(),
    caseId:'case-demo-002',rootDomain:'vite.dev',split:'validation',
    reviewStatus:'inconclusive',visibleWhiteIsland:'unknown',
    contrastRisk:'unknown',interactionRisk:'unknown'}];
  const v=validateReviewLedger(x);
  assert.equal(v.declaredIndependentReviews,1);
  assert.equal(v.inconclusiveReviews,1);
  assert.equal(v.screenshotsIndependentlyVerified,false);
  assert.equal(v.promotionEligible,false);
  x.entries[0].visibleWhiteIsland='yes';
  assert.equal(validateReviewLedger(x).observedWhiteIslands,1);
});
test('P14: reject any holdout, unknown split, duplicate or embedded private data',()=>{
  const changes=[
    row=>{row.rootDomain='julialang.org';row.split='holdout';},
    row=>{row.split='validation';},
    row=>{row.url='https://go.dev/user?token=secret';},
    row=>{row.text='some page text';},
    row=>{row.cookie='abc';},
    row=>{row.caseId='https://go.dev/path';},
    row=>{row.reviewStatus='approved-for-release';},
    row=>{row.blindReview=false;},
    row=>{row.visibleWhiteIsland='unknown';}
  ];
  for(const edit of changes){
    const x=blank();const row=reviewed();edit(row);x.entries.push(row);
    assert.throws(()=>validateReviewLedger(x),/P14 review:/);
  }
  const duplicate=blank();duplicate.entries=[reviewed(),reviewed()];
  assert.throws(()=>validateReviewLedger(duplicate),/P14 review:/);
});
test('P14: no fabricated observations for unreviewed pages or malformed ledger',()=>{
  const x=blank();x.entries=[{...reviewed(),reviewStatus:'not-reviewed',
    blindReview:false,visibleWhiteIsland:'unknown',contrastRisk:'unknown',
    interactionRisk:'unknown'}];
  assert.equal(validateReviewLedger(x).notReviewed,1);
  x.entries[0].contrastRisk='no';
  assert.throws(()=>validateReviewLedger(x),/P14 review:/);
  const y=blank();y.entries=[{...reviewed(),reviewStatus:'inconclusive',
    visibleWhiteIsland:'unknown',contrastRisk:'unknown',interactionRisk:'unknown'}];
  assert.equal(validateReviewLedger(y).inconclusiveReviews,1);
  const z=blank();z.screenshot='uploaded-private-data';
  assert.throws(()=>validateReviewLedger(z),/P14 review:/);
});
