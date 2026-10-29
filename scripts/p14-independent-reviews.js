#!/usr/bin/env node
'use strict';
// P14: offline intake of human visual observations; no browsing, training or holdout.
const fs=require('node:fs');
const path=require('node:path');
const {ROOT}=require('./p14-dataset-contract.js');
const {loadPublicDomains,validatePublicDomains}=require('./p14-public-domains.js');
const FILE=path.join(ROOT,'training/datasets/p14-public-manual-review.json');
const SCENARIOS=new Set(['flat-background','nested-card','text-direct','interactive',
  'pseudo','gradient','overlap','shadow-open','frame','animation','native-dark','responsive']);
const STATES=new Set(['not-reviewed','confirmed','disagreement','inconclusive']);
const ANSWERS=new Set(['yes','no','unknown']);
const VIEWPORTS=new Set(['desktop','mobile']);
const ENTRY_KEYS=['caseId','rootDomain','split','scenarioClass','viewport',
  'reviewStatus','visibleWhiteIsland','contrastRisk','interactionRisk','blindReview'];
function exactKeys(value,keys,where){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).length!==keys.length||
     Object.keys(value).some(key=>!keys.includes(key)))
    throw Error('P14 review: forbidden, missing or private field in '+where);
}
function validateReviewLedger(ledger,plan=loadPublicDomains()){
  validatePublicDomains(plan);
  exactKeys(ledger,['schemaVersion','kind','scope','entries'],'ledger');
  if(ledger.schemaVersion!==1||ledger.kind!=='p14-public-manual-review-v1'||
     ledger.scope!=='train-validation-only;no-network'||!Array.isArray(ledger.entries)||
     ledger.entries.length>120)
    throw Error('P14 review: invalid or unsafe ledger');
  const permitted=new Map(plan.domains.filter(row=>row.split!=='holdout')
    .map(row=>[row.rootDomain,row.split]));
  const ids=new Set();
  let declaredReviews=0, inconclusiveReviews=0, unresolved=0, whiteIslands=0;
  let contrastRisks=0, interactionRisks=0;
  for(const row of ledger.entries){
    exactKeys(row,ENTRY_KEYS,'entry');
    if(typeof row.caseId!=='string'||!/^case-[a-z0-9-]{3,48}$/.test(row.caseId)||
       ids.has(row.caseId)||typeof row.rootDomain!=='string'||
       permitted.get(row.rootDomain)!==row.split||
       !SCENARIOS.has(row.scenarioClass)||!VIEWPORTS.has(row.viewport)||
       !STATES.has(row.reviewStatus)||!ANSWERS.has(row.visibleWhiteIsland)||
       !ANSWERS.has(row.contrastRisk)||!ANSWERS.has(row.interactionRisk)||
       typeof row.blindReview!=='boolean')
      throw Error('P14 review: invalid, duplicate or holdout entry');
    ids.add(row.caseId);
    const pending=row.reviewStatus==='not-reviewed';
    if(pending&&(row.blindReview||
       [row.visibleWhiteIsland,row.contrastRisk,row.interactionRisk].some(x=>x!=='unknown')))
      throw Error('P14 review: unreviewed entry cannot claim observations');
    if(!pending&&!row.blindReview)
      throw Error('P14 review: non-blind review cannot be marked as independent');
    if(['confirmed','disagreement'].includes(row.reviewStatus)&&
       [row.visibleWhiteIsland,row.contrastRisk,row.interactionRisk].includes('unknown'))
      throw Error('P14 review: incomplete observation cannot be confirmed');
    if(pending)unresolved++;
    else if(row.reviewStatus==='inconclusive')inconclusiveReviews++;
    else declaredReviews++;
    if(row.visibleWhiteIsland==='yes')whiteIslands++;
    if(row.contrastRisk==='yes')contrastRisks++;
    if(row.interactionRisk==='yes')interactionRisks++;
  }
  return {registeredCases:ids.size,declaredIndependentReviews:declaredReviews,
    inconclusiveReviews,notReviewed:unresolved,observedWhiteIslands:whiteIslands,
    observedContrastRisks:contrastRisks,observedInteractionRisks:interactionRisks,
    publicSitesAutomaticallyVerified:0,holdoutCasesInspected:0,
    screenshotsIndependentlyVerified:false,matchedModelComparisonAvailable:false,
    promotionEligible:false};
}
function loadLedger(){return JSON.parse(fs.readFileSync(FILE,'utf8'));}
function report(){return {kind:'p14-manual-review-preflight',...validateReviewLedger(loadLedger())};}
if(require.main===module)console.log(JSON.stringify(report(),null,2));
module.exports=Object.freeze({validateReviewLedger,loadLedger,report});
