#!/usr/bin/env node
'use strict';
// P14: isolated synthetic browser baseline. No users, no personal websites,
// no production extension, and absolutely no final holdout evaluation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {ROOT,reportContract}=require('./p14-dataset-contract.js');
const {getExplorationFixtures,buildPage}=require('./p14-fixture-pages.js');
const {aggregate,buildReport}=require('./p14-benchmark-contract.js');
const {planIslands,suggestTextRepair,evaluateIslandContrast,islandSession}
 =require('./p13-islands.js');
const {launch}=require('./browser-e2e.js');
const {compareProposals,gateP13WithLegacy}=require('./p14-matched-proposals.js');
const {pairSyntheticModes}=require('./p14-pairing.js');
const {verifySampledRollback}=require('./p14-rollback-audit.js');
const {compareP11TextRepairs}=require('./p14-p11-shadow.js');
const {captureP11TextContext}=require('./p14-p11-context.js');
const {captureRegionGraph}=require('../content/region-graph.js');
const {buildRegionFeatures}=require('../content/region-features.js');
const {captureProtectedControls,countProtectedControlChanges}=
  require('./p14-protected-controls.js');
const OUTPUT=path.join(ROOT,'browser-results/p14-first-ai');
const JS=(fn,...args)=>'('+fn.toString()+')('+args.map(JSON.stringify).join(',')+')';
// Gridded computed background sampling: approximate *viewport sample points*;
// NOT measured pixel area, real screenshot segmentation or visual judgment.
function sampleBackgroundGrid(){
  let valid=0,dark=0,bright=0,unknown=0;
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
    const el=document.elementFromPoint((x+.5)*innerWidth/12,
      (y+.5)*innerHeight/8);
    if(!el||el.closest('button,input,textarea,select,svg,img,video,canvas')){
      unknown++;continue;
    }
    let color=null,cur=el;
    for(let depth=0;cur&&depth<16;cur=cur.parentElement,depth++){
      const st=getComputedStyle(cur),bg=st.backgroundColor;
      if(st.backgroundImage!=='none'||st.opacity!=='1'){color=null;break;}
      const m=/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(bg);
      if(m){color=m.slice(1).map(Number);break;}
      const transparent=/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0(?:\.0+)?\s*\)$/.test(bg);
      if(!transparent){color=null;break;}
    }
    if(!color){unknown++;continue;}
    valid++;
    const max=Math.max(...color),min=Math.min(...color);
    if(min>=182&&max-min<60)bright++;
    if(max<=112)dark++;
  }
  return {gridPoints:96,valid,dark,bright,unknown};
}
async function explore(item,baseUrl,mode='p13-rule-baseline',p11Inputs=null){
  if(!['p13-rule-baseline','7d-gated-p13-lab'].includes(mode))
    throw TypeError('P14: unknown preview mode');
  const result={caseId:item.id,split:item.split,model:mode,
    source:'isolated-browser',status:'inconclusive',
    reason:'unmeasured',candidateSurfaces:null,convertedSurfaces:null,
    auditedText:null,newWeak:null,repairedText:null,durationMs:null,
    eligibleAreaFraction:null,darkAreaFraction:null,
    controlsChanged:null,restorationVerified:null};
  let browser,started=false,phaseOpen=false,baseline=null,areaBefore=null;
  let baselineControls=null;
  try{
    browser=await launch(null);
    await browser.page.navigate(baseUrl+'/'+item.id,{fixtureReady:true});
    const ready=await browser.page.eval(JS(islandSession,'start'));
    if(ready.status!=='ready'){
      result.reason='no-safe-fixture-surface';return result;
    }
    started=true;
    result.candidateSurfaces=ready.samples.length;
    if(mode==='p13-rule-baseline'){
      const graph=await browser.page.eval(JS(captureRegionGraph));
      const context=buildRegionFeatures(graph);
      result.regionDiagnostic={
        status:context.status,regions:context.regionCount,
        lightRegions:context.lightRegions,
        uncertainRegions:context.uncertainRegions,
        embeddedLightRegions:context.status==='ready'?
          context.rows.filter(x=>x.ownBright&&x.parent>=0&&
            !context.rows[x.parent].uncertain&&
            !context.rows[x.parent].ownBright).length:null,
        directTextRegions:context.status==='ready'?
          context.rows.filter(x=>x.hasDirectText).length:null
      };
    }
    baseline=await browser.page.eval(JS(islandSession,'audit'));
    // Observe semantic flags BEFORE any P13 paint or text recolor.
    const p11Context=p11Inputs&&mode==='p13-rule-baseline'?
      await browser.page.eval(JS(captureP11TextContext)):null;
    baselineControls=await browser.page.eval(JS(captureProtectedControls));
    if(baselineControls?.truncated!==false){
      result.reason='protected-controls-baseline-inconclusive';return result;
    }
    areaBefore=await browser.page.eval(JS(sampleBackgroundGrid));
    const planStart=performance.now();
    const p13Plan=planIslands(ready.samples);
    result.decisionComparison=compareProposals(ready.samples);
    assert.equal(result.decisionComparison.p13Proposed,p13Plan.length);
    result.baselineDigest=crypto.createHash('sha256').update(JSON.stringify({
      cssSamples:ready.samples,textAudit:baseline,grid:areaBefore})).digest('hex');
    const proposals=mode==='p13-rule-baseline'?p13Plan:
      gateP13WithLegacy(ready.samples,p13Plan);
    if(mode==='7d-gated-p13-lab')
      assert.equal(result.decisionComparison.agreementOnP13,proposals.length);
    result.durationMs=Number((performance.now()-planStart).toFixed(3));
    result.convertedSurfaces=proposals.length;
    if(!proposals.length){
      result.reason='no-convertible-surface';return result;
    }
    if(mode==='p13-rule-baseline')
      await browser.page.screenshot(path.join(OUTPUT,item.id+'-original.png'));

    phaseOpen=true;
    await browser.page.eval(JS(islandSession,'paint',proposals));
    const changed=await browser.page.eval(JS(islandSession,'audit'));
    const fixes=suggestTextRepair(baseline,changed,proposals);
    if(fixes.status!=='ready'){
      result.status=fixes.status==='blocked'?'blocked':'inconclusive';
      result.reason='unsafe-or-incomplete-foreground';return result;
    }
    if(p11Inputs&&mode==='p13-rule-baseline')
      result.p11ShadowDiagnostic=compareP11TextRepairs(
        baseline,changed,fixes.repairs,p11Inputs,p11Context);
    if(fixes.repairs.length)
      await browser.page.eval(JS(islandSession,'recolor',fixes.repairs));
    result.repairedText=fixes.repairs.length;
    const final=await browser.page.eval(JS(islandSession,'audit'));
    const inspected=evaluateIslandContrast(baseline,final);
    result.auditedText=inspected.audited??null;
    result.newWeak=inspected.newWeak??null;
    result.status=inspected.status;
    result.reason=result.status==='safe-in-sample'?'synthetic-sample-only':'contrast-unknown-or-regressed';
    const controlsAfter=await browser.page.eval(JS(captureProtectedControls));
    result.controlsChanged=countProtectedControlChanges(baselineControls,controlsAfter);
    if(result.controlsChanged===null&&result.status==='safe-in-sample'){
      result.status='inconclusive';result.reason='protected-controls-inconclusive';
    }else if(result.controlsChanged>0){
      result.status='blocked';result.reason='protected-controls-changed';
    }
    const areaAfter=await browser.page.eval(JS(sampleBackgroundGrid));
    if(areaBefore.valid>=20&&areaAfter.valid>=20){
      result.eligibleAreaFraction=Number((areaBefore.valid/96).toFixed(4));
      result.darkAreaFraction=Number((areaAfter.dark/areaAfter.valid).toFixed(4));
    }
    if(result.status==='safe-in-sample')
      await browser.page.screenshot(path.join(OUTPUT,item.id+'-'+
        (mode==='p13-rule-baseline'?'p13':'gated-p13')+'.png'));
    return result;
  }catch(error){
    // Broken authored fixtures are not silently approved.
    throw new Error('P14 fixture '+item.id+': '+(error.stack||error.message));
  }finally{
    if(browser){
      if(phaseOpen){
        const rollback=await browser.page.eval(JS(islandSession,'restore'));
        assert.equal(rollback.ok,true,'P14: CSS rollback failed for '+item.id);
        const restored=await browser.page.eval(JS(islandSession,'audit'));
        const baselineRestored=await browser.page.eval(JS(sampleBackgroundGrid));
        verifySampledRollback({rollback,beforeAudit:baseline,
          afterAudit:restored,beforeGrid:areaBefore,afterGrid:baselineRestored});
        const restoredControls=await browser.page.eval(JS(captureProtectedControls));
        assert.equal(countProtectedControlChanges(baselineControls,restoredControls),0,
          'P14: protected control CSS changed after rollback for '+item.id);
        result.restorationVerified=true;
      }
      if(started)await browser.page.eval(JS(islandSession,'close'));
      await browser.stop();
    }
  }
}
async function main(){
  const candidateArg=process.argv.find(arg=>arg.startsWith('--p11-candidate='));
  if(process.argv.some(arg=>arg.startsWith('--')&&arg!==candidateArg))
    throw Error('P14: unknown benchmark option');
  let p11Inputs=null;
  if(candidateArg){
    const file=path.resolve(candidateArg.slice('--p11-candidate='.length));
    if(file!==path.join(ROOT,'data/p11-descendant-ci-candidate.json'))
      throw Error('P14: P11 must load the isolated CI candidate only');
    const core=require('../vendor/neural_core/neural-core.js');
    const colors=require('../content/colors.js');
    const runtime=require('../training/p11-descendant-runtime.js');
    const candidate=JSON.parse(fs.readFileSync(file,'utf8'));
    p11Inputs={core,colors,featuresFor:runtime.featuresFor,
      predictText:runtime.predictText,model:runtime.loadCandidate(core,candidate)};
  }
  const fixtures=getExplorationFixtures();
  assert.equal(fixtures.length,12);
  const files=Object.fromEntries(fixtures.map(row=>[row.id,buildPage(row)]));
  const server=http.createServer((req,res)=>{
    const id=String(req.url).slice(1);
    if(!Object.hasOwn(files,id)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});res.end(files[id]);
  });
  fs.mkdirSync(OUTPUT,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const observations=[],gatedObservations=[],pairedP13=[],pairedGated=[],decisionComparisons=[];
  const p11Diagnostics=[],regionDiagnostics=[];
  try{
    for(const item of fixtures){
      const url='http://127.0.0.1:'+server.address().port;
      const row=await explore(item,url,'p13-rule-baseline',p11Inputs);
      const gated=await explore(item,url,'7d-gated-p13-lab');
      const {decisionComparison,baselineDigest,p11ShadowDiagnostic,
        regionDiagnostic,...measurement}=row;
      if(regionDiagnostic)regionDiagnostics.push({
        caseId:item.id,split:item.split,...regionDiagnostic});
      if(p11ShadowDiagnostic)p11Diagnostics.push({caseId:item.id,
        split:item.split,...p11ShadowDiagnostic});
      const {decisionComparison:unusedGated,baselineDigest:gatedDigest,
        ...gatedMeasurement}=gated;
      observations.push(measurement);
      gatedObservations.push(gatedMeasurement);
      pairedP13.push({...measurement,baselineDigest});
      pairedGated.push({...gatedMeasurement,baselineDigest:gatedDigest});
      if(decisionComparison)decisionComparisons.push({caseId:item.id,
        split:item.split,...decisionComparison});
      console.log('P14 fixture',item.id,
        JSON.stringify({p13:row.status,gated:gated.status,
          p13Converted:row.convertedSurfaces,gatedConverted:gated.convertedSurfaces,
          p13Rollback:row.restorationVerified,gatedRollback:gated.restorationVerified}));
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
  const aggregateP13=aggregate(observations);
  const aggregateGated=aggregate(gatedObservations,{model:'7d-gated-p13-lab'});
  const pairedSyntheticPaint=pairSyntheticModes(pairedP13,pairedGated);
  const p11Shadow=p11Inputs?{
    kind:'p14-p11-shadow-proposals-on-p13-css',
    fixtureCount:fixtures.length,evaluatedCases:p11Diagnostics.length,
    missingCases:fixtures.length-p11Diagnostics.length,
    measuredCases:p11Diagnostics.filter(x=>x.status==='measured').length,
    noRepairCases:p11Diagnostics.filter(x=>x.status==='no-repair-opportunity').length,
    inconclusiveCases:p11Diagnostics.filter(x=>x.status==='inconclusive').length,
    candidates:p11Diagnostics.filter(x=>x.status==='measured')
      .reduce((n,x)=>n+x.candidates,0),
    neuralSuggestions:p11Diagnostics.filter(x=>x.status==='measured')
      .reduce((n,x)=>n+x.suggested,0),
    neuralContrastRejected:p11Diagnostics.filter(x=>x.status==='measured')
      .reduce((n,x)=>n+x.rejected,0),
    contextAssumptions:'link-from-dom-explicit-color-only-when-witnessed',
    applied:false,p11SurfaceDecisionMeasured:false,
    matchedFullEngines:false,independentVisualReview:false,
    promotionEligible:false,cases:p11Diagnostics
  }:{
    kind:'p14-p11-shadow-not-requested',evaluatedCases:0,
    matchedFullEngines:false,promotionEligible:false
  };
  const p15RegionContext={
    kind:'p15-region-graph-exploration-not-inference',
    exploratoryCases:fixtures.length,
    observedCases:regionDiagnostics.filter(x=>x.status==='ready').length,
    inconclusiveCases:fixtures.length-
      regionDiagnostics.filter(x=>x.status==='ready').length,
    lightRegions:regionDiagnostics.filter(x=>x.status==='ready')
      .reduce((n,x)=>n+x.lightRegions,0),
    uncertainRegions:regionDiagnostics.filter(x=>x.status==='ready')
      .reduce((n,x)=>n+x.uncertainRegions,0),
    embeddedLightRegions:regionDiagnostics.filter(x=>x.status==='ready')
      .reduce((n,x)=>n+x.embeddedLightRegions,0),
    directTextRegions:regionDiagnostics.filter(x=>x.status==='ready')
      .reduce((n,x)=>n+x.directTextRegions,0),
    outputMeaning:'css-geometry-samples-not-pixel-area',
    applied:false,trained:false,
    independentVisualReview:false,promotionEligible:false,
    cases:regionDiagnostics
  };
  const report={...buildReport(aggregateP13),
    kind:'p14-synthetic-browser-baseline',
    evidence:'isolated-authored-fixtures-not-real-user-sites',
    benchmarkResult:'exploratory-only',
    availableModes:['p13-rule-baseline','7d-gated-p13-lab'],
    gatedLabAggregate:aggregateGated,
    pairedSyntheticPaint,p11TextShadowDiagnostic:p11Shadow,
    p15RegionContext,
    proposalGateDiagnostic:{kind:'same-computed-css-vote-only',
      comparedCases:decisionComparisons.length,
      comparedSurfaceVotes:decisionComparisons.reduce((n,x)=>n+x.inputSurfaces,0),
      p11Status:p11Inputs?'shadow-text-proposals-on-p13-css-only':'not-evaluated-on-these-fixtures',
      sevenDStatus:'proposal-votes-only-no-mv3-or-painting',
      fullEngineComparisonAvailable:false,promotionEligible:false,
      cases:decisionComparisons},
    records:observations};
  fs.writeFileSync(path.join(OUTPUT,'p14-benchmark.json'),
    JSON.stringify(report,null,2)+'\n');
  console.log('P14 summary',JSON.stringify({
    fixtures:fixtures.length,safe:aggregateP13.safe,
    blocked:aggregateP13.blocked,inconclusive:aggregateP13.inconclusive,
    measuredAreaCases:aggregateP13.measuredAreaCases,
    comparedDecisionCases:decisionComparisons.length,
    pairedSyntheticCases:pairedSyntheticPaint.matchedSyntheticCases,
    measuredSyntheticPairs:pairedSyntheticPaint.measuredPairs,
    p11ShadowCases:p11Diagnostics.length,
    p15ObservedCases:p15RegionContext.observedCases,
    p11Suggestions:p11Shadow.neuralSuggestions??null,
    promotionEligible:false
  }));
  assert.equal(report.holdoutFixturesNotExecuted,3);
  assert.equal(report.promotionEligible,false);
  if(process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### P14 First AI — benchmarking sintético (não release)\n'+
      'Treino + validação: '+fixtures.length+' fixtures; holdout: 3 preservados.\n'+
      'P13: '+aggregateP13.safe+' observações seguras; '+
      aggregateP13.inconclusive+' inconclusivas; '+
      aggregateP13.blocked+' bloqueadas.\n'+
      'P14: duas pinturas P13 e 7D-gated-P13 em CSS sintético, com rollback.\n'+
      'Pares sintéticos comparáveis: '+pairedSyntheticPaint.measuredPairs+'; '+
      (p11Inputs?'P11: propostas de texto em modo sombra sobre CSS P13, sem pintura P11.\n':
        'P11 não foi medido neste ensaio.\n')+
      'Motor MV3 7D completo NÃO foi comparado.\n'+
      '**Comparação completa de motores 7D/P11/P13 NÃO disponível.**\n');
}
if(require.main===module)main().catch(err=>{
  console.error('P14 benchmark failure:',err.stack||err);process.exitCode=1;
});
module.exports=Object.freeze({sampleBackgroundGrid,explore});
