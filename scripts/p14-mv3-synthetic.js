#!/usr/bin/env node
'use strict';
// Read-only P14 observation: compare unmodified 7D MV3 to no extension.
// Never open a real website, final holdout, P16 model or production profile.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {ROOT}=require('./p14-dataset-contract.js');
const {getExplorationFixtures,buildPage}=require('./p14-fixture-pages.js');
const {launch,sleep,waitFor}=require('./browser-e2e.js');
const {sampleBackgroundGrid}=require('./p14-benchmark-browser.js');
const {captureProtectedControls,countProtectedControlChanges}=
  require('./p14-protected-controls.js');
const {assessMv3Pair,summarizeMv3}=require('./p14-mv3-assessment.js');
const {captureFormAppearance,assessFormAppearance}=
  require('./p14-form-control-audit.js');
const IDS=Object.freeze(['canvas-shell','sidebar-navigation','card-grid',
  'direct-alert','form-toolbar','native-dark']);
const OUTPUT=path.join(ROOT,'browser-results/p14-mv3-synthetic');
const JS=fn=>'('+fn.toString()+')()';
async function capture(url,extension,caseId){
  if(!IDS.includes(caseId))throw Error('P14 MV3: screenshot outside fixture allowlist');
  const browser=await launch(extension?ROOT:null);
  try{
    await browser.page.navigate(url,{fixtureReady:true});
    if(extension){
      // The same marker is used by the existing real Chromium E2E.
      // Non-activation is inconclusive, not a fatal assertion or a pass.
      try{await waitFor(async()=>await browser.page.eval(
        'document.documentElement.getAttribute("data-extensao-dark")==="on"'),3500);}
      catch{/* Native-dark skip or missing activation remains observable. */}
    }
    await sleep(350);
    // Screenshots contain only local authored fixture content.
    await browser.page.screenshot(path.join(OUTPUT,caseId+'-'+
      (extension?'legacy-mv3':'original')+'.png'));
    return {active:await browser.page.eval(
        'document.documentElement.getAttribute("data-extensao-dark")==="on"'),
      grid:await browser.page.eval(JS(sampleBackgroundGrid)),
      controls:await browser.page.eval(JS(captureProtectedControls)),
      form:caseId==='form-toolbar'?
        await browser.page.eval(JS(captureFormAppearance)):null};
  }finally{await browser.stop();}
}
async function main(){
  if(process.argv.length>2)throw Error('P14 MV3: no command-line options allowed');
  const registry=getExplorationFixtures();
  const fixtures=IDS.map(id=>{
    const x=registry.find(f=>f.id===id);
    if(!x||x.split==='holdout')throw Error('P14 MV3: selected a missing or sealed fixture');
    return x;
  });
  assert.equal(fixtures.length,6);
  const html=Object.fromEntries(fixtures.map(row=>[row.id,buildPage(row)]));
  const server=http.createServer((req,res)=>{
    const id=String(req.url).slice(1);
    if(!Object.hasOwn(html,id)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});res.end(html[id]);
  });
  fs.mkdirSync(OUTPUT,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const records=[];
  try{
    for(const item of fixtures){
      const url='http://127.0.0.1:'+server.address().port+'/'+item.id;
      const original=await capture(url,false,item.id);
      const mv3=await capture(url,true,item.id);
      // Compare CSS controls only in ephemeral memory. Do not persist their values.
      mv3.controlChanges=countProtectedControlChanges(original.controls,mv3.controls);
      const row=assessMv3Pair(item,original,mv3);
      if(item.id==='form-toolbar'){
        const audit=assessFormAppearance(original.form,mv3.form);
        row.formControlContrast=audit; // Counts/ratios only; no CSS values.
        if(audit.status==='contrast-regression'){
          row.status='needs-review';
          row.reason='form-control-text-contrast-regression';
        }
      }
      records.push(row);
      console.log('P14 MV3',item.id,row.status,row.reason);
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
  const report=summarizeMv3(records);
  fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.promotionEligible,false);
  assert.equal(report.holdoutEvaluated,false);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### P14 — MV3 7D real, somente fixtures sintéticas\n'+
    'Observadas: '+report.observed+'; nativo inativo: '+report.nativeDarkInactive+
    '; revisão necessária: '+report.needsReview+'; inconclusivas: '+report.inconclusive+
    '. Sem comparação pareada de motores completos, holdout ou promoção.\n');
}
if(require.main===module)main().catch(error=>{
  console.error('P14 MV3 diagnostic failure:',error.stack||error);
  process.exitCode=1;
});
module.exports=Object.freeze({capture,IDS});
