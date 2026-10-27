'use strict';
// P14: proposal-only diagnostic of two DIFFERENT decision policies over
// the same P13-computed CSS samples. 7D lacks ancestral context here, so
// this is NOT a full runtime/quality/performance comparison.
const colors=require('../content/colors.js');
const neural=require('../content/neural.js');
const {planIslands}=require('./p13-islands.js');
const threshold=require('../data/neural-thresholds.json').baseline;
const KEYS=['kind','inputSurfaces','p13Proposed','legacy7dWouldAccept',
  'agreementOnP13','threshold','ancestorContext','applied','modelComparisonMatched',
  'promotionEligible'];
function compareProposals(samples,inputs={colors,neural,threshold,planner:planIslands}){
  if(!Array.isArray(samples)||samples.length<1||samples.length>24)
    throw TypeError('P14: invalid proposal sample list');
  const {colors:c,neural:n,threshold:t,planner}=inputs;
  if(!c||!n||n.MODEL?.input!==7||typeof n.probability!=='function'||
    typeof planner!=='function'||t!==0.8)
    throw TypeError('P14: expected distributed 7D and frozen threshold');
  const p13=planner(samples,c);
  if(!Array.isArray(p13)||p13.length>samples.length)
    throw TypeError('P14: malformed P13 proposal list');
  const included=new Set(p13.map(p=>p.index));
  if(included.size!==p13.length||p13.some(p=>!Number.isSafeInteger(p.index)||
    p.index<0||p.index>=samples.length))
    throw TypeError('P14: duplicate/out of bounds P13 proposals');
  let legacy7dWouldAccept=0,agreementOnP13=0;
  for(let i=0;i<samples.length;i++){
    const row=samples[i];
    const bg=c.parseColor(row?.background),fg=c.parseColor(row?.foreground);
    if(!bg||!fg||bg.a<.999||fg.a<.999)
      throw TypeError('P14: invalid opaque computed colors');
    // UNKNOWN ancestor mapped to 1 by neuralFeatures. This is a component
    // diagnostic, not the complete 7D runtime or a parity claim.
    const x=c.neuralFeatures(bg,fg,null,{control:false,selected:false});
    if(!Array.isArray(x)||x.length!==7)throw TypeError('P14: wrong feature vector');
    const score=n.probability(x);
    if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>1)
      throw TypeError('P14: invalid 7D decision');
    const accepted=score>=t;
    if(accepted)legacy7dWouldAccept++;
    if(accepted&&included.has(i))agreementOnP13++;
  }
  const record={
    kind:'p14-matched-css-proposals-only',inputSurfaces:samples.length,
    p13Proposed:p13.length,legacy7dWouldAccept,agreementOnP13,
    threshold:t,ancestorContext:'unknown-assumed-light',
    applied:false,modelComparisonMatched:false,promotionEligible:false
  };
  assertProposalRecord(record);
  return record;
}
function assertProposalRecord(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).length!==KEYS.length||
    Object.keys(row).some(k=>!KEYS.includes(k))||
    row.kind!=='p14-matched-css-proposals-only'||
    !Number.isSafeInteger(row.inputSurfaces)||row.inputSurfaces<1||
    row.inputSurfaces>24||
    !['p13Proposed','legacy7dWouldAccept','agreementOnP13'].every(k=>
      Number.isSafeInteger(row[k])&&row[k]>=0&&row[k]<=row.inputSurfaces)||
    row.agreementOnP13>Math.min(row.p13Proposed,row.legacy7dWouldAccept)||
    row.threshold!==.8||row.ancestorContext!=='unknown-assumed-light'||
    row.applied!==false||row.modelComparisonMatched!==false||
    row.promotionEligible!==false)
    throw TypeError('P14: unsafe or invalid proposal diagnostic');
  return true;
}
module.exports=Object.freeze({compareProposals,assertProposalRecord});
