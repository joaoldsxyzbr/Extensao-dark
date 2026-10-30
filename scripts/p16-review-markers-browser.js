#!/usr/bin/env node
'use strict';
// Authored Chromium fixture only; never public pages or screenshots.
const assert=require('node:assert/strict');
const {launch}=require('./browser-e2e.js');
const {captureRegionGraph}=require('../content/region-graph.js');
const {captureReviewFrame}=require('./p16-review-markers.js');
const {vectorize}=require('../content/region-ai.js');
const HTML='<!doctype html><html><head><style>'+
 'body{background:rgb(22,26,29);margin:12px}'+
 'main{width:700px;height:650px;background:rgb(248,248,248)}'+
 'section{width:500px;height:240px;background:rgb(245,245,245)}'+
 'article{width:350px;height:130px;background:rgb(252,252,252)}'+
 '</style></head><body><main><section><article>Autoral</article>'+
 '</section></main><script>window.__fixtureReady=true;</script></body></html>';
async function main(){
 if(process.argv.length!==2)throw Error('P16 visual: unexpected flags');
 const browser=await launch(null);
 try{
  await browser.page.navigate('data:text/html;charset=utf-8,'+
   encodeURIComponent(HTML),{fixtureReady:true});
  const result=await browser.page.eval('('+captureReviewFrame.toString()+')('+
   captureRegionGraph.toString()+')');
  assert.equal(result.status,'local-visual-unverified');
  assert.equal(result.graph.status,'ready');
  assert.equal(result.markerCount,result.graph.nodes.length);
  assert.ok(result.markerCount>=2);
  assert.equal(result.verifiedHumanLabels,false);
  assert.equal(result.promotionEligible,false);
  const vectors=vectorize(result.graph);
  assert.equal(vectors.status,'ready');
  assert.ok(vectors.rows.every(row=>row.features.length===20));
  const check=await browser.page.eval(
    '(()=>{const e=Array.from(document.querySelectorAll("[data-p16-region-label]"));'+
    'return {count:e.length,labels:e.map(x=>x.textContent),'+
    'hidden:e.every(x=>x.getAttribute("aria-hidden")==="true"),'+
    'original:document.querySelector("article").textContent==="Autoral"};})()');
  assert.equal(check.count,result.markerCount);
  assert.deepEqual(check.labels,result.graph.nodes.map(n=>'R'+n.index));
  assert.equal(check.hidden,true);
  assert.equal(check.original,true);
  console.log(JSON.stringify({kind:'p16-synthetic-marker-smoke-v1',
   matchedIndices:check.count,screenshotsSaved:false,
   publicSitesVisited:false,verifiedHumanLabels:false,promotionEligible:false}));
 }finally{await browser.stop();}
}
if(require.main===module)main().catch(error=>{
 console.error('P16 visual Chromium:',error.message);process.exitCode=1;
});
