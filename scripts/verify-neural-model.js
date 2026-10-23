#!/usr/bin/env node
'use strict';
// O CI nunca publica modelos; apenas compara o candidato treinado com o publicado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../vendor/neural_core/neural-core.js');
const root = path.resolve(__dirname, '..');
const deployed = JSON.parse(fs.readFileSync(path.join(root,'data/neural-model.json'),'utf8'));
const candidate = JSON.parse(fs.readFileSync(path.join(root,'data/neural-ci-candidate.json'),'utf8'));
assert.deepEqual(candidate,deployed,'Pesos alterados: revise o candidato antes de promover o modelo');
const model = core.loadModel(deployed);
const samples = require('../training/neural-features.json').samples;
const scores = {};
for(const split of ['validation','holdout']) {
  const testCases = samples.filter(row=>row.split===split);
  let right=0, fp=0, fn=0;
  for(const row of testCases) {
    const got=core.predict(model,row.x)[0]>=0.80;
    const expected=row.y[0]===1;
    right+=Number(got===expected);
    fp+=Number(got && !expected);
    fn+=Number(!got && expected);
  }
  scores[split]={total:testCases.length,right,fp,fn};
}
assert.ok(scores.validation.right>=17 && scores.validation.fp<=1);
assert.ok(scores.holdout.right>=30 && scores.holdout.fp<=1 && scores.holdout.fn<=2);
console.log('Modelo publicado é idêntico ao candidato reproduzido e atende limites:',JSON.stringify(scores));
