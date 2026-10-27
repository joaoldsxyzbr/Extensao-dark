#!/usr/bin/env node
'use strict';
// P14 benchmark schema and aggregation. Missing observations stay null, never zero.
// This file does not execute or train any model.
const fs=require('node:fs');
const path=require('node:path');
const {reportContract,ROOT}=require('./p14-dataset-contract.js');
const ALLOWED_STATUS=new Set(['safe-in-sample','blocked','inconclusive']);
const METRICS=[
  'candidateSurfaces','convertedSurfaces','auditedText','newWeak',
  'repairedText','durationMs','eligibleAreaFraction','darkAreaFraction',
  'controlsChanged','restorationVerified'
];
function selectNumeric(value,name){
  if(value===undefined||value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
    throw TypeError('P14: invalid numeric metric '+name);
  return value;
}
function quantile(values,p){
  if(!values.length)return null;
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1];
}
function validateMeasurement(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    typeof row.caseId!=='string'||!/^[a-z][a-z0-9-]{2,55}$/.test(row.caseId)||
    !['train','validation','diagnostic'].includes(row.split)||
    !ALLOWED_STATUS.has(row.status)||row.source!=='isolated-browser'||
    typeof row.model!=='string'||!['p13-rule-baseline','7d-legacy','p11-text'].includes(row.model)||
    Object.keys(row).some(k=>!['caseId','split','status','model','source','reason',...METRICS].includes(k)))
    throw TypeError('P14: unknown, private or malformed benchmark observation');
  if(row.reason!==undefined&&
    (typeof row.reason!=='string'||!/^[a-z0-9-]{1,70}$/.test(row.reason)))
    throw TypeError('P14: reason must be a fixed code');
  for(const name of METRICS){
    if(name==='restorationVerified'){
      if(row[name]!==null&&row[name]!==undefined&&typeof row[name]!=='boolean')
        throw TypeError('P14: invalid rollback metric');
    }else{
      const x=selectNumeric(row[name],name);
      if(['eligibleAreaFraction','darkAreaFraction'].includes(name)&&x!==null&&x>1)
        throw TypeError('P14: fraction outside 0..1');
    }
  }
  if(row.status==='safe-in-sample'&&(
    row.newWeak!==0||row.restorationVerified!==true||
    row.auditedText===null||row.auditedText===undefined||
    row.auditedText<1))
    throw Error('P14: unsafe or incomplete result cannot pass');
  return true;
}
function aggregate(rows,{model='p13-rule-baseline'}={}){
  if(!Array.isArray(rows)||rows.length>200||rows.some(x=>x.model!==model))
    throw TypeError('P14: invalid/unmatched benchmark rows');
  const ids=new Set();
  for(const row of rows){
    validateMeasurement(row);
    if(ids.has(row.caseId))throw Error('P14: duplicate scenario or mixed baseline');
    ids.add(row.caseId);
  }
  const safe=rows.filter(x=>x.status==='safe-in-sample');
  const durations=safe.map(x=>x.durationMs).filter(x=>x!==null&&x!==undefined);
  const darkFractions=safe.map(x=>x.darkAreaFraction).filter(x=>x!==null&&x!==undefined);
  const eligibleFractions=safe.map(x=>x.eligibleAreaFraction).filter(x=>x!==null&&x!==undefined);
  const sum=key=>safe.reduce((n,row)=>n+(row[key]||0),0);
  return {model,cases:rows.length,safe:safe.length,
    blocked:rows.filter(x=>x.status==='blocked').length,
    inconclusive:rows.filter(x=>x.status==='inconclusive').length,
    auditedText:sum('auditedText'),
    newlyWeakInAccepted:sum('newWeak'),
    correctedTexts:sum('repairedText'),
    durationMedianMs:quantile(durations,.5),
    durationP95Ms:quantile(durations,.95),
    measuredDarkFractionMedian:quantile(darkFractions,.5),
    measuredEligibleFractionMedian:quantile(eligibleFractions,.5),
    measuredAreaCases:darkFractions.length,
    coverageDefinition:'viewport-grid-sampled-points-not-pixel-area',
    qualityGate:'not-evaluated',
    promotionEligible:false};
}
function fromP13Report(data){
  if(!data||data.kind!=='p13-multi-surface-isolated-preview'||
    !Array.isArray(data.scenarios)||data.scenarios.length>30)
    throw Error('P14: expected an isolated P13 report');
  const rows=data.scenarios.map(x=>{
    if(!x||!['local-fixture','public-page'].includes(x.source))
      throw TypeError('P14: unsupported scenario source');
    const status=ALLOWED_STATUS.has(x.status)?x.status:'inconclusive';
    return {caseId:x.id,split:'diagnostic',source:'isolated-browser',
      model:'p13-rule-baseline',status,
      reason:status==='inconclusive'?'incomplete-diagnostic':undefined,
      candidateSurfaces:selectNumeric(x.candidates,'candidates'),
      convertedSurfaces:selectNumeric(x.planned,'planned'),
      auditedText:selectNumeric(x.auditedText,'auditedText'),
      newWeak:status==='safe-in-sample'?selectNumeric(x.newWeak,'newWeak'):null,
      repairedText:selectNumeric(x.repairCount,'repairCount'),
      durationMs:null,eligibleAreaFraction:null,darkAreaFraction:null,
      controlsChanged:null,restorationVerified:x.restorationVerified===true?true:null};
  });
  return aggregate(rows);
}
function buildReport(benchmark=null){
  const contract=reportContract();
  return {schemaVersion:1,kind:'p14-benchmark-contract',
    catalogDigest:contract.catalogDigest,
    syntheticFixtureCount:contract.total,
    exploratoryFixtureCount:contract.train+contract.validation,
    holdoutFixturesNotExecuted:contract.holdout,
    realPublicBlindHoldoutVerified:0,
    models:[
      {model:'7d-legacy',status:'not-measured-on-matched-p14-fixtures'},
      {model:'p11-text',status:'not-measured-on-matched-p14-fixtures'},
      {model:'p13-rule-baseline',status:benchmark?'diagnostic-observed':'not-measured',
        aggregate:benchmark}
    ],
    matchedModelComparisonAvailable:false,
    independentVisualReview:false,
    promotionEligible:false,
    message:'P14 is dataset and benchmark scaffolding only. No blind real-site evaluation or deployable model approval.'};
}
function main(){
  const inputArg=process.argv.find(s=>s.startsWith('--input='));
  const outputArg=process.argv.find(s=>s.startsWith('--output='));
  if(Boolean(inputArg)!==Boolean(outputArg))
    throw Error('P14: input and output must be supplied together');
  let benchmark=null;
  if(inputArg){
    const file=path.resolve(inputArg.slice(8));
    const output=path.resolve(outputArg.slice(9));
    const root=path.join(ROOT,'browser-results')+path.sep;
    if(!file.startsWith(root)||!output.startsWith(root)||
      !file.endsWith('.json')||!output.endsWith('.json')||file===output)
      throw Error('P14: output/input may only use disposable browser-results JSON');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    benchmark=fromP13Report(data);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(buildReport(benchmark),null,2)+'\n');
  }
  console.log(JSON.stringify(buildReport(benchmark)));
}
if(require.main===module)main();
module.exports=Object.freeze({validateMeasurement,aggregate,fromP13Report,buildReport,quantile});
