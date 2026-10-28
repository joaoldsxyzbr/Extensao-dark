#!/usr/bin/env node
'use strict';
// P15 independent authored Chromium smoke, never the sealed P14 holdout.
const assert=require('node:assert/strict');
const {launch}=require('./browser-e2e.js');
const {captureRegionGraph}=require('../content/region-graph.js');
const {buildRegionFeatures}=require('../content/region-features.js');
const {assessRegionStability}=require('./p15-dynamic-stability.js');
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
    console.log('P15 dynamic CSS Chromium',JSON.stringify({
      staticStatus:still.status,changedStatus:changed.status,
      changedRegions:changed.changedRegions,
      insertedStatus:inserted.status,promotionEligible:false
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
