'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeP15RiskCoverage}=require('../scripts/p15-risk-coverage.js');
const node=(index,parent,patch={})=>({
  index,parent,background:'opaque',ownLuma:.91,effectiveLuma:.91,
  widthFraction:.4,heightFraction:.3,areaFraction:.12,
  kind:'panel',hasDirectText:false,hasProtectedDescendants:false,
  focusWithin:false,nativeDark:false,hasPseudoPaint:false,
  inFrame:false,hasOcclusionRisk:false,hasComplexAncestorPaint:false,
  hasMotionRisk:false,...patch
});
const graph=nodes=>({kind:'p15-region-graph-v1',status:'ready',
  scanned:nodes.length,nodes});
test('P15 risk coverage: count overlapping reasons, never call them converted pixels',()=>{
  const g=graph([
    node(0,-1,{kind:'canvas',ownLuma:.04,effectiveLuma:.04}),
    node(1,0,{hasOcclusionRisk:true,hasPseudoPaint:true}),
    node(2,0,{hasMotionRisk:true}),
    node(3,0,{hasProtectedDescendants:true,inFrame:true}),
    node(4,0,{hasComplexAncestorPaint:true,nativeDark:true}),
    node(5,0,{hasDirectText:true})
  ]);
  const r=summarizeP15RiskCoverage(g);
  assert.equal(r.kind,'p15-risk-coverage-v1');
  assert.equal(r.status,'measured-exploratory');
  assert.equal(r.regions,6);
  assert.equal(r.lightRegions,5);
  assert.equal(r.uncertainRegions,4);
  assert.equal(r.confirmedLightIslands,1);
  assert.deepEqual(r.reasons,{
    protectedDescendant:1,focus:0,nativeDark:1,pseudo:1,frame:1,
    occlusion:1,complexAncestor:1,motion:1,unknownPaint:0
  });
  assert.equal(r.directTextRegions,1);
  assert.equal(r.applied,false);
  assert.equal(r.promotionEligible,false);
  assert.equal(r.independentVisualReview,false);
  assert.equal('pixelCoverage' in r,false);
  assert.doesNotMatch(JSON.stringify(r),/url|href|selector|rgb\(/);
});
test('P15 risk coverage: inconclusive is not zero risks or zero white islands',()=>{
  const r=summarizeP15RiskCoverage({
    kind:'p15-region-graph-v1',status:'inconclusive',scanned:8001,nodes:[]
  });
  assert.equal(r.status,'inconclusive');
  assert.equal(r.regions,null);
  assert.equal(r.reasons,null);
  assert.equal(r.confirmedLightIslands,null);
  assert.equal(r.applied,false);
});
test('P15 risk coverage: unknown private payload or invalid flags are rejected',()=>{
  assert.throws(()=>summarizeP15RiskCoverage(graph([
    node(0,-1,{textContent:'private'})
  ])),/P15:/);
  assert.throws(()=>summarizeP15RiskCoverage(graph([
    node(0,-1,{hasMotionRisk:'false'})
  ])),/P15:/);
});
