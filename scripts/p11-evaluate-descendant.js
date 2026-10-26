#!/usr/bin/env node
'use strict';
// P11: compara predições JS com relatório Python em famílias de holdout sintético.
// Não executa em sites reais, não altera manifesto ou pesos publicados.
const fs=require('node:fs');
const path=require('node:path');
const core=require('../vendor/neural_core/neural-core.js');
const colors=require('../content/colors.js');
const {loadCandidate,predictText}=require('../training/p11-descendant-runtime.js');
const ROOT=path.resolve(__dirname,'..');
const model=JSON.parse(fs.readFileSync(path.join(ROOT,'data/p11-descendant-ci-candidate.json'),'utf8'));
const corpus=JSON.parse(fs.readFileSync(path.join(ROOT,'training/p11-descendant-features.json'),'utf8'));
const python=JSON.parse(fs.readFileSync(path.join(ROOT,'data/p11-descendant-ci-metrics.json'),'utf8'));
const candidate=loadCandidate(core,model);
const bySplit={},families={};
for(const row of corpus.samples){
  if(!['train','validation','holdout'].includes(row.split))throw Error('Split P11 inválido');
  const result=predictText(core,candidate,row.x,colors);
  const stats=bySplit[row.split]??={total:0,accepted:0,rejected:0};
  stats.total++;
  if(result.action==='suggest')stats.accepted++;
  else stats.rejected++;
  (families[row.split]??=new Set()).add(row.family);
}
if(bySplit.train.total!==1440||bySplit.validation.total!==576||
  bySplit.holdout.total!==576||families.train.size!==5||
  families.validation.size!==2||families.holdout.size!==2)
  throw Error('P11: resultados fora das famílias isoladas');
for(const split of ['train','validation','holdout']){
  const pythonUnsafe=python.splits[split].unsafeColorProposals;
  if(Math.abs(bySplit[split].rejected-pythonUnsafe)>3)
    throw Error('P11: Python e JS divergiram na inferência '+split);
}
const audit={kind:'p11-descendant-synthetic-js-audit-not-for-promotion',
  promotionEligible:false,readyForRelease:false,
  validation:bySplit.validation,holdout:bySplit.holdout,
  note:'O gate rejeita previsões neurais de contraste inadequado. Não há evidência humana de generalização em sites reais.'};
const out=path.join(ROOT,'data/p11-descendant-ci-audit.json');
fs.writeFileSync(out,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit));
