#!/usr/bin/env node
'use strict';
// Avaliação de cenários SINTÉTICOS reservados: não é prova de qualidade em sites reais.
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const colors = require('../content/colors.js');
const core = require('../vendor/neural_core/neural-core.js');
const model = require('../data/neural-model.json');
const dataset = require('../data/neural-cases.json').cases;
const threshold = 0.80;
const loaded = core.loadModel(model);
const features = row => colors.neuralFeatures(
  colors.parseColor(row.bg),colors.parseColor(row.fg),colors.parseColor(row.parent),
  {control:row.control,selected:row.selected}
);
const simple = x => +(x[2]>=.82 && x[0]>=.175 && x[1]<=.28 && x[0]-x[1]>=.105);
const neural = x => core.predict(loaded,x)[0] >= threshold;
function evaluate(rows, classify) {
  let tp=0,tn=0,fp=0,fn=0;
  const errors=[];
  for(const row of rows) {
    const output = Boolean(classify(features(row))), expect = Boolean(row.label);
    if(output && expect) tp++;
    else if(!output && !expect) tn++;
    else {output?fp++:fn++;errors.push(row.id);}
  }
  return {total: rows.length,accuracy: (tp+tn)/rows.length, tp,tn,fp,fn,errors};
}
const groups = Object.groupBy(dataset,row=>row.split);
const results={evaluation:'manually-curated-synthetic-not-real-websites'};
for(const split of ['validation','holdout']) {
  const cases = groups[split] ?? [];
  assert.ok(cases.length>=10, 'Cenários insuficientes: '+split);
  results[split]={heuristic:evaluate(cases,simple),neural:evaluate(cases,neural)};
}
const start=performance.now();
const held=groups.holdout;
for(let i=0;i<100000;i++) neural(features(held[i%held.length]));
results.benchmark100kMs=+(performance.now()-start).toFixed(1);
const h=results.holdout.neural;
assert.ok(h.accuracy>=0.90 && h.fp<=1 && h.fn<=2,'Modelo falhou na validação sintética reservada');
assert.ok(h.accuracy>=results.holdout.heuristic.accuracy,'Modelo abaixo da heurística no holdout');
console.log(JSON.stringify(results,null,2));
