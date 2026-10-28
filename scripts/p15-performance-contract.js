'use strict';
// Aggregation of bounded, authored P15 fixture timings; no user telemetry.
// Browser durations are JavaScript wall time; totalWallMs also includes CDP
// overhead and the explicit 60-ms gap between two captures.
const TIMING_KEYS=['firstCaptureMs','secondCaptureMs','compareMs','totalWallMs'];
const SAMPLE_KEYS=[...TIMING_KEYS,'status'];
const STATUSES=new Set(['stable-in-sample','inconclusive']);
const rounded=n=>Number(n.toFixed(3));
const validMs=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=120000;
function summarizeP15Performance(samples,exploratoryCases=12){
  if(!Array.isArray(samples)||!Number.isSafeInteger(exploratoryCases)||
    exploratoryCases<1||exploratoryCases>12||samples.length>exploratoryCases)
    throw TypeError('P15: invalid performance sample count');
  let measuredCases=0,inconclusiveStabilityCases=0;
  const observed=Object.fromEntries(TIMING_KEYS.map(k=>[k,[]]));
  for(const sample of samples){
    if(!sample||typeof sample!=='object'||Array.isArray(sample)||
      Object.keys(sample).length!==SAMPLE_KEYS.length||
      Object.keys(sample).some(k=>!SAMPLE_KEYS.includes(k))||
      !STATUSES.has(sample.status))
      throw TypeError('P15: invalid performance sample schema');
    const allNull=TIMING_KEYS.every(k=>sample[k]===null);
    const allMeasured=TIMING_KEYS.every(k=>validMs(sample[k]));
    if(!allNull&&!allMeasured)
      throw TypeError('P15: invalid or incomplete timing fields');
    if(sample.status==='inconclusive')inconclusiveStabilityCases++;
    if(allMeasured){
      measuredCases++;
      for(const k of TIMING_KEYS)observed[k].push(sample[k]);
    }
  }
  const metrics=Object.fromEntries(TIMING_KEYS.map(k=>{
    const values=observed[k].sort((a,b)=>a-b);
    const quantile=q=>rounded(values[Math.ceil(q*values.length)-1]);
    return [k,values.length?{
      p50:quantile(.5),p95:quantile(.95),
      max:rounded(values[values.length-1])
    }:null];
  }));
  return {kind:'p15-css-capture-cost-v1',
    status:measuredCases===exploratoryCases?
      'measured-exploratory':'inconclusive',
    exploratoryCases,measuredCases,
    incompleteCases:exploratoryCases-measuredCases,
    inconclusiveStabilityCases,...metrics,
    timingSemantics:'browser-js-captures-node-compare-cdp-total-includes-60ms-gap',
    independentVisualReview:false,applied:false,
    trained:false,promotionEligible:false};
}
module.exports=Object.freeze({summarizeP15Performance});
