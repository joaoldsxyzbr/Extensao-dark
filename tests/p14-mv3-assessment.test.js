'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessMv3Pair,summarizeMv3}=require('../scripts/p14-mv3-assessment.js');
const fixture=(id='canvas-shell',theme='light')=>({id,split:'train',theme});
const grid=(dark,valid=96)=>({gridPoints:96,valid,dark,bright:valid-dark,unknown:96-valid});
const plain=()=>({active:false,grid:grid(0)});
const legacy=(active=true,controls=0)=>({active,controlChanges:controls,grid:grid(80)});
test('P14 MV3: observe genuine extension output without calling it a full model comparison',()=>{
  const a=assessMv3Pair(fixture(),plain(),legacy());
  assert.equal(a.status,'observed-only');
  assert.equal(a.active,true);
  assert.equal(a.darkFractionDelta,.8333);
  assert.equal(a.fullEngineComparisonAvailable,undefined);
  assert.equal(a.promotionEligible,false);
});
test('P14 MV3: do not mask protected-control differences or inconclusive samples',()=>{
  const risk=assessMv3Pair(fixture(),plain(),legacy(true,1));
  assert.equal(risk.status,'needs-review');
  assert.equal(risk.protectedControlsChanged,1);
  const missing=assessMv3Pair(fixture(),plain(),legacy(true,null));
  assert.equal(missing.status,'inconclusive');
  const coverage=assessMv3Pair(fixture(),plain(),{
    active:true,controlChanges:0,grid:grid(10,10)});
  assert.equal(coverage.status,'inconclusive');
  assert.equal(assessMv3Pair(fixture(),plain(),legacy(false)).status,'inconclusive');
});
test('P14 MV3: native-dark requires matching screenshots, not only an inactive engine',()=>{
  const item=fixture('native-dark','native-dark');
  const missing=assessMv3Pair(item,plain(),legacy(false));
  assert.equal(missing.status,'inconclusive');
  assert.equal(missing.reason,'native-dark-screenshot-evidence-missing');
  const same=assessMv3Pair(item,
    {...plain(),screenshotDigest:'a'.repeat(64)},
    {...legacy(false),screenshotDigest:'a'.repeat(64)});
  assert.equal(same.status,'native-dark-screenshot-identical-in-sample');
  assert.equal(same.nativeDarkScreenshotIdentical,true);
  assert.equal(same.legacyDarkFraction,null);
  assert.equal(same.promotionEligible,false);
  const changed=assessMv3Pair(item,
    {...plain(),screenshotDigest:'a'.repeat(64)},
    {...legacy(false),screenshotDigest:'b'.repeat(64)});
  assert.equal(changed.status,'needs-review');
  assert.equal(changed.reason,'native-dark-screenshot-bytes-differ');
  assert.equal(assessMv3Pair(item,plain(),legacy()).status,'needs-review');
});
test('P14 MV3: forbid holdout, corrupt samples, private fields and fabricated promotion',()=>{
  assert.throws(()=>assessMv3Pair({...fixture(),split:'holdout'},plain(),legacy()),/holdout/);
  const x=assessMv3Pair(fixture(),plain(),{...legacy(),grid:{...grid(0),valid:95}});
  assert.equal(x.status,'inconclusive');
  const y=assessMv3Pair(fixture(),plain(),legacy());
  assert.throws(()=>summarizeMv3([y]),/six/);
  const six=['canvas-shell','sidebar-navigation','card-grid','direct-alert',
    'form-toolbar','native-dark'].map(id=>assessMv3Pair(fixture(id,id==='native-dark'?'native-dark':'light'),plain(),legacy(id!=='native-dark')));
  const sum=summarizeMv3(six);
  assert.equal(sum.fullEngineComparisonAvailable,false);
  assert.equal(sum.holdoutEvaluated,false);
  assert.equal(sum.promotionEligible,false);
  const corrupted=[...six];corrupted[1]={...corrupted[1],promotionEligible:true};
  assert.throws(()=>summarizeMv3(corrupted),/six/);
});
