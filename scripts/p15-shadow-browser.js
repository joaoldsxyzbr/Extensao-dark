#!/usr/bin/env node
'use strict';
// P15 independent authored Chromium smoke, never the sealed P14 holdout.
const assert=require('node:assert/strict');
const {launch}=require('./browser-e2e.js');
const {captureRegionGraph}=require('../content/region-graph.js');
const {buildRegionFeatures}=require('../content/region-features.js');
const {summarizeP15RiskCoverage}=require('./p15-risk-coverage.js');
const {compareAuthoredScreenshot}=require('./p15-authored-pixel-oracle.js');
const {assessRegionStability}=require('./p15-dynamic-stability.js');
const {summarizeP15Performance}=require('./p15-performance-contract.js');
const HTML='<!doctype html><meta charset="utf-8">'+
  '<style>body{background:rgb(27,31,36);margin:0;padding:25px}'+
  '.mount{display:block;width:500px;height:230px;'+
  'background:rgb(28,32,38);margin:20px}</style>'+
  '<div class="mount" id="safe"></div><div class="mount" id="control"></div>'+
  '<script>'+
  'for(const id of ["safe","control"]){'+
  'const root=document.getElementById(id).attachShadow({mode:"open"});'+
  'const section=document.createElement("section");'+
  'section.style.cssText="display:block;width:350px;height:140px;'+
  'background:rgb(246,248,250);padding:10px";'+
  'section.appendChild(document.createTextNode("Authored synthetic label"));'+
  'root.append(section);'+
  'if(id==="control"){const b=document.createElement("button");'+
  'b.type="button";section.append(b)}'+
  '}'+
  'const frame=document.createElement("iframe");'+
  'frame.style.cssText="display:block;width:500px;height:230px";'+
  'frame.onload=()=>window.__fixtureReady=!!frame.contentDocument?.querySelector("main");'+
  'frame.srcdoc="<body style=\'background:rgb(35,36,39)\'><main style=\'background:rgb(244,246,247);width:350px;height:140px\'>Authored frame</main></body>";'+
  'document.body.append(frame);</script>';
