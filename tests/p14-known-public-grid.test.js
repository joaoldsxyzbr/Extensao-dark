'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validGrid,diagnoseKnownSiteGrid}=
  require('../scripts/p14-known-public-grid.js');
const grid=(bright,valid=96,dark=valid-bright)=>({
  gridPoints:96,valid,dark,bright,unknown:96-valid
});
const observed=bright=>({kind:'observed',grid:grid(bright)});
const assessment={status:'observed-no-regression'};
test('P14 known public: no large bright grid signal is not independent validation',()=>{
  const r=diagnoseKnownSiteGrid('mdn',observed(2),observed(2),assessment);
  assert.equal(r.status,'observed-no-large-bright-grid-signal');
  assert.equal(r.candidateBrightPoints,2);
  assert.equal(r.independentPublicValidation,false);
  assert.equal(r.promotionEligible,false);
  assert.equal(r.holdoutEvaluated,false);
});
test('P14 known public: persistent or new bright CSS points require review',()=>{
  const residual=diagnoseKnownSiteGrid('wikipedia',observed(12),observed(12),assessment);
  assert.equal(residual.status,'needs-visual-review');
  assert.equal(residual.reason,'residual-bright-css-points');
  const introduced=diagnoseKnownSiteGrid('github',observed(0),observed(5),assessment);
  assert.equal(introduced.status,'needs-visual-review');
  assert.equal(introduced.changeInBrightFraction,.0521);
});
test('P14 known public: unknown, malformed and low-coverage CSS cannot pass',()=>{
  const invalid=[
    null,{},grid(1,8,7),{...grid(1),valid:95},
    {...grid(1),bright:100},{...grid(1),dark:96},
    {...grid(1),url:'https://private.example'},
  ];
  for(const bad of invalid){
    assert.equal(diagnoseKnownSiteGrid('mdn',observed(0),
      {kind:'observed',grid:bad},assessment).status,'inconclusive');
  }
  assert.equal(validGrid(grid(4)),true);
  assert.equal(diagnoseKnownSiteGrid('mdn',observed(0),observed(0),
    {status:'inconclusive'}).status,'inconclusive');
});
test('P14 known public: native-dark skip is not a darkening result',()=>{
  const r=diagnoseKnownSiteGrid('roblox',observed(0),observed(0),
    {status:'expected-native-dark-skip'});
  assert.equal(r.status,'not-applicable-native-theme');
  assert.equal(r.candidateBrightFraction,null);
  assert.equal(r.promotionEligible,false);
});
test('P14 known public: reject non-P3 sites including P14 final holdout',()=>{
  for(const host of ['julialang.org','gitlab.com','go.dev','vite.dev','not-a-site']){
    assert.throws(()=>diagnoseKnownSiteGrid(host,observed(0),observed(0),assessment),
      /outside existing P3 diagnostic allowlist/);
  }
});
