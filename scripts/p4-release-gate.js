#!/usr/bin/env node
'use strict';
// P4: auditoria de elegibilidade. NUNCA publica modelos automaticamente.
const fs=require('node:fs');
const path=require('node:path');
const {assessBudget}=require('./p4-neural-benchmark.js');
const {SITES}=require('./real-site-audit.js');
const ROOT=path.resolve(__dirname,'..');
const choice=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const read=name=>{
  const input=choice(name);
  if(!input)return null;
  const filepath=path.resolve(input);
  if(!fs.existsSync(filepath))return null;
  return JSON.parse(fs.readFileSync(filepath,'utf8'));
};
function validSynthetic(result){
  if(!result||result.candidate!=='not-deployed'||
    result.releaseStatus?.candidatePassedSyntheticGates!==true||
    result.releaseStatus?.deployed!==false)return false;
  for(const split of ['validation','holdout']){
    const value=result[split],trained=value?.trained,baseline=value?.baseline;
    if(trained?.total!==504||!Number.isFinite(trained.accuracy)||
       !Number.isFinite(trained.precision)||!Number.isFinite(trained.recall)||
       !Number.isSafeInteger(trained.fp)||!Number.isSafeInteger(baseline?.fp)||
       trained.accuracy<.90||trained.precision<.90||trained.recall<.80||
       trained.accuracy<baseline.accuracy||trained.fp>baseline.fp) return false;
    const legacy=result.legacySynthetic?.splits?.[split];
    if(!legacy||legacy.candidate?.total!==legacy.baseline?.total||
       legacy.candidate?.right<legacy.baseline?.right||
       legacy.candidate?.fp>legacy.baseline?.fp)return false;
  }
  return true;
}
function siteCoverage(report,required,mode){
  if(!report||report.completed!==true||report.mode!==mode||
    report.candidateDeployed!==false||!Array.isArray(report.results))return false;
  if(report.results.length!==required.length)return false;
  const sites=new Set();
  for(const row of report.results){
    if(!row||!required.includes(row.site)||sites.has(row.site)||
      !(row.assessment?.status==='observed-no-regression'||(
        mode==='automatic-native-detection'&&
        row.assessment?.status==='expected-native-dark-skip'&&
        row.assessment?.evidence==='native-dark-both-models'))||
      row.baseline?.kind!=='observed'||
      row.candidate?.kind!=='observed'||
      typeof row.baseline.capture!=='string'||!row.baseline.capture.endsWith('.png')||
      typeof row.candidate.capture!=='string'||!row.candidate.capture.endsWith('.png'))
      return false;
    sites.add(row.site);
  }
  return sites.size===required.length;
}
function assessPromotion({synthetic=null,benchmark=null,automatic=null,forced=null}={}){
  const blockers=[];
  if(!validSynthetic(synthetic))blockers.push('Modelo não passou por validação e holdout sintéticos/legados');
  if(!assessBudget(benchmark).pass)blockers.push('Orçamento de desempenho ou tamanho não comprovado');
  const ids=SITES.map(site=>site.id);
  if(!siteCoverage(automatic,ids,'automatic-native-detection'))
    blockers.push('Cobertura real no modo automático incompleta ou inconclusiva');
  if(!siteCoverage(forced,['roblox','youtube','github'],'global-ignore-native-dark'))
    blockers.push('Cobertura real no modo global incompleta ou inconclusiva');
  return Object.freeze({
    formatVersion:1,
    status:blockers.length?'blocked':'manual-review-required',
    readyForReview:blockers.length===0,
    autoPromote:false, // Proibição deliberada: nenhuma condição neste CI escreve pesos.
    blockers,
    mandatoryManualChecks:[
      'Inspecionar screenshots de todos os sites e estados de interação',
      'Revisar indicadores e ícones no Roblox com tema nativo ignorado',
      'Avaliar dados independentes de páginas e navegação reais, sem rótulos sintéticos',
      'Aprovação humana via revisão explícita de um PR separado de promoção'
    ]
  });
}
function main(){
  const verdict=assessPromotion({
    synthetic:read('synthetic'),
    benchmark:read('benchmark'),
    automatic:read('automatic'),
    forced:read('forced')
  });
  const file=path.resolve(choice('output')||path.join(ROOT,'data/p4-ci-gate.json'));
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(verdict,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
      '### P4 — Segurança da promoção de pesos','',
      '**'+verdict.status+'**. Publicação automática: **não permitida**.','',
      ...verdict.blockers.map(b=>'- Bloqueio: '+b),'',
      'Os testes do CI verificam a infraestrutura; não certificam qualidade visual completa.',''
    ].join('\n')+'\n');
  }
  console.log(JSON.stringify(verdict));
  // Retornar sucesso se o relatório foi emitido: "bloqueado" é o estado seguro.
}
if(require.main===module)main();
module.exports={validSynthetic,siteCoverage,assessPromotion};
