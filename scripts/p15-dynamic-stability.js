'use strict';
// P15: compare two strict, bounded CSS/geometry samples of the same DOM.
// Stable in two captures != safe-to-paint or stable under user interaction.
const {buildRegionFeatures}=require('../content/region-features.js');
function assessRegionStability(before,after,viewports){
  const unknown=(reason,checkedRegions=null,changedRegions=null)=>({
    kind:'p15-two-snapshot-css-lab',status:'inconclusive',reason,
    checkedRegions,changedRegions,applied:false,
    trained:false,promotionEligible:false
  });
  try{
    if(buildRegionFeatures(before).status!=='ready'||
      buildRegionFeatures(after).status!=='ready')
      return unknown('sample-unavailable');
  }catch{return unknown('schema-invalid');}
  // Optional observed browser viewport dimensions. When supplied, reject
  // invalid metadata and any resize, even if normalized rectangles match.
  if(viewports!==undefined){
    const validSize=s=>s&&typeof s==='object'&&!Array.isArray(s)&&
      Object.keys(s).length===2&&Object.hasOwn(s,'width')&&
      Object.hasOwn(s,'height')&&
      Number.isSafeInteger(s.width)&&Number.isSafeInteger(s.height)&&
      s.width>=1&&s.width<=8192&&s.height>=1&&s.height<=8192;
    if(!viewports||typeof viewports!=='object'||Array.isArray(viewports)||
      Object.keys(viewports).length!==2||
      !Object.hasOwn(viewports,'before')||!Object.hasOwn(viewports,'after')||
      !validSize(viewports.before)||!validSize(viewports.after))
      return unknown('viewport-unavailable');
    if(viewports.before.width!==viewports.after.width||
      viewports.before.height!==viewports.after.height)
      return unknown('viewport-changed',before.nodes.length,null);
  }
  if(before.nodes.length!==after.nodes.length)
    return unknown('region-count-changed');
  if(before.scanned!==after.scanned)
    return unknown('coverage-changed',before.nodes.length,null);
  let changed=0;
  for(let i=0;i<before.nodes.length;i++){
    // Strict schema validation above guarantees fixed finite, primitive
    // fields only, with no text, DOM refs, CSS strings or identifiers.
    if(JSON.stringify(before.nodes[i])!==JSON.stringify(after.nodes[i]))
      changed++;
  }
  if(changed)return unknown('css-or-layout-changed',before.nodes.length,changed);
  return {kind:'p15-two-snapshot-css-lab',status:'stable-in-sample',
    reason:'identical-bounded-observations',checkedRegions:before.nodes.length,
    changedRegions:0,applied:false,trained:false,promotionEligible:false};
}
module.exports=Object.freeze({assessRegionStability});
