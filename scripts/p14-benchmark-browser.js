#!/usr/bin/env node
'use strict';
// P14: isolated synthetic browser baseline. No users, no personal websites,
// no production extension, and absolutely no final holdout evaluation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {ROOT,reportContract}=require('./p14-dataset-contract.js');
const {getExplorationFixtures,buildPage}=require('./p14-fixture-pages.js');
const {aggregate,buildReport}=require('./p14-benchmark-contract.js');
const {planIslands,suggestTextRepair,evaluateIslandContrast,islandSession}
 =require('./p13-islands.js');
const {launch}=require('./browser-e2e.js');
const {compareProposals}=require('./p14-matched-proposals.js');
const {verifySampledRollback}=require('./p14-rollback-audit.js');
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
async function explore(item,baseUrl){
  const result={caseId:item.id,split:item.split,model:'p13-rule-baseline',
    source:'isolated-browser',status:'inconclusive',
    reason:'unmeasured',candidateSurfaces:null,convertedSurfaces:null,
    auditedText:null,newWeak:null,repairedText:null,durationMs:null,
    eligibleAreaFraction:null,darkAreaFraction:null,
    controlsChanged:null,restorationVerified:null};
  let browser,started=false,phaseOpen=false,baseline=null,areaBefore=null;
  try{
    browser=await launch(null);
    await browser.page.navigate(baseUrl+'/'+item.id,{fixtureReady:true});
    const ready=await browser.page.eval(JS(islandSession,'start'));
    if(ready.status!=='ready'){
      result.reason='no-safe-fixture-surface';return result;
    }
    started=true;
    result.candidateSurfaces=ready.samples.length;
    baseline=await browser.page.eval(JS(islandSession,'audit'));
    areaBefore=await browser.page.eval(JS(sampleBackgroundGrid));
    const planStart=performance.now();
    const proposals=planIslands(ready.samples);
    result.decisionComparison=compareProposals(ready.samples);
    assert.equal(result.decisionComparison.p13Proposed,proposals.length);
    result.durationMs=Number((performance.now()-planStart).toFixed(3));
    result.convertedSurfaces=proposals.length;
    if(!proposals.length){
      result.reason='no-convertible-surface';return result;
    }
    await browser.page.screenshot(path.join(OUTPUT,item.id+'-original.png'));
    phaseOpen=true;
    await browser.page.eval(JS(islandSession,'paint',proposals));
    const changed=await browser.page.eval(JS(islandSession,'audit'));
    const fixes=suggestTextRepair(baseline,changed,proposals);
    if(fixes.status!=='ready'){
      result.status=fixes.status==='blocked'?'blocked':'inconclusive';
      result.reason='unsafe-or-incomplete-foreground';return result;
    }
    if(fixes.repairs.length)
      await browser.page.eval(JS(islandSession,'recolor',fixes.repairs));
    result.repairedText=fixes.repairs.length;
    const final=await browser.page.eval(JS(islandSession,'audit'));
    const inspected=evaluateIslandContrast(baseline,final);
    result.auditedText=inspected.audited??null;
    result.newWeak=inspected.newWeak??null;
    result.status=inspected.status;
    result.reason=result.status==='safe-in-sample'?'synthetic-sample-only':'contrast-unknown-or-regressed';
    const areaAfter=await browser.page.eval(JS(sampleBackgroundGrid));
    if(areaBefore.valid>=20&&areaAfter.valid>=20){
      result.eligibleAreaFraction=Number((areaBefore.valid/96).toFixed(4));
      result.darkAreaFraction=Number((areaAfter.dark/areaAfter.valid).toFixed(4));
    }
    if(result.status==='safe-in-sample')
      await browser.page.screenshot(path.join(OUTPUT,item.id+'-p13.png'));
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
        result.restorationVerified=true;
      }
      if(started)await browser.page.eval(JS(islandSession,'close'));
      await browser.stop();
    }
  }
}
async function main(){
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
  const observations=[],decisionComparisons=[];
  try{
    for(const item of fixtures){
      const row=await explore(item,'http://127.0.0.1:'+server.address().port);
      const {decisionComparison,...measurement}=row;
      observations.push(measurement);
      if(decisionComparison)decisionComparisons.push({caseId:item.id,
        split:item.split,...decisionComparison});
      console.log('P14 fixture',item.id,row.status,
        JSON.stringify({converted:row.convertedSurfaces,weak:row.newWeak,
          rollback:row.restorationVerified}));
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
  const aggregateP13=aggregate(observations);
  const report={...buildReport(aggregateP13),
    kind:'p14-synthetic-browser-baseline',
    evidence:'isolated-authored-fixtures-not-real-user-sites',
    benchmarkResult:'exploratory-only',
    availableModes:['p13-rule-baseline'],
    proposalGateDiagnostic:{kind:'same-computed-css-vote-only',
      comparedCases:decisionComparisons.length,
      comparedSurfaceVotes:decisionComparisons.reduce((n,x)=>n+x.inputSurfaces,0),
      p11Status:'not-evaluated-on-these-fixtures',
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
      'P14: votos 7D/P13 nos mesmos CSS computados, sem aplicar 7D; P11 ainda não medido.\n'+
      '**Comparação completa de motores 7D/P11/P13 NÃO disponível.**\n');
}
if(require.main===module)main().catch(err=>{
  console.error('P14 benchmark failure:',err.stack||err);process.exitCode=1;
});
module.exports=Object.freeze({sampleBackgroundGrid,explore});
