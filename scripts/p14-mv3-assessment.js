'use strict';
// P14: observational comparison only. No synthetic result authorizes release.
function validGrid(g){
  return g&&typeof g==='object'&&g.gridPoints===96&&
    ['valid','dark','bright','unknown'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=0&&g[k]<=96)&&
    g.valid+g.unknown===96&&g.dark<=g.valid&&g.bright<=g.valid;
}
function assessMv3Pair(item,plain,legacy){
  if(!item||!['train','validation'].includes(item.split)||
    typeof item.id!=='string'||!(/^[a-z][a-z0-9-]{2,55}$/).test(item.id)||
    !['light','native-dark'].includes(item.theme))
    throw Error('P14 MV3: unexpected fixture or holdout');
  const base={caseId:item.id,split:item.split,kind:'synthetic-mv3-observation',
    status:'inconclusive',reason:'missing-snapshot',active:null,
    originalDarkFraction:null,legacyDarkFraction:null,
    darkFractionDelta:null,protectedControlsChanged:null,
    sampledPointsOnly:true,nativeDarkScreenshotIdentical:null,
    independentVisualReview:false,promotionEligible:false};
  if(!plain||!legacy||!validGrid(plain.grid)||!validGrid(legacy.grid)||
    typeof legacy.active!=='boolean'||typeof plain.active!=='boolean'||
    plain.active||!['number','object'].includes(typeof legacy.controlChanges))
    return base;
  base.active=legacy.active;
  if(item.theme==='native-dark'){
    if(legacy.active){
      base.status='needs-review';base.reason='native-dark-engine-active';
      return base;
    }
    const digest=/^[a-f0-9]{64}$/;
    if(!digest.test(plain.screenshotDigest)||!digest.test(legacy.screenshotDigest)){
      base.reason='native-dark-screenshot-evidence-missing';
      return base;
    }
    base.nativeDarkScreenshotIdentical=plain.screenshotDigest===legacy.screenshotDigest;
    base.status=base.nativeDarkScreenshotIdentical?
      'native-dark-screenshot-identical-in-sample':'needs-review';
    base.reason=base.nativeDarkScreenshotIdentical?
      'native-dark-screenshot-bytes-identical':'native-dark-screenshot-bytes-differ';
    return base;
  }
  if(!legacy.active){base.reason='engine-not-active';return base;}
  if(plain.grid.valid<20||legacy.grid.valid<20){
    base.reason='insufficient-grid-coverage';return base;
  }
  if(legacy.controlChanges===null||!Number.isSafeInteger(legacy.controlChanges)||
    legacy.controlChanges<0||legacy.controlChanges>64){
    base.reason='protected-controls-unmeasured';return base;
  }
  base.originalDarkFraction=Number((plain.grid.dark/plain.grid.valid).toFixed(4));
  base.legacyDarkFraction=Number((legacy.grid.dark/legacy.grid.valid).toFixed(4));
  base.darkFractionDelta=Number((base.legacyDarkFraction-base.originalDarkFraction).toFixed(4));
  base.protectedControlsChanged=legacy.controlChanges;
  base.status=legacy.controlChanges>0?'needs-review':'observed-only';
  base.reason=legacy.controlChanges>0?'protected-controls-css-difference':
    'bounded-synthetic-observation';
  return base;
}
function summarizeMv3(rows){
  if(!Array.isArray(rows)||rows.length!==6||
    new Set(rows.map(x=>x.caseId)).size!==6||
    rows.some(x=>!x||x.kind!=='synthetic-mv3-observation'||
      x.promotionEligible!==false||x.independentVisualReview!==false))
    throw Error('P14 MV3: expected exactly six independent exploration rows');
  return {kind:'p14-legacy-mv3-synthetic-observation',
    fixtures:rows.length,observed:rows.filter(x=>x.status==='observed-only').length,
    nativeDarkScreenshotMatched:rows.filter(x=>x.status==='native-dark-screenshot-identical-in-sample').length,
    needsReview:rows.filter(x=>x.status==='needs-review').length,
    inconclusive:rows.filter(x=>x.status==='inconclusive').length,
    siteKind:'authored-local-fixtures-not-public-sites',
    viewportMeasurement:'96-computed-background-points-not-pixel-area',
    legacyEngine:'actual-distributed-mv3-7d-in-isolated-chromium',
    comparisonToP13:'not-matched-across-full-engines',
    latencyMeasured:false,fullEngineComparisonAvailable:false,
    independentVisualReview:false,holdoutEvaluated:false,promotionEligible:false,
    cases:rows};
}
module.exports=Object.freeze({assessMv3Pair,summarizeMv3,validGrid});
