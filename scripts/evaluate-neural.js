#!/usr/bin/env node
'use strict';
// Casos reservados de papéis visuais. Rótulos escolhidos manualmente,
// sem navegar/coletar dados. NÃO é comparação de qualidade com Dark Reader.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const colors=require('../content/colors.js');
const {probability,MODEL}=require('../content/neural.js');
const dataset=require('../data/neural-cases.json').cases;
const held=dataset.filter(row=>row.split==='holdout');
const trained=new Set(dataset.filter(row=>row.split==='train').map(row=>row.id));
assert.ok(held.length>=10 && held.every(row=>!trained.has(row.id)), 'holdout independente por cenário');
const features=row=>colors.neuralFeatures(colors.parseColor(row.bg),colors.parseColor(row.fg),colors.parseColor(row.parent),{control:row.control,selected:row.selected});
const simpleHeuristic=x=>+(x[2]>=.82 && x[0]>=.175 && x[1]<=.28 && x[0]-x[1]>=.105);
function evaluate(fn){let tp=0,tn=0,fp=0,fnc=0;const errors=[];
  for(const row of held){const pred=fn(features(row))?1:0;
    if(pred&&row.label)tp++;else if(!pred&&!row.label)tn++;else {if(pred)fp++;else fnc++;errors.push(row.id);}}
  return {total:held.length,accuracy:+((tp+tn)/held.length).toFixed(4),precision:+(tp/(tp+fp||1)).toFixed(4),recall:+(tp/(tp+fnc||1)).toFixed(4),tp,tn,fp,fn:fnc,errors};
}
const before=evaluate(simpleHeuristic),after=evaluate(x=>probability(x)>=.80);
assert.equal(MODEL.input,7,'modelo de contexto obrigatório');
assert.ok(after.accuracy>=before.accuracy,'modelo contextual deve superar ou igualar heurística anterior');
assert.ok(after.accuracy>=.85 && after.fp<=1 && after.fn<=1,'modelo não passou nos casos reservados');
const begin=performance.now();
for(let i=0;i<100000;i++)probability(features(held[i%held.length]));
const time=performance.now()-begin;
console.log(JSON.stringify({evaluation:'heldout-curated-scenarios-not-real-websites',oldHeuristic:before,contextualModel:after,model:{input:MODEL.input,hidden:MODEL.hidden},benchmark100kMs:+time.toFixed(1)},null,2));
