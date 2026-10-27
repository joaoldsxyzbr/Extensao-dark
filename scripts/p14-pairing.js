'use strict';
// P14: paired comparison of two LAB PAINT treatments on authored fixture CSS.
// This cannot replace full legacy 7D MV3 / P11 / real-page evaluation.
const {validateMeasurement}=require('./p14-benchmark-contract.js');
function pairSyntheticModes(p13,gated){
  if(!Array.isArray(p13)||!Array.isArray(gated)||
    p13.length!==gated.length||p13.length<1||p13.length>12)
    throw TypeError('P14: unmatched paired fixture counts');
  const ids=new Set(),cases=[];
  for(let i=0;i<p13.length;i++){
    const a=p13[i],b=gated[i];
    if(!a||!b||a.model!=='p13-rule-baseline'||
      b.model!=='7d-gated-p13-lab'||a.caseId!==b.caseId||
      a.split!==b.split||!['train','validation'].includes(a.split)||
      ids.has(a.caseId))
      throw TypeError('P14: mismatched or duplicate paired fixture');
    ids.add(a.caseId);
    for(const row of [a,b]){
      if(row.baselineDigest!==undefined&&(
        typeof row.baselineDigest!=='string'||
        !/^[a-f0-9]{64}$/.test(row.baselineDigest)))
        throw TypeError('P14: malformed CSS baseline fingerprint');
      if(row.status==='safe-in-sample'&&!row.baselineDigest)
        throw TypeError('P14: safe paint requires CSS baseline fingerprint');
      const {baselineDigest,...measurement}=row;
      validateMeasurement(measurement);
    }
    if(a.baselineDigest!==b.baselineDigest)
      throw Error('P14: CSS baseline differed between browser profiles');
    const baselineMatched=typeof a.baselineDigest==='string';
    const comparable=baselineMatched&&[a,b].every(x=>x.status==='safe-in-sample'&&
      x.restorationVerified===true&&
      typeof x.darkAreaFraction==='number'&&
      Number.isFinite(x.darkAreaFraction));
    cases.push({caseId:a.caseId,split:a.split,
      p13Status:a.status,gatedStatus:b.status,
      darkFractionP13:comparable?a.darkAreaFraction:null,
      darkFractionGated:comparable?b.darkAreaFraction:null,
      deltaGatedMinusP13:comparable?
        Number((b.darkAreaFraction-a.darkAreaFraction).toFixed(4)):null,
      sampledViewportOnly:true,baselineMatched,comparable});
  }
  return {kind:'p14-paired-synthetic-lab-not-legacy-runtime',
    fixturePairs:cases.length,
    matchedSyntheticCases:cases.filter(x=>x.baselineMatched).length,
    measuredPairs:cases.filter(x=>x.comparable).length,
    sampleDefinition:'96-computed-background-points-not-pixel-area',
    note:'7D only gates P13 patches; both modes paint with P13. Missing ancestor context and P11 make full engines not comparable.',
    p11Measured:false,fullEngineComparisonAvailable:false,
    independentHumanReview:false,promotionEligible:false,cases};
}
module.exports=Object.freeze({pairSyntheticModes});
