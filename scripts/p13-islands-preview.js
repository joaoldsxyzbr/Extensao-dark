#!/usr/bin/env node
'use strict';
// P13 experimental screenshot lab: darken independent light surfaces in an
// anonymous disposable Chromium instance. Not loaded into MV3 extension.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {launch,ROOT}=require('./browser-e2e.js');
const {planIslands,suggestTextRepair,evaluateIslandContrast,islandSession}
 =require('./p13-islands.js');
const OUTPUT=path.join(ROOT,'browser-results/p13-white-islands');
const EXTERNAL=Object.freeze([
  {id:'python-docs',url:'https://docs.python.org/3/tutorial/'},
  {id:'rfc-editor',url:'https://www.rfc-editor.org/rfc/rfc9110.html'}
]);
const LOCAL=Object.freeze(['project-board','library-catalog']);
const expression=(fn,...args)=>
  '('+fn.toString()+')('+args.map(JSON.stringify).join(',')+')';
async function renderScenario(caseItem){
  let instance;
  const result={id:caseItem.id,source:caseItem.local?'local-fixture':'public-page',
    status:'inconclusive',promotionEligible:false,
    notFullExtension:true};
  try{
    instance=await launch(null);
    await instance.page.navigate(caseItem.url,{fixtureReady:caseItem.local});
    const origin=await instance.page.eval('location.origin');
    if(!caseItem.local&&new URL(origin).hostname!==new URL(caseItem.url).hostname){
      result.reason='unexpected-origin';return result;
    }
    const ready=await instance.page.eval(expression(islandSession,'start'));
    if(ready.status!=='ready'){
      result.reason=ready.reason;result.surfacesSeen=ready.surfaces||0;return result;
    }
    try{
      result.candidates=ready.samples.length;
      const baseline=await instance.page.eval(expression(islandSession,'audit'));
      const plan=planIslands(ready.samples);
      if(plan.length===0){result.reason='no-safe-surface';return result;}
      result.planned=plan.length;
      await instance.page.screenshot(path.join(OUTPUT,caseItem.id+'-original.png'));
      try{
        const changed=await instance.page.eval(expression(islandSession,'paint',plan));
        assert.equal(changed.painted,plan.length);
        const raw=await instance.page.eval(expression(islandSession,'audit'));
        const suggestion=suggestTextRepair(baseline,raw,plan);
        result.repairGate=suggestion.status;
        result.repairCount=suggestion.repairs.length;
        if(suggestion.status==='ready'){
          const adjusted=await instance.page.eval(
            expression(islandSession,'recolor',suggestion.repairs));
          assert.equal(adjusted.recolored,suggestion.repairs.length);
          const final=await instance.page.eval(expression(islandSession,'audit'));
          const contrast=evaluateIslandContrast(baseline,final);
          result.auditedText=contrast.audited||0;
          result.newWeak=contrast.newWeak||0;
          result.status=contrast.status;
          if(result.status==='safe-in-sample'){
            await instance.page.screenshot(path.join(OUTPUT,caseItem.id+'-islands.png'));
            result.previewImage=caseItem.id+'-islands.png';
          }else result.reason=contrast.reason||'unsafe-result';
        }else{
          result.status=suggestion.status;
          result.reason=suggestion.reason||'unsafe-text';
        }
      }finally{
        const rollback=await instance.page.eval(expression(islandSession,'restore'));
        assert.equal(rollback.ok,true,'P13: failed to restore original inline CSS');
        const restored=await instance.page.eval(expression(islandSession,'audit'));
        assert.deepEqual(restored,baseline,'P13: computed text CSS changed after restore');
        result.restorationVerified=true;
      }
    }finally{
      await instance.page.eval(expression(islandSession,'close'));
    }
    return result;
  }catch(error){
    // Fail the CI if the local reference cases regress or rollback assertions
    // fail; only public network/navigation failures can be inconclusive.
    if(caseItem.local||error.code==='ERR_ASSERTION')throw error;
    return {...result,status:'inconclusive',reason:'public-site-unavailable'};
  }finally{if(instance)await instance.stop();}
}
async function main(){
  fs.mkdirSync(OUTPUT,{recursive:true});
  const files=Object.fromEntries(LOCAL.map(id=>[
    id,fs.readFileSync(path.join(ROOT,'tests/p12-pages',id+'.html'))
  ]));
  const server=http.createServer((req,res)=>{
    const id=String(req.url).slice(1);
    if(!Object.hasOwn(files,id)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});res.end(files[id]);
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const report={kind:'p13-multi-surface-isolated-preview',
    promotionEligible:false,readyForRelease:false,modelIntegrated:false,
    note:'Prévia determinística de superfícies claras (não é nova inferência neural). Candidato P11 e motor MV3 não alterados. Sites reais já conhecidos em avaliações anteriores.',
    scenarios:[]};
  try{
    const scenarios=[
      ...LOCAL.map(id=>({id,local:true,
        url:'http://127.0.0.1:'+server.address().port+'/'+id})),
      ...EXTERNAL.map(x=>({...x,local:false}))
    ];
    for(const x of scenarios){
      const row=await renderScenario(x);
      report.scenarios.push(row);
      fs.writeFileSync(path.join(OUTPUT,'p13-report.json'),JSON.stringify(report,null,2)+'\n');
      console.log('P13 islands',row.id,JSON.stringify({status:row.status,
        surfaces:row.planned||0,repaired:row.repairCount||0,
        audited:row.auditedText||0,newWeak:row.newWeak||0}));
    }
  }finally{await new Promise(ok=>server.close(ok));}
  report.completed=true;
  report.safe=report.scenarios.filter(x=>x.status==='safe-in-sample').length;
  report.inconclusive=report.scenarios.filter(x=>x.status==='inconclusive').length;
  report.blocked=report.scenarios.filter(x=>x.status==='blocked').length;
  fs.writeFileSync(path.join(OUTPUT,'p13-report.json'),JSON.stringify(report,null,2)+'\n');
  const fixtures=report.scenarios.filter(x=>x.source==='local-fixture');
  if(fixtures.length!==2||fixtures.some(x=>x.status!=='safe-in-sample'||
      x.planned<2||x.restorationVerified!==true))
    throw Error('P13: new surface preview failed local safety fixtures');
  console.log('P13 summary',JSON.stringify({safe:report.safe,blocked:report.blocked,
    inconclusive:report.inconclusive,promotionEligible:false}));
}
if(require.main===module)main().catch(e=>{
  console.error('P13 failed:',e.stack||e);process.exitCode=1;
});
module.exports=Object.freeze({LOCAL,EXTERNAL,renderScenario});
