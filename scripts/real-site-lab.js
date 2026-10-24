#!/usr/bin/env node
'use strict';
// P3: evidência observacional de páginas reais públicas em perfis descartáveis.
// Não lê texto, cookies, formulários, dados de conta, nem publica candidato.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,sleep,ROOT,browserPath}=require('./browser-e2e.js');
const {chooseSites,isAllowedLanding,assessPair,promotionGate}=require('./real-site-audit.js');
const {EXPRESSION,summarize}=require('./real-site-snapshot.js');
const opt=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const OUTPUT=path.resolve(opt('output')||path.join(os.tmpdir(),'extensao-dark-real-sites'));
const CANDIDATE=path.resolve(opt('candidate')||path.join(ROOT,'data/contextual-ci-candidate.json'));
const SITES=chooseSites(opt('sites'));
const REPORT=path.join(OUTPUT,'real-sites-report.json');
const FORCE_NATIVE=process.argv.includes('--force-native');
function copyExtension(folder,{forceNativeDark=false}={}){
  fs.mkdirSync(folder,{recursive:true});
  for(const sub of ['content','vendor','icons','popup'])
    fs.cpSync(path.join(ROOT,sub),path.join(folder,sub),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'manifest.json'),path.join(folder,'manifest.json'));
  if(forceNativeDark){
    const file=path.join(folder,'content/content.js');
    const before=fs.readFileSync(file,'utf8');
    assert.equal(before.split('ignoreNativeDark: false').length,2,
      'Contrato de preferência global mudou: revisão obrigatória no laboratório');
    fs.writeFileSync(file,before.replace('ignoreNativeDark: false','ignoreNativeDark: true'),'utf8');
  }
}
function baselineExtension(folder,options={}){
  copyExtension(folder,options);
}
function candidateExtension(candidate,folder,options={}){
  const loaded=core.loadModel(candidate);
  assert.equal(loaded.inputSize,18,'Candidato deve usar o contexto P1 de 18 entradas');
  assert.equal(loaded.outputSize,1,'Modelo sem saída de classificação');
  const baseline=core.loadModel(JSON.parse(fs.readFileSync(path.join(ROOT,'data/neural-model.json'),'utf8')));
  assert.equal(baseline.inputSize,7,'O modelo publicado foi alterado inesperadamente');
  copyExtension(folder,options);
  const adapter=path.join(folder,'content/neural.js');
  const source=fs.readFileSync(adapter,'utf8');
  const regex=/const definition = [^\n]+;\nlet loaded;/;
  assert.match(source,regex,'Adaptador neural mudou: revisar montagem isolada');
  fs.writeFileSync(adapter,source.replace(regex,'const definition = '+JSON.stringify(candidate)+';\nlet loaded;'),'utf8');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT,'content/neural.js'),'utf8'),
    /"inputSize":18,"outputSize":14/,'não alterar o modelo distribuído');
}
async function observe(site,model,extension) {
  const begun=performance.now();
  let launched;
  try {
    launched=await launch(extension);
    const page=launched.page;
    await page.navigate(site.url,{fixtureReady:false});
    await sleep(750);
    const raw=await page.eval(EXPRESSION);
    const result=summarize(raw);
    const ms=Math.round(performance.now()-begun);
    if(!isAllowedLanding(site,result.landingUrl))
      return {kind:'inconclusive',reason:'redirecionamento externo ou bloqueio de acesso',durationMs:ms};
    if(result.totalElements<site.minSamples||result.sampledText<site.minSamples)
      return {kind:'inconclusive',reason:'página não forneceu amostras suficientes',durationMs:ms};
    // Somente capturas de páginas públicas abertas num perfil novo sem login.
    const filename=site.id+'-'+model+'.png';
    let captured=false;
    try{await page.screenshot(path.join(OUTPUT,filename));captured=true;}
    catch{ /* captura indisponível não vira aprovação visual */ }
    return {kind:'observed',durationMs:ms,capture:captured?filename:null,summary:result};
  }catch(error){
    // Erros de páginas remotas NÃO são interpretados como defeitos da extensão.
    return {kind:'inconclusive',reason:'navegação, rede, CDP ou leitura indisponíveis',
      durationMs:Math.round(performance.now()-begun)};
  }finally{
    if(launched)await launched.stop();
  }
}
function update(report){
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
}
async function main(){
  if(!fs.existsSync(CANDIDATE))
    throw Error('Arquivo do candidato ausente. Execute python3 -m training.train_contextual no CI.');
  browserPath();
  fs.mkdirSync(OUTPUT,{recursive:true});
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ext-dark-p3-model-'));
  const baselineDir=path.join(temp,'baseline');
  const candidateDir=path.join(temp,'candidate');
  const report={
    formatVersion:1,mode:'public-sites-observational',siteIds:SITES.map(s=>s.id),
    comparison:'deployed-7d-versus-ephemeral-candidate-18d',
    mode:FORCE_NATIVE?'global-ignore-native-dark':'automatic-native-detection',
    measurements:'public-landing-page-dom-colors-and-masked-icons',
    noPersonalData:true,
    candidateDeployed:false,results:[]
  };
  try {
    baselineExtension(baselineDir,{forceNativeDark:FORCE_NATIVE});
    candidateExtension(JSON.parse(fs.readFileSync(CANDIDATE,'utf8')),candidateDir,
      {forceNativeDark:FORCE_NATIVE});
    update(report);
    for(const site of SITES){
      const baseline=await observe(site,'baseline',baselineDir);
      const candidate=await observe(site,'candidate',candidateDir);
      const assessment=baseline.kind==='observed'&&candidate.kind==='observed'
        ?assessPair(site,baseline.summary,candidate.summary)
        :{status:'inconclusive',reason:'página não carregou nos dois perfis'};
      report.results.push({
        site:site.id,group:site.group,assessment,
        baseline:{kind:baseline.kind,durationMs:baseline.durationMs,
          capture:baseline.capture||null,...(baseline.reason?{reason:baseline.reason}:{})},
        candidate:{kind:candidate.kind,durationMs:candidate.durationMs,
          capture:candidate.capture||null,...(candidate.reason?{reason:candidate.reason}:{})}
      });
      update(report);
      console.log('P3',site.id,assessment.status,
        assessment.status==='inconclusive'
          ? (baseline.reason||candidate.reason||assessment.reason) : '');
    }
    report.promotion=promotionGate(report.results);
    report.completed=true;
    update(report);
    const warnings=report.results.filter(item=>item.assessment.status!=='observed-no-regression');
    for(const item of warnings) console.warn(
      '::warning title=P3 '+item.site+'::'+item.assessment.status);
    if(process.env.GITHUB_STEP_SUMMARY){
      const lines=[
        '### Laboratório P3 — '+report.mode,
        '',
        '| Site | Resultado |',
        '|---|---|',
        ...report.results.map(item=>'| '+item.site+' | '+item.assessment.status+' |'),
        '',
        '**Promoção do modelo: bloqueada.** Revisão visual ainda obrigatória.',
        ''
      ];
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
    }
    console.log('P3 evidência registrada:',REPORT,JSON.stringify(report.promotion));
    if(report.promotion.observed===0 && report.promotion.needsReview===0)
      console.warn('P3: nenhum site comparável; relatório INCONCLUSIVO, não aprovado.');
    // A instabilidade de sites externos não deve mascarar os testes locais; os
    // resultados obrigam revisão manual, mesmo quando todos estão disponíveis.
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{
  console.error('Falha estrutural do laboratório P3:',error.stack||error);
  process.exitCode=1;
});
module.exports={candidateExtension,baselineExtension,observe,main};
