#!/usr/bin/env node
'use strict';
// P14: offline domain reservation only. Never navigate, fetch, label or score holdout.
const fs=require('node:fs');
const path=require('node:path');
const {load,validateKnownDomains,ROOT}=require('./p14-dataset-contract.js');
const FILE=path.join(ROOT,'training/datasets/p14-public-domain-candidates.json');
const SPLITS=['train','validation','holdout'];
// Separate source-of-truth lock: changing a split needs deliberate code review.
const FROZEN=Object.freeze({
  train:['go.dev','nodejs.org','rust-lang.org','kotlinlang.org','swift.org',
    'php.net','rubyonrails.org','djangoproject.com','docker.com','kubernetes.io',
    'angular.dev','react.dev','vuejs.org','svelte.dev','sqlite.org'],
  validation:['astro.build','vite.dev','tailwindcss.com','nextjs.org','palletsprojects.com'],
  holdout:['julialang.org','microsoft.com','amazon.com','oracle.com','gitlab.com',
    'gradle.org','npmjs.com','tensorflow.org','apple.com','openstreetmap.org']
});
function exactKeys(value,keys,location){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==keys.length||
    Object.keys(value).some(k=>!keys.includes(k)))
    throw Error('P14 public: forbidden, private or missing field in '+location);
}
function validHost(value){
  if(typeof value!=='string'||value.length>253||value!==value.toLowerCase()||
    value.includes('..')||value.startsWith('.')||value.endsWith('.'))
    throw Error('P14 public: invalid hostname');
  const labels=value.split('.');
  if(labels.length<2||!labels.every(s=>s.length>0&&s.length<=63&&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s))||
    !/^[a-z]{2,63}$/.test(labels.at(-1)))
    throw Error('P14 public: invalid hostname');
  return value;
}
function overlaps(a,b){
  return a===b||a.endsWith('.'+b)||b.endsWith('.'+a);
}
function validatePublicDomains(plan,knownDocument=load().known){
  exactKeys(plan,['schemaVersion','kind','frozenAt','policy','releaseEligible','domains'],'plan');
  if(plan.schemaVersion!==1||plan.kind!=='p14-public-domain-candidates-not-reviewed'||
    plan.frozenAt!=='2026-10-27'||plan.policy!=='no-network-no-holdout-evaluation'||
    plan.releaseEligible!==false||!Array.isArray(plan.domains)||
    plan.domains.length!==30)
    throw Error('P14 public: frozen plan modified');
  const known=validateKnownDomains(knownDocument);
  const roots=[],membership=Object.fromEntries(SPLITS.map(s=>[s,[]]));
  for(const row of plan.domains){
    exactKeys(row,['rootDomain','host','split','review'],'candidate');
    const root=validHost(row.rootDomain),host=validHost(row.host);
    if(host!==root&&!host.endsWith('.'+root))
      throw Error('P14 public: hostname outside declared root');
    if(!SPLITS.includes(row.split)||row.review!=='unverified-candidate')
      throw Error('P14 public: unreviewed candidate cannot claim approval');
    if(roots.some(previous=>overlaps(root,previous))||
      [...known].some(previous=>overlaps(root,previous)))
      throw Error('P14 public: duplicate, alias or known diagnostic domain');
    roots.push(root);
    membership[row.split].push(root);
  }
  for(const split of SPLITS){
    const actual=membership[split].sort();
    const expected=FROZEN[split].slice().sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))
      throw Error('P14 public: frozen '+split+' membership modified');
  }
  return {candidateDomains:roots.length,trainDomains:membership.train.length,
    validationDomains:membership.validation.length,
    reservedHoldoutDomains:membership.holdout.length,
    reviewedDomains:0,verifiedPublicPages:0,verifiedPublicDomains:0,
    verifiedBlindHoldoutPages:0,verifiedBlindHoldoutDomains:0,
    holdoutNeverFetched:true,promotionEligible:false};
}
function loadPublicDomains(){
  return JSON.parse(fs.readFileSync(FILE,'utf8'));
}
function getExplorationCandidates(plan=loadPublicDomains()){
  validatePublicDomains(plan);
  // No holdout host is passed to an exploratory browser or collector.
  return plan.domains.filter(x=>x.split!=='holdout')
    .map(({rootDomain,host,split})=>({rootDomain,host,split}));
}
function report(){
  return {kind:'p14-public-domain-preflight-v1',
    ...validatePublicDomains(loadPublicDomains()),
    networkRequests:0,accessPermissionsChecked:0,
    readyToCollect:false,holdoutEvaluationAllowed:false};
}
if(require.main===module)console.log(JSON.stringify(report(),null,2));
module.exports=Object.freeze({validHost,overlaps,validatePublicDomains,
  loadPublicDomains,getExplorationCandidates,report});
