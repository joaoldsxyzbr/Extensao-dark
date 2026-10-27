'use strict';
// P14: shadow-only test of P11 text RGB proposals on CSS already painted by
// the P13 lab. No P11 DOM painting, no 7D MV3 equivalence, no private content.
const ASSUMPTIONS='is-link-assumed-false-explicit-color-assumed-true';
const KIND='p14-p11-text-css-shadow-only';
const FIELDS=['kind','status','candidates','suggested','rejected',
  'differentFromP13','contextAssumptions','applied',
  'fullEngineComparisonAvailable','promotionEligible'];
function make(status,candidates=null,suggested=null,rejected=null,differentFromP13=null){
  return {kind:KIND,status,candidates,suggested,rejected,differentFromP13,
    contextAssumptions:ASSUMPTIONS,applied:false,
    fullEngineComparisonAvailable:false,promotionEligible:false};
}
function assertP11Diagnostic(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).length!==FIELDS.length||
    Object.keys(row).some(k=>!FIELDS.includes(k))||
    row.kind!==KIND||!['measured','inconclusive','no-repair-opportunity'].includes(row.status)||
    row.contextAssumptions!==ASSUMPTIONS||row.applied!==false||
    row.fullEngineComparisonAvailable!==false||row.promotionEligible!==false)
    throw TypeError('P14: invalid P11 shadow record');
  const nums=['candidates','suggested','rejected','differentFromP13'];
  if(row.status==='inconclusive'){
    if(nums.some(k=>row[k]!==null))throw TypeError('P14: inconclusive P11 must hide counts');
  }else if(nums.some(k=>!Number.isSafeInteger(row[k])||row[k]<0||row[k]>150)||
    row.suggested+row.rejected!==row.candidates||
    row.differentFromP13>row.suggested||
    (row.status==='measured'&&row.candidates===0)||
    (row.status==='no-repair-opportunity'&&row.candidates!==0))
    throw TypeError('P14: inconsistent P11 diagnostic');
  return true;
}
function compareP11TextRepairs(before,after,repairs,inputs){
  if(!inputs||!inputs.core||!inputs.model||!inputs.colors||
    typeof inputs.featuresFor!=='function'||typeof inputs.predictText!=='function')
    throw TypeError('P14: P11 candidate is required for shadow audit');
  const {core,model,colors,featuresFor,predictText}=inputs;
  const valid=a=>a&&a.truncated===false&&Array.isArray(a.rows)&&
    a.rows.length>=1&&a.rows.length<=240;
  const unknown=()=>make('inconclusive');
  if(!valid(before)||!valid(after)||before.rows.length!==after.rows.length||
    !Array.isArray(repairs)||repairs.length>150)return unknown();
  if(!repairs.length)return make('no-repair-opportunity',0,0,0,0);
  let suggested=0,rejected=0,different=0;
  const seen=new Set();
  for(const repair of repairs){
    const i=repair?.index;
    if(!Number.isSafeInteger(i)||i<0||i>=before.rows.length||
      seen.has(i)||typeof repair.background!=='string'||
      typeof repair.color!=='string')return unknown();
    seen.add(i);
    const old=before.rows[i],now=after.rows[i];
    if(!old||!now||old.protected!==false||now.protected!==false||
      typeof old.fg!=='string'||typeof old.bg!=='string'||
      typeof now.fg!=='string'||typeof now.bg!=='string'||
      !Number.isFinite(old.size)||!Number.isFinite(old.weight)||
      old.size<=0||old.weight<=0||repair.background!==now.bg)return unknown();
    const oldFg=colors.parseColor(old.fg),oldBg=colors.parseColor(old.bg),
      target=colors.parseColor(now.bg),teacher=colors.parseColor(repair.color);
    if(!oldFg||!oldBg||!target||!teacher||
      [oldFg,oldBg,target,teacher].some(c=>c.a!==1))return unknown();
    const isLarge=old.size>=24||(old.size>=18.66&&old.weight>=700);
    const contrast=isLarge?3:4.5;
    if(colors.contrastRatio(teacher,target)+.0001<contrast)return unknown();
    // P13 does not expose original link/explicit declaration semantics.
    // These are PROXY assumptions, not reconstructed P11 inference context.
    const features=featuresFor(colors,{background:now.bg,text:old.fg,
      sourceBackground:old.bg,isLink:false,isLarge,explicitColor:true});
    const prediction=predictText(core,model,features,colors);
    if(prediction?.action==='reject'&&
      prediction.reason==='insufficient-neural-contrast'){rejected++;continue;}
    if(prediction?.action!=='suggest'||typeof prediction.color!=='string')
      return unknown();
    const proposed=colors.parseColor(prediction.color);
    if(!proposed||proposed.a!==1||
      colors.contrastRatio(proposed,target)+.0001<contrast)return unknown();
    suggested++;
    if(proposed.r!==teacher.r||proposed.g!==teacher.g||
      proposed.b!==teacher.b)different++;
  }
  const report=make('measured',repairs.length,suggested,rejected,different);
  assertP11Diagnostic(report);
  return report;
}
module.exports=Object.freeze({compareP11TextRepairs,assertP11Diagnostic});
