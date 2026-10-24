#!/usr/bin/env node
'use strict';
// P2: comparação HONESTA em conjunto sintético com holdout por família.
// Só avalia o candidato; NÃO publica pesos ou altera a extensão distribuída.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const core=require('../vendor/neural_core/neural-core.js');
const root=path.resolve(__dirname,'..');
const samples=JSON.parse(fs.readFileSync(path.join(root,'training/contextual-features.json'),'utf8'));
const candidate=core.loadModel(JSON.parse(fs.readFileSync(path.join(root,'data/contextual-ci-candidate.json'),'utf8')));
const current=core.loadModel(require('../data/neural-model.json'));
assert.equal(candidate.inputSize,18,'Modelo contextual não tem 18 entradas');
assert.equal(current.inputSize,7,'Baseline não é o modelo distribuído de sete entradas');
assert.equal(samples.featureCount,18);
assert.equal(samples.samples.length,2520);
const predict=(model,features)=>core.predict(model,features)[0]>=.80;
function measure(rows, model, dimensions) {
  let tp=0,tn=0,fp=0,fn=0;
  const errors=[];
  for(const row of rows){
    const predicted=predict(model,row.x.slice(0,dimensions));
    const expected=row.y[0]===1;
    if(predicted&&expected)tp++;
    else if(!predicted&&!expected)tn++;
    else {predicted?fp++:fn++;errors.push(row.id);}
  }
  return {total:rows.length,tp,tn,fp,fn,
    accuracy:+((tp+tn)/rows.length).toFixed(4),
    precision:+(tp/(tp+fp)||0).toFixed(4),
    recall:+(tp/(tp+fn)||0).toFixed(4),errors:errors.slice(0,12)};
}
const report={source:'curated-synthetic-policy-not-real-sites',candidate:'not-deployed'};
for(const split of ['validation','holdout']){
  const rows=samples.samples.filter(row=>row.split===split);
  const baseline=measure(rows,current,7),trained=measure(rows,candidate,18);
  report[split]={baseline,trained};
  assert.ok(trained.accuracy>=.90,
    split+': precisão geral insuficiente no conjunto sintético: '+trained.accuracy);
  assert.ok(trained.precision>=.90 && trained.recall>=.80,
    split+': falso positivo ou cobertura negativa acima do limite');
  assert.ok(trained.fp<=baseline.fp,
    split+': regressão de falsos positivos vs modelo atual');
  assert.ok(trained.accuracy>=baseline.accuracy,
    split+': candidato pior que o modelo atual');
}
// Smoke de inferência JS: o candidato só será promovido em etapa específica
// após testes visuais/reais e aprovação de mudança de pesos.
const metricFile=path.join(root,'data/contextual-ci-metrics.json');
if(fs.existsSync(metricFile)){
  const python=JSON.parse(fs.readFileSync(metricFile,'utf8'));
  for(const split of ['validation','holdout']){
    for(const key of ['tp','tn','fp','fn'])
      assert.equal(report[split].trained[key],python[split][key],
        'Divergência Python / JS em '+split+'.'+key);
  }
}
console.log(JSON.stringify(report,null,2));
