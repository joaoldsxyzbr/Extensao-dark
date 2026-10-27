#!/usr/bin/env node
'use strict';
// P14: dataset contract only. No crawling, model fitting, user content or holdout eval.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const REGISTRY=path.join(ROOT,'training/datasets/p14-fixture-catalog.json');
const KNOWN=path.join(ROOT,'training/datasets/p14-known-domains.json');
const SPLITS=Object.freeze(['train','validation','holdout']);
const KINDS=new Set(['canvas','nav','cards','notice','form','table','graphics','gradient','shadow']);
const THEMES=new Set(['light','native-dark']);
const HEX=/^#[0-9a-f]{6}$/;
const IDENT=/^[a-z][a-z0-9-]{2,55}$/;
const privateKeys=/^(?:url|href|src|text|innerhtml|innertext|textcontent|cookie|email|ip|token|password|username|user|selector|dom|payload|content)$/i;
const expectedSplitCounts=Object.freeze({train:9,validation:3,holdout:3});
const expectedSplitFamilies=Object.freeze({
train:['canvas','navigation','cards','direct-text','native-theme','form','table','graphics','layered'],
validation:['gradient','interactive-state','responsive'],
holdout:['shadow-open','alpha-layers','document']
});
const allowedCatalogKeys=['schemaVersion','id','origin','frozenAt','releaseEligible','splitPolicy','targets','fixtures'];
const allowedFixtureKeys=['id','split','family','kind','theme','background','foreground','surface','directText'];
function assertKeys(object,allowed,label){
  if(!object||typeof object!=='object'||Array.isArray(object)||
    Object.keys(object).some(k=>privateKeys.test(k)||!allowed.includes(k)))
    throw TypeError('P14: '+label+' has forbidden/unknown fields');
}
function validateCatalog(catalog){
  assertKeys(catalog,allowedCatalogKeys,'catalog');
  if(catalog.schemaVersion!==1||catalog.id!=='p14-fixture-catalog-v1'||
    catalog.origin!=='synthetic-authored-no-user-data'||
    catalog.splitPolicy!=='unique-family-disjoint;holdout-never-run-in-ci'||
    catalog.frozenAt!=='2026-10-26'||catalog.releaseEligible!==false)
    throw Error('P14: frozen dataset contract changed');
  assertKeys(catalog.targets,['publicPages','publicDomains','unseenHoldoutPages','unseenHoldoutDomains'],'targets');
  const goals=catalog.targets;
  if(goals.publicPages!==120||goals.publicDomains!==30||
    goals.unseenHoldoutPages!==30||goals.unseenHoldoutDomains!==10)
    throw Error('P14: benchmark targets were changed without review');
  if(!Array.isArray(catalog.fixtures)||catalog.fixtures.length!==15)
    throw Error('P14: fixture catalog incomplete');
  const ids=new Set(),families=new Set(),grouped=Object.fromEntries(SPLITS.map(s=>[s,[]]));
  for(const item of catalog.fixtures){
    assertKeys(item,allowedFixtureKeys,'fixture');
    if(!IDENT.test(item.id)||!IDENT.test(item.family)||ids.has(item.id)||
      families.has(item.family)||!SPLITS.includes(item.split)||
      !KINDS.has(item.kind)||!THEMES.has(item.theme)||
      ![item.background,item.foreground,item.surface].every(c=>typeof c==='string'&&HEX.test(c))||
      typeof item.directText!=='boolean')
      throw Error('P14: fixture is invalid/duplicate');
    ids.add(item.id);families.add(item.family);grouped[item.split].push(item.family);
  }
  for(const split of SPLITS){
    const present=grouped[split].slice().sort();
    const frozen=expectedSplitFamilies[split].slice().sort();
    if(present.length!==expectedSplitCounts[split]||
      JSON.stringify(present)!==JSON.stringify(frozen))
      throw Error('P14: immutable split membership changed: '+split);
  }
  return {total:ids.size,train:9,validation:3,holdout:3,
    families:families.size,holdoutLocked:true};
}
function validateKnownDomains(document){
  assertKeys(document,['schemaVersion','kind','domains'],'knownDomains');
  if(document.schemaVersion!==1||document.kind!=='known-diagnostics-not-blind-holdout'||
    !Array.isArray(document.domains)||document.domains.length!==12)
    throw Error('P14: known diagnostics registry changed');
  const values=new Set();
  for(const item of document.domains){
    assertKeys(item,['domain','status'],'domain');
    if(typeof item.domain!=='string'||!/^[a-z0-9.-]+$/.test(item.domain)||
      item.domain.includes('..')||!item.domain.includes('.')||
      item.status!=='known-from-earlier-experiments'||values.has(item.domain))
      throw Error('P14: invalid or duplicate diagnostic domain');
    values.add(item.domain);
  }
  return values;
}
function load(){
  return {catalog:JSON.parse(fs.readFileSync(REGISTRY,'utf8')),
    known:JSON.parse(fs.readFileSync(KNOWN,'utf8'))};
}
function fingerprint(document){
  return crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex');
}
function selectForExploration(catalog){
  validateCatalog(catalog);
  return catalog.fixtures.filter(row=>row.split!=='holdout');
}
function reportContract(){
  const {catalog,known}=load();
  const counts=validateCatalog(catalog);
  const knownDomains=validateKnownDomains(known);
  return {kind:'p14-dataset-contract-v1',...counts,
    knownDomains:knownDomains.size,knownDiagnosticsNotHoldout:true,
    candidatePages:0,verifiedPublicPages:0,verifiedPublicDomains:0,
    realBlindHoldoutPages:0,realBlindHoldoutDomains:0,
    trainingDataReady:false,benchmarkReady:false,
    promotionEligible:false,
    origin:catalog.origin,catalogDigest:fingerprint(catalog),
    publicCorpusTarget:catalog.targets};
}
if(require.main===module){
  const r=reportContract();
  if(!process.argv.includes('--quiet'))console.log(JSON.stringify(r,null,2));
}
module.exports=Object.freeze({validateCatalog,validateKnownDomains,selectForExploration,
  reportContract,fingerprint,load,SPLITS,ROOT});
