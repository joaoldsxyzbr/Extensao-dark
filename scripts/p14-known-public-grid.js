'use strict';
// P14 extra diagnostic on P3's existing public-site lab. These are KNOWN
// diagnostic sites, not independent P14 review/validation or release evidence.
const {SITES}=require('./real-site-audit.js');
const KNOWN=new Set(SITES.map(site=>site.id));
function validGrid(grid){
  return grid&&typeof grid==='object'&&!Array.isArray(grid)&&
    Object.keys(grid).length===5&&grid.gridPoints===96&&
    ['valid','dark','bright','unknown'].every(key=>
      Number.isSafeInteger(grid[key])&&grid[key]>=0&&grid[key]<=96)&&
    grid.valid+grid.unknown===96&&grid.dark+grid.bright<=grid.valid;
}
function diagnoseKnownSiteGrid(siteId,baseline,candidate,assessment){
  // Do not accept arbitrary hosts, independent candidates or reserved holdout.
  if(typeof siteId!=='string'||!KNOWN.has(siteId))
    throw Error('P14 known-grid: site outside existing P3 diagnostic allowlist');
  const result={
    kind:'p14-known-public-css-grid-only',site:siteId,
    status:'inconclusive',reason:'unmeasured',
    gridPoints:96,baselineValidPoints:null,candidateValidPoints:null,
    baselineBrightPoints:null,candidateBrightPoints:null,
    baselineBrightFraction:null,candidateBrightFraction:null,
    changeInBrightFraction:null,
    coverageDefinition:'96-viewport-computed-css-background-points-not-pixels',
    previouslyKnownDiagnosticSite:true,
    matchedFullEngines:false,independentPublicValidation:false,
    humanReviewed:false,holdoutEvaluated:false,promotionEligible:false
  };
  if(assessment?.status==='expected-native-dark-skip'){
    result.status='not-applicable-native-theme';
    result.reason='native-theme-both-engines-inactive';
    return result;
  }
  if(!assessment||assessment.status==='inconclusive'||baseline?.kind!=='observed'||
    candidate?.kind!=='observed'){
    result.reason='incomplete-or-unmatched-public-observation';
    return result;
  }
  if(!validGrid(baseline.grid)||!validGrid(candidate.grid)){
    result.reason='invalid-or-missing-viewport-grid';
    return result;
  }
  if(baseline.grid.valid<24||candidate.grid.valid<24){
    result.reason='low-observable-viewport-coverage';
    return result;
  }
  const b=baseline.grid,c=candidate.grid;
  result.baselineValidPoints=b.valid;
  result.candidateValidPoints=c.valid;
  result.baselineBrightPoints=b.bright;
  result.candidateBrightPoints=c.bright;
  result.baselineBrightFraction=Number((b.bright/b.valid).toFixed(4));
  result.candidateBrightFraction=Number((c.bright/c.valid).toFixed(4));
  result.changeInBrightFraction=Number(
    (result.candidateBrightFraction-result.baselineBrightFraction).toFixed(4));
  const residual=c.bright>=3&&result.candidateBrightFraction>=.08;
  const newBright=c.bright>=2&&result.changeInBrightFraction>=.05;
  // A pronounced difference can indicate a regression, but known public
  // pages may render differently across isolated profiles. Require review.
  const severeIncrease=c.bright>=8&&c.bright-b.bright>=12&&
    result.changeInBrightFraction>=.20&&
    Math.abs(b.valid-c.valid)<=12;
  result.status=residual||newBright?'needs-visual-review':'observed-no-large-bright-grid-signal';
  result.reason=severeIncrease?'possible-major-bright-css-regression':
    newBright?'bright-css-increase':
    residual?'residual-bright-css-points':'bounded-grid-only';
  return result;
}
function summarizeKnownPublicGridRisks(rows){
  if(!Array.isArray(rows)||rows.length>12||rows.some(row=>
    !row||typeof row.site!=='string'||!KNOWN.has(row.site)||
    !row.p14KnownPublicGrid||
    row.p14KnownPublicGrid.site!==row.site||
    !['needs-visual-review','inconclusive','not-applicable-native-theme',
      'observed-no-large-bright-grid-signal'].includes(row.p14KnownPublicGrid.status)))
    throw Error('P14 known-grid: invalid known-public risk summary');
  return {
    kind:'p14-known-public-grid-risk-summary',
    possibleMajorBrightRegressions:rows.filter(row=>
      row.p14KnownPublicGrid.reason==='possible-major-bright-css-regression')
      .map(row=>row.site),
    sitesNeedingVisualReview:rows.filter(row=>
      row.p14KnownPublicGrid.status==='needs-visual-review').map(row=>row.site),
    unresolvedMajorBrightCoverage:rows.filter(row=>{
      const g=row.p14KnownPublicGrid;
      return g.status==='needs-visual-review' &&
        Number.isInteger(g.candidateValidPoints)&&g.candidateValidPoints>=48&&
        Number.isInteger(g.candidateBrightPoints)&&g.candidateBrightPoints>=24&&
        g.candidateBrightFraction>=.5;
    }).map(row=>row.site),
    independentValidation:false,holdoutEvaluated:false,promotionEligible:false
  };
}
module.exports=Object.freeze({validGrid,diagnoseKnownSiteGrid,summarizeKnownPublicGridRisks});
