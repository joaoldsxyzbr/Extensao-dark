'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../vendor/neural_core/neural-core.js');
const {KIND,FEATURE_COUNT,vectorize,loadCandidate,infer,safePalette}=
  require('../content/region-ai.js');
const entry=(index,parent,luma,flags={})=>({
  index,parent,background:'opaque',ownLuma:luma,effectiveLuma:luma,
  widthFraction:.5,heightFraction:.25,areaFraction:.125,kind:'panel',
  hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
  nativeDark:false,hasPseudoPaint:false,inFrame:false,
  hasOcclusionRisk:false,hasComplexAncestorPaint:false,
  hasMotionRisk:false,...flags
});
const graph=nodes=>({kind:'p15-region-graph-v1',status:'ready',
  scanned:nodes.length,nodes});
const nodes=()=>[
  entry(0,-1,.05,{kind:'canvas'}),
  entry(1,0,.94,{hasDirectText:true}),
  entry(2,0,.96,{hasProtectedDescendants:true}),
  entry(3,0,.92,{hasPseudoPaint:true})
];
const head=(outputSize,biases)=>({formatVersion:1,layers:[{
  inputSize:FEATURE_COUNT,outputSize,activation:'sigmoid',
  weights:Array(FEATURE_COUNT*outputSize).fill(0),biases
}]});
const candidate=(decision=head(1,[5]),palette=head(6,[-4,-4,-4,4,4,4]))=>({
  kind:KIND,formatVersion:1,featuresVersion:1,
  source:'synthetic-experimental-no-release',
  heads:{decision,palette}
});
test('P16 20 numeric regional features are bounded and exclude private fields',()=>{
  const v=vectorize(graph(nodes()));
  assert.equal(v.status,'ready');
  assert.equal(v.rows.length,4);
  assert.equal(v.rows[1].features.length,FEATURE_COUNT);
  assert.equal(v.rows[1].eligible,true);
  assert.equal(v.rows[2].eligible,false);
  assert.equal(v.rows[3].eligible,false);
  assert.ok(v.rows.every(x=>x.features.every(n=>n>=0&&n<=1)));
  assert.equal(/(url|textContent|cookie|href|selector|value)/i.test(JSON.stringify(v)),false);
  assert.equal(v.applied,false);
  assert.equal(v.promotionEligible,false);
});
test('P16 absence of trained candidate always abstains',()=>{
  const result=infer(graph(nodes()),null);
  assert.equal(result.rows.length,4);
  assert.equal(result.rows.every(x=>x.action==='abstain'),true);
  assert.equal(result.rows[1].reason,'no-model');
  assert.equal(result.rows[2].reason,'unsafe-region');
  assert.equal(result.promotionEligible,false);
});
test('P16 the real local neural core proposes only on safe regions',()=>{
  const model=loadCandidate(core,candidate());
  const r=infer(graph(nodes()),core,model);
  assert.equal(r.rows[0].action,'abstain');
  assert.equal(r.rows[1].action,'propose');
  assert.ok(r.rows[1].confidence>.98);
  assert.deepEqual(r.rows[1].palette.background,[5,5,5]);
  assert.deepEqual(r.rows[1].palette.foreground,[250,250,250]);
  assert.equal(r.rows[2].action,'abstain');
  assert.equal(r.rows[3].action,'abstain');
  assert.equal(r.applied,false);
  assert.equal(r.promotionEligible,false);
});
test('P16 unsafe models, invalid scores and unsafe palettes abstain or reject',()=>{
  for(const invalid of [
    {...candidate(),extra:'secret'},
    {...candidate(),featuresVersion:2},
    {...candidate(),source:'remote'},
    candidate(head(2,[5,5])),
    candidate(head(1,[5]),head(3,[5,5,5]))
  ])assert.throws(()=>loadCandidate(core,invalid),/P16:/);
  const bad=infer(graph(nodes()),core,loadCandidate(core,
    candidate(head(1,[5]),head(6,[3,3,3,3,3,3]))));
  assert.equal(bad.rows[1].action,'abstain');
  assert.equal(bad.rows[1].reason,'unsafe-palette');
  const low=infer(graph(nodes()),core,loadCandidate(core,candidate(head(1,[0]))));
  assert.equal(low.rows[1].reason,'insufficient-confidence');
  assert.equal(safePalette([0,0,0,Number.NaN,1,1]),null);
  assert.throws(()=>infer(graph(nodes()),core,{}),/P16:/);
});
test('P16 rejects injected graph data, and unknown P15 observation stays inconclusive',()=>{
  assert.throws(()=>vectorize(graph([entry(0,-1,.93,{url:'private'})])),/P15:/);
  const unknown={kind:'p15-region-graph-v1',status:'inconclusive',
    scanned:1601,nodes:[]};
  const r=infer(unknown,null);
  assert.equal(r.status,'inconclusive');
  assert.equal(r.rows.length,0);
  assert.equal(r.promotionEligible,false);
});
