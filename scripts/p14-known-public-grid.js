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
  // Observed bright fraction can be misleading when large portions of the
  // viewport have unknown CSS backgrounds. Keep a separate explicit coverage
  // diagnostic; never treat low coverage as a visual success.
  result.candidateKnownGridFraction=Number((c.valid/96).toFixed(4));
  result.baselineKnownGridFraction=Number((b.valid/96).toFixed(4));
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
    releaseReview:{
      status:'blocked',
      reason:rows.some(row=>row.p14KnownPublicGrid.status==='needs-visual-review')
        ?'known-public-visual-problems-unresolved'
        :'independent-visual-validation-not-done',
      requiresIndependentVisualReview:true,
      requiresHoldoutReview:true
    },
    independentValidation:false,holdoutEvaluated:false,promotionEligible:false
  };
}
// Summary for GitHub Actions, never a release approval or visual audit.
function formatKnownPublicVisualSummary(rows, risk){
  if(!Array.isArray(rows)||!risk||
     risk.kind!=='p14-known-public-grid-risk-summary'||
     risk.releaseReview?.status!=='blocked')
    throw Error('P14 known-grid: invalid summary input');
  const lines=[
    '### P14 — CSS visível em sites públicos conhecidos (diagnóstico)',
    '',
    '| Site | P3 | Extensão 7D / 18D | Pontos CSS claros no candidato | Cobertura CSS | P14 |',
    '|---|---|---|---:|---:|---|'
  ];
  for(const row of rows){
    if(!row||typeof row.site!=='string'||!KNOWN.has(row.site)||
       !row.p14KnownPublicGrid||row.p14KnownPublicGrid.site!==row.site)
      throw Error('P14 known-grid: invalid summary row');
    const g=row.p14KnownPublicGrid;
    const fraction=Number.isInteger(g.candidateBrightPoints)&&
      Number.isInteger(g.candidateValidPoints)
        ? String(g.candidateBrightPoints)+'/'+String(g.candidateValidPoints)
        : 'indisponível';
    const coverage=Number.isInteger(g.candidateValidPoints)
      ? String(g.candidateValidPoints)+'/96'
      : 'indisponível';
    const p3=row.assessment?.status;
    const p3Status=['observed-no-regression','needs-review',
      'expected-native-dark-skip','inconclusive'].includes(p3)?p3:'inconclusive';
    const activation=value=>value===true?'ativa':value===false?'inativa':'desconhecida';
    const active=activation(row.baseline?.extensionActive)+' / '+
      activation(row.candidate?.extensionActive);
    lines.push('| '+row.site+' | '+p3Status+' | '+active+' | '+fraction+
      ' | '+coverage+' | '+g.status+' |');
  }
  lines.push('','**Revisão de lançamento: bloqueada.**',
    'Áreas claras em CSS amostrado não equivalem a pixels; sites conhecidos não são holdout P14.',
    'Possíveis grandes pioras: '+(risk.possibleMajorBrightRegressions.join(', ')||'nenhuma sinalizada')+'.',
    'Cobertura majoritariamente clara: '+(risk.unresolvedMajorBrightCoverage.join(', ')||'nenhuma sinalizada')+'.','');
  return lines.join('\n');
}

// Delayed computed-CSS sampling; not proof of extension backlog or release quality.
function diagnoseKnownPublicGridTiming(siteId,early,late){
  if(typeof siteId!=='string'||!KNOWN.has(siteId))
    throw Error('P14 timing: site outside existing P3 diagnostic allowlist');
  const r={kind:'p14-known-public-css-timing',site:siteId,
    status:'inconclusive',firstBrightPoints:null,laterBrightPoints:null,
    firstValidPoints:null,laterValidPoints:null,changeInBrightPoints:null,
    followUpMs:1200,holdoutEvaluated:false,promotionEligible:false};
  if(!validGrid(early)||!validGrid(late)||early.valid<24||late.valid<24)return r;
  r.firstBrightPoints=early.bright;r.laterBrightPoints=late.bright;
  r.firstValidPoints=early.valid;r.laterValidPoints=late.valid;
  r.changeInBrightPoints=late.bright-early.bright;
  r.status=Math.abs(late.bright-early.bright)>=12&&Math.abs(late.valid-early.valid)<=12
    ?'large-change-after-delay':'no-large-comparable-change';
  return r;
}
module.exports=Object.freeze({validGrid,diagnoseKnownSiteGrid,summarizeKnownPublicGridRisks,formatKnownPublicVisualSummary,diagnoseKnownPublicGridTiming});
