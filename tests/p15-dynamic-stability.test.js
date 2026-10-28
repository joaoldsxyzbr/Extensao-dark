'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessRegionStability}=require('../scripts/p15-dynamic-stability.js');

function entry(index,parent,extra={}){
  return {index,parent,background:'opaque',ownLuma:.92,
    effectiveLuma:.92,widthFraction:.4,heightFraction:.3,
    areaFraction:.12,kind:'panel',hasDirectText:false,
    hasProtectedDescendants:false,focusWithin:false,nativeDark:false,
    hasPseudoPaint:false,inFrame:false,hasOcclusionRisk:false,
    hasComplexAncestorPaint:false,hasMotionRisk:false,...extra};
}
function snapshot(nodes,scanned=nodes.length){
  return {kind:'p15-region-graph-v1',status:'ready',scanned,nodes};
}
test('P15: unchanged samples are only stable-in-sample, never promotion',()=>{
  const a=snapshot([entry(0,-1),entry(1,0,{ownLuma:.9,effectiveLuma:.9})]);
  const result=assessRegionStability(a,JSON.parse(JSON.stringify(a)));
  assert.equal(result.status,'stable-in-sample');
  assert.equal(result.checkedRegions,2);
  assert.equal(result.changedRegions,0);
  assert.equal(result.promotionEligible,false);
  assert.equal(result.applied,false);
  assert.equal(result.trained,false);
  assert.equal(JSON.stringify(result).includes('nodes'),false);
});
test('P15: dynamic CSS color/layout/interaction changes are inconclusive',()=>{
  const a=snapshot([entry(0,-1),entry(1,0)]);
  for(const patch of [
    {ownLuma:.15,effectiveLuma:.15},{areaFraction:.14},
    {widthFraction:.5},{hasOcclusionRisk:true},
    {hasProtectedDescendants:true},{hasComplexAncestorPaint:true},
    {focusWithin:true},{hasPseudoPaint:true},{inFrame:true}
  ]){
    const b=snapshot([entry(0,-1),entry(1,0,patch)]);
    const result=assessRegionStability(a,b);
    assert.equal(result.status,'inconclusive');
    assert.equal(result.reason,'css-or-layout-changed');
    assert.equal(result.checkedRegions,2);
    assert.equal(result.changedRegions,1);
    assert.equal(result.promotionEligible,false);
  }
});
test('P15: DOM insert/reorder or changing scanned coverage abstains',()=>{
  const a=snapshot([entry(0,-1),entry(1,0)]);
  const inserted=snapshot([entry(0,-1),entry(1,0),entry(2,1)]);
  const dropped=snapshot([entry(0,-1)]);
  for(const b of [inserted,dropped]){
    const r=assessRegionStability(a,b);
    assert.equal(r.status,'inconclusive');
    assert.equal(r.reason,'region-count-changed');
    assert.equal(r.changedRegions,null);
  }
  const rescanned=snapshot(a.nodes,3);
  assert.equal(assessRegionStability(a,rescanned).status,'inconclusive');
  assert.equal(assessRegionStability(a,rescanned).reason,'coverage-changed');
});
test('P15: invalid/partial samples never produce misleading counts',()=>{
  const a=snapshot([entry(0,-1)]);
  const unknown={kind:'p15-region-graph-v1',status:'inconclusive',scanned:1,nodes:[]};
  for(const b of [null,unknown,snapshot([entry(0,-1,{text:'sensitive'})]),
    snapshot([entry(0,-1,{areaFraction:NaN})])]){
    const r=assessRegionStability(a,b);
    assert.equal(r.status,'inconclusive');
    assert.equal(r.checkedRegions,null);
    assert.equal(r.changedRegions,null);
    assert.equal(r.promotionEligible,false);
    assert.doesNotMatch(JSON.stringify(r),/sensitive|https?:\/\/|rgb\(/);
  }
});

test('P15: same CSS but changed viewport must invalidate temporal comparison',()=>{
  const a=snapshot([entry(0,-1),entry(1,0)]);
  const result=assessRegionStability(a,a,{
    before:{width:1200,height:800},after:{width:960,height:800}
  });
  assert.equal(result.status,'inconclusive');
  assert.equal(result.reason,'viewport-changed');
  assert.equal(result.checkedRegions,2);
  assert.equal(result.changedRegions,null);
  assert.equal(result.applied,false);
  assert.equal(result.promotionEligible,false);
  const stable=assessRegionStability(a,a,{
    before:{width:1200,height:800},after:{width:1200,height:800}
  });
  assert.equal(stable.status,'stable-in-sample');
  assert.equal(stable.promotionEligible,false);
});
test('P15: invalid viewport metadata fails closed, no unsafe geometry',()=>{
  const a=snapshot([entry(0,-1)]);
  for(const info of [
    {before:{width:1200,height:800},after:null},
    {before:{width:1200,height:800},after:{width:0,height:800}},
    {before:{width:1200,height:800},after:{width:'1200',height:800}},
    {before:{width:1200,height:800,url:'secret'},after:{width:1200,height:800}},
    {before:{width:1200,height:800},after:{width:1200,height:9000}}
  ]){
    const r=assessRegionStability(a,a,info);
    assert.equal(r.status,'inconclusive');
    assert.equal(r.reason,'viewport-unavailable');
    assert.equal(r.promotionEligible,false);
    assert.doesNotMatch(JSON.stringify(r),/secret|https?:\/\//);
  }
});
test('P15: animation and focus-state samples may not claim stability after changes',()=>{
  const a=snapshot([entry(0,-1),entry(1,0)]);
  const animated=snapshot([entry(0,-1),entry(1,0,{hasMotionRisk:true})]);
  assert.equal(assessRegionStability(a,animated).status,'inconclusive');
  assert.equal(assessRegionStability(a,animated).reason,'css-or-layout-changed');
  const focused=snapshot([entry(0,-1),entry(1,0,{focusWithin:true})]);
  assert.equal(assessRegionStability(a,focused).status,'inconclusive');
});

test('P15: identical captures during an active animation are still inconclusive',()=>{
  const animated=snapshot([entry(0,-1),entry(1,0,{hasMotionRisk:true})]);
  const result=assessRegionStability(animated,animated,{
    before:{width:1200,height:800},after:{width:1200,height:800}
  });
  assert.equal(result.status,'inconclusive');
  assert.equal(result.reason,'motion-risk-present');
  assert.equal(result.checkedRegions,2);
  assert.equal(result.changedRegions,0);
  assert.equal(result.promotionEligible,false);
  assert.equal(result.applied,false);
});