async function main(){
  let browser;
  try{
    browser=await launch(null);
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(HTML),{fixtureReady:true});
    const graph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    assert.equal(graph.status,'ready');
    const result=buildRegionFeatures(graph);
    assert.equal(result.status,'ready');
    assert.ok(result.regionCount>=5);
    const islands=result.rows.filter(x=>x.confirmedLightIsland);
    assert.equal(islands.length,1,
      'Only unprotected shadow regions count as confirmed light islands');
    assert.ok(result.rows.some(x=>x.ownBright&&x.uncertain&&!x.inFrame),
      'Protected shadow control makes the surface uncertain');
    assert.ok(result.rows.some(x=>x.inFrame&&x.ownBright&&x.uncertain&&
      !x.confirmedLightIsland),
      'Same-origin iframe stays diagnostic-only, never safe-to-paint');
    assert.equal(result.applied,false);
    assert.equal(result.promotionEligible,false);
    const riskCoverage=summarizeP15RiskCoverage(graph);
    assert.equal(riskCoverage.status,'measured-exploratory');
    assert.equal(riskCoverage.confirmedLightIslands,islands.length);
    assert.ok(riskCoverage.reasons.protectedDescendant>=1);
    assert.ok(riskCoverage.reasons.frame>=1);
    assert.equal(riskCoverage.pixelAreaMeasured,false);
    assert.equal(riskCoverage.promotionEligible,false);
    assert.doesNotMatch(JSON.stringify(riskCoverage),
      /Authored synthetic label|https?:\/\/|rgb\(/);
    assert.doesNotMatch(JSON.stringify(result),/Authored synthetic label|rgb\(|https?:\/\//);
    // Independent synthetic CSS stress case. No holdout or external site.
    const cssHtml='<!doctype html><meta charset="utf-8">'+
      '<style>body{margin:0;background:rgb(25,30,35)}'+
      'main{display:block;margin:25px;width:440px;height:160px;'+
      'background:rgb(245,246,247)}'+
      'aside{position:fixed;top:25px;left:15px;width:400px;'+
      'height:150px;background:rgb(30,32,35);z-index:999}'+
      'article{display:block;margin:35px 0;width:440px;height:150px;'+
      'background:linear-gradient(white,gray)}'+
      'section{display:block;width:300px;height:100px;'+
      'background:rgb(247,248,249)}</style>'+
      '<main></main><aside></aside><article><section></section></article>'+
      '<script>window.__fixtureReady=true;</script>';
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(cssHtml),{fixtureReady:true});
    const visiblePixels=await compareAuthoredScreenshot(browser,[
      {x:80,y:80,expected:'dark'}, // fixed overlay masks the white main
      {x:445,y:100,expected:'bright'} // exposed portion of main is white
    ]);
    assert.equal(visiblePixels.status,'matched');
    assert.equal(visiblePixels.mismatches,0);
    assert.equal(visiblePixels.imageExported,false);
    assert.equal(visiblePixels.promotionEligible,false);
    console.log('P15 authored screenshot pixels Chromium',JSON.stringify({
      status:visiblePixels.status,checks:visiblePixels.checks,
      mismatches:visiblePixels.mismatches,promotionEligible:false
    }));
    const cssGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    assert.equal(cssGraph.status,'ready');
    assert.ok(cssGraph.nodes.some(x=>x.hasOcclusionRisk&&x.ownLuma>.75),
      'Overlapped bright region must be uncertain');
    assert.ok(cssGraph.nodes.some(x=>x.hasComplexAncestorPaint&&x.ownLuma>.75),
      'Bright region below gradient parent must be uncertain');
    const cssOutput=buildRegionFeatures(cssGraph);
    assert.ok(cssOutput.uncertainRegions>=2);
    assert.equal(cssOutput.rows.filter(x=>x.confirmedLightIsland).length,0);
    assert.equal(cssOutput.applied,false);
    assert.equal(cssOutput.promotionEligible,false);
    // A dynamic stylesheet change must invalidate the original capture.
    const sameGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const still=assessRegionStability(cssGraph,sameGraph);
    assert.equal(still.status,'stable-in-sample');
    assert.equal(still.promotionEligible,false);
    await browser.page.eval('document.querySelector("main").style.backgroundColor="rgb(12, 15, 19)"');
    const changedGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const changed=assessRegionStability(cssGraph,changedGraph);
    assert.equal(changed.status,'inconclusive');
    assert.equal(changed.reason,'css-or-layout-changed');
    assert.ok(changed.changedRegions>0);
    assert.equal(changed.promotionEligible,false);
    // A DOM insertion invalidates coverage even if all prior regions still exist.
    await browser.page.eval('(()=>{const s=document.createElement("section");s.style.cssText="display:block;width:210px;height:80px;background:rgb(220,220,220)";document.querySelector("main").append(s)})()');
    const insertedGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const inserted=assessRegionStability(cssGraph,insertedGraph);
    assert.equal(inserted.status,'inconclusive');
    assert.equal(inserted.reason,'region-count-changed');
    assert.equal(inserted.applied,false);
    // Authored motion/interaction case: animation configuration and focus
    // must never generate a safe light-island recommendation.
    const motionHtml='<!doctype html><meta charset="utf-8">'+
      '<style>body{background:rgb(24,28,33);margin:20px}'+
      'main,section{display:block;width:400px;height:120px;'+
      'margin:15px;background:rgb(246,247,248)}'+
      '@keyframes pulse{from{transform:translateX(0px)}to{transform:translateX(6px)}}'+
      'section{animation:pulse 1s infinite alternate}</style>'+
      '<main tabindex="0"></main><section></section>'+
      '<script>window.__fixtureReady=true;</script>';
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(motionHtml),{fixtureReady:true});
    const beforeFocus=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const focusStart=buildRegionFeatures(beforeFocus);
    assert.equal(focusStart.status,'ready');
    assert.ok(focusStart.rows.some(x=>x.ownBright&&!x.hasMotionRisk&&
      x.confirmedLightIsland));
    assert.ok(focusStart.rows.some(x=>x.ownBright&&x.hasMotionRisk&&
      !x.confirmedLightIsland));
    const repeatedAnimation=assessRegionStability(beforeFocus,beforeFocus);
    assert.equal(repeatedAnimation.status,'inconclusive');
    assert.equal(repeatedAnimation.reason,'motion-risk-present');
    await browser.page.eval('document.querySelector("main").focus()');
    const focused=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const focusResult=assessRegionStability(beforeFocus,focused);
    assert.equal(focusResult.status,'inconclusive');
    assert.ok(['css-or-layout-changed','region-count-changed',
      'coverage-changed'].includes(focusResult.reason),
      'Focus must invalidate the previous CSS/DOM sample');
    const activeFocus=await browser.page.eval(
      'document.activeElement===document.querySelector("main")');
    assert.equal(activeFocus,true);
    // :focus-visible is protected and may exclude the focused region entirely.
    assert.equal(buildRegionFeatures(focused).rows
      .filter(x=>x.confirmedLightIsland).length,0);
    const viewportBefore=await browser.page.eval('({width:innerWidth,height:innerHeight})');
    await browser.page.setViewport(860,650);
    const viewportAfter=await browser.page.eval('({width:innerWidth,height:innerHeight})');
    assert.notEqual(viewportBefore.width,viewportAfter.width);
    assert.equal(viewportAfter.width,860);
    const afterResize=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    const resize=assessRegionStability(focused,afterResize,{
      before:viewportBefore,after:viewportAfter
    });
    assert.equal(resize.status,'inconclusive');
    assert.equal(resize.reason,'viewport-changed');
    assert.equal(resize.promotionEligible,false);
    console.log('P15 motion-focus-resize Chromium',JSON.stringify({
      animated:focusStart.rows.filter(x=>x.hasMotionRisk).length,
      focusStatus:focusResult.status,resizeStatus:resize.status,
      applied:false,promotionEligible:false
    }));
    console.log('P15 dynamic CSS Chromium',JSON.stringify({
      staticStatus:still.status,changedStatus:changed.status,
      changedRegions:changed.changedRegions,
      insertedStatus:inserted.status,promotionEligible:false
    }));
    // Real browser timing smoke, authored data only; no release threshold.
    const timedCapture=()=>browser.page.eval('(()=>{const start=performance.now();'+
      'const graph=('+captureRegionGraph.toString()+')();'+
      'return {graph,elapsedMs:performance.now()-start};})()');
    const timingStart=performance.now();
    const sampleOne=await timedCapture();
    await new Promise(resolve=>setTimeout(resolve,60));
    const sampleTwo=await timedCapture();
    const compareStart=performance.now();
    const compared=assessRegionStability(sampleOne.graph,sampleTwo.graph);
    const compareCost=performance.now()-compareStart;
    const performanceReport=summarizeP15Performance([{
      firstCaptureMs:Number(sampleOne.elapsedMs.toFixed(3)),
      secondCaptureMs:Number(sampleTwo.elapsedMs.toFixed(3)),
      compareMs:Number(compareCost.toFixed(3)),
      totalWallMs:Number((performance.now()-timingStart).toFixed(3)),
      status:compared.status
    }],1);
    assert.equal(performanceReport.status,'measured-exploratory');
    assert.equal(performanceReport.measuredCases,1);
    assert.equal(performanceReport.promotionEligible,false);
    assert.equal(performanceReport.applied,false);
    console.log('P15 performance smoke Chromium',JSON.stringify({
      status:performanceReport.status,
      firstCaptureP95Ms:performanceReport.firstCaptureMs.p95,
      totalWallP95Ms:performanceReport.totalWallMs.p95,
      promotionEligible:false
    }));
    // DOM load stress is synthetic and contains no user/site data.
    // The extractor must stop with an empty graph at each hard budget.
    for(const [tag,count,expectedScanned] of [
      ['span',8300,1],['section',1700,1601]
    ]){
      const stressHtml='<!doctype html><meta charset="utf-8">'+
        '<style>body{margin:0;min-height:150px;background:rgb(27,30,34)}'+
        'section,span{display:inline-block;width:1px;height:1px}</style><body>'+
        '<script>const nodes=document.createDocumentFragment();'+
        'let group=null;for(let i=0;i<'+count+';i++){'+
        'if(i%170===0){group=document.createElement("span");nodes.append(group)}'+
        'group.append(document.createElement("'+tag+'"))}'+
        'document.body.append(nodes);window.__fixtureReady=true;</script>';
      await browser.page.navigate('data:text/html;charset=utf-8,'+
        encodeURIComponent(stressHtml),{fixtureReady:true});
      const stress=await browser.page.eval('('+captureRegionGraph.toString()+')()');
      assert.equal(stress.status,'inconclusive');
      assert.deepEqual(stress.nodes,[]);
      assert.equal(stress.scanned,expectedScanned);
      assert.equal(buildRegionFeatures(stress).promotionEligible,false);
    }
    console.log('P15 bounded DOM stress Chromium',JSON.stringify({
      hostNodes:8300,regionCandidates:1700,
      status:'inconclusive',applied:false,promotionEligible:false
    }));
    // Editing and live announcements are sensitive UI, not a candidate
    // to auto-convert or to collect text from.
    const editorHtml='<!doctype html><meta charset="utf-8">'+
      '<style>body{background:rgb(30,32,35)}'+
      'main{display:block;width:460px;height:270px;'+
      'background:rgb(246,247,248)}'+
      'div,section{display:block;width:350px;height:70px;'+
      'background:rgb(250,250,250)}</style>'+
      '<main><div contenteditable="true">Synthetic private label</div>'+
      '<section aria-live="polite">Synthetic live update</section></main>'+
      '<script>window.__fixtureReady=true;</script>';
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(editorHtml),{fixtureReady:true});
    const editorGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    assert.equal(editorGraph.status,'ready');
    const editorRows=buildRegionFeatures(editorGraph);
    assert.equal(editorRows.regionCount,2);
    assert.equal(editorRows.rows[1].hasProtectedDescendants,true);
    assert.equal(editorRows.rows[1].confirmedLightIsland,false);
    assert.equal(editorRows.applied,false);
    assert.doesNotMatch(JSON.stringify(editorGraph),
      /Synthetic private label|Synthetic live update/);
    console.log('P15 protected edit and live Chromium',JSON.stringify({
      protectedRegions:editorRows.rows.filter(x=>x.hasProtectedDescendants).length,
      status:'ready',applied:false,promotionEligible:false
    }));
    console.log('P15 risk counts Chromium',JSON.stringify({
      status:riskCoverage.status,regions:riskCoverage.regions,
      uncertainRegions:riskCoverage.uncertainRegions,
      confirmedLightIslands:riskCoverage.confirmedLightIslands,
      applied:false,promotionEligible:false
    }));
    const childStressHtml='<!doctype html><meta charset="utf-8">'+
      '<style>body{background:rgb(26,28,32)}main{display:block;'+
      'width:440px;height:150px;background:rgb(246,247,248)}</style>'+
      '<main></main><script>const root=document.querySelector("main");'+
      'for(let i=0;i<257;i++)root.append(document.createElement("span"));'+
      'window.__fixtureReady=true;</script>';
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(childStressHtml),{fixtureReady:true});
    const manyChildren=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    assert.equal(manyChildren.status,'inconclusive');
    assert.deepEqual(manyChildren.nodes,[]);
    assert.equal(buildRegionFeatures(manyChildren).promotionEligible,false);
    console.log('P15 direct-child bound Chromium',JSON.stringify({
      directChildren:257,status:'inconclusive',applied:false,
      promotionEligible:false
    }));
    // Authored stacking/compositing fixture. Do not infer safe paint from
    // a bright child of a transformed/clipped opaque ancestor.
    const layeredHtml='<!doctype html><meta charset="utf-8">'+
      '<style>body{background:rgb(27,30,34);margin:0}'+
      '.layer,.plain,.native{display:block;background:rgb(30,33,37);'+
      'width:450px;height:190px;margin:20px}'+
      '.layer{transform:translateX(2px);clip-path:inset(1px)}'+
      '.native{color-scheme:light dark}'+ 
      'section{display:block;width:350px;height:115px;'+
      'background:rgb(248,249,250)}</style>'+
      '<div class="layer"><section></section></div>'+
      '<div class="plain"><section></section></div>'+ 
      '<div class="native"><section></section></div>'+
      '<script>window.__fixtureReady=true;</script>';
    await browser.page.navigate('data:text/html;charset=utf-8,'+
      encodeURIComponent(layeredHtml),{fixtureReady:true});
    const layeredGraph=await browser.page.eval('('+captureRegionGraph.toString()+')()');
    assert.equal(layeredGraph.status,'ready');
    const layeredRows=buildRegionFeatures(layeredGraph).rows;
    assert.ok(layeredRows.some(x=>x.ownBright&&x.hasComplexAncestorPaint&&
      x.uncertain&&!x.confirmedLightIsland),
      'Transformed ancestor must block confirmed island');
    assert.ok(layeredRows.some(x=>x.ownBright&&!x.hasComplexAncestorPaint&&
      x.confirmedLightIsland),
      'Independent clean opaque region remains observable');
    assert.ok(layeredGraph.nodes.some(n=>n.nativeDark&&n.ownLuma>.75&&
      !layeredRows[n.index].confirmedLightIsland),
      'Native light-dark color scheme stays protected');
    console.log('P15 compositor ancestors Chromium',JSON.stringify({
      status:'ready',unsafeChildren:layeredRows.filter(x=>
        x.ownBright&&x.hasComplexAncestorPaint).length,
      applied:false,promotionEligible:false
    }));
    console.log('P15 CSS overlap Chromium',JSON.stringify({
      status:cssOutput.status,uncertainRegions:cssOutput.uncertainRegions,
      confirmedLightIslands:0,applied:false,promotionEligible:false
    }));
    console.log('P15 Shadow DOM Chromium',JSON.stringify({
      status:result.status,regions:result.regionCount,
      confirmedLightIslands:islands.length,
      uncertainRegions:result.uncertainRegions,
      applied:false,promotionEligible:false
    }));
  }finally{
    if(browser)await browser.stop();
  }
}
if(require.main===module)main().catch(error=>{
  console.error('P15 Shadow DOM Chromium failed:',error.message);
  process.exitCode=1;
});
module.exports=Object.freeze({main});
