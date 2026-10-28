'use strict';
// Read-only CSS region uncertainty summary. Counts can overlap and are not
// converted pixel areas, style recommendations or model-training labels.
const {buildRegionFeatures}=require('../content/region-features.js');
function summarizeP15RiskCoverage(graph){
  const result=buildRegionFeatures(graph);
  const base={kind:'p15-risk-coverage-v1',status:'inconclusive',
    regions:null,lightRegions:null,uncertainRegions:null,
    confirmedLightIslands:null,directTextRegions:null,reasons:null,
    pixelAreaMeasured:false,independentVisualReview:false,
    applied:false,trained:false,promotionEligible:false};
  if(result.status!=='ready')return base;
  const counts={
    protectedDescendant:0,focus:0,nativeDark:0,pseudo:0,frame:0,
    occlusion:0,complexAncestor:0,motion:0,unknownPaint:0
  };
  for(const n of graph.nodes){
    if(n.hasProtectedDescendants)counts.protectedDescendant++;
    if(n.focusWithin)counts.focus++;
    if(n.nativeDark)counts.nativeDark++;
    if(n.hasPseudoPaint)counts.pseudo++;
    if(n.inFrame)counts.frame++;
    if(n.hasOcclusionRisk)counts.occlusion++;
    if(n.hasComplexAncestorPaint)counts.complexAncestor++;
    if(n.hasMotionRisk)counts.motion++;
    if(n.background!=='opaque'||n.effectiveLuma===null)counts.unknownPaint++;
  }
  return {...base,status:'measured-exploratory',
    regions:result.regionCount,lightRegions:result.lightRegions,
    uncertainRegions:result.uncertainRegions,
    confirmedLightIslands:result.rows.filter(x=>x.confirmedLightIsland).length,
    directTextRegions:result.rows.filter(x=>x.hasDirectText).length,
    reasons:counts};
}
module.exports=Object.freeze({summarizeP15RiskCoverage});
