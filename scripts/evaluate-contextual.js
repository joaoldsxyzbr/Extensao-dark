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
const colors=require('../content/colors.js');
const legacy=require('../data/neural-cases.json').cases;
assert.equal(candidate.inputSize,18,'Modelo contextual não tem 18 entradas');
assert.equal(current.inputSize,7,'Baseline não é o modelo distribuído de sete entradas');
assert.equal(samples.featureCount,18);
assert.equal(samples.samples.length,2520);
const thresholds=require('../data/neural-thresholds.json');
const predict=(model,features,threshold)=>core.predict(model,features)[0]>=threshold;
function measure(rows, model, dimensions) {
  let tp=0,tn=0,fp=0,fn=0;
  const errors=[];
  for(const row of rows){
    const predicted=predict(model,row.x.slice(0,dimensions),dimensions===18?thresholds.candidate:thresholds.baseline);
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
const report={source:'curated-synthetic-policy-not-real-sites',candidate:'not-deployed',thresholds};
for(const split of ['validation','holdout']){
  const rows=samples.samples.filter(row=>row.split===split);
  const baseline=measure(rows,current,7),trained=measure(rows,candidate,18);
  report[split]={baseline,trained};
  const failingFamilies=Object.entries(rows.filter(row=>
    predict(candidate,row.x,thresholds.candidate)!==(row.y[0]===1)).reduce((totals,row)=>
    (totals[row.group]=(totals[row.group]||0)+1,totals),{}));
  console.log(split+': '+JSON.stringify({baseline,trained,failingFamilies}));
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
// Amostras legadas são outra distribuição sintética de 7 entradas.
const legacyScenarios=legacy.filter(row=>['validation','holdout'].includes(row.split));
function legacyScore(rows,model,extended){
  let right=0,fp=0,fn=0;
  for(const row of rows){
    const bg=colors.parseColor(row.bg),fg=colors.parseColor(row.fg);
    const parent=colors.parseColor(row.parent);
    const context={kind:'surface',control:!!row.control,selected:!!row.selected,
      contrast:colors.contrastRatio(bg,fg),
      nativeDark:colors.isNativeDarkSurface(row.bg,row.fg),
      translucent:!!bg&&bg.a>=.12&&bg.a<.95};
    const features=extended?colors.contextFeatures(bg,fg,parent,context):
      colors.neuralFeatures(bg,fg,parent,context);
    const got=predict(model,features,extended?thresholds.candidate:thresholds.baseline);
    const expected=row.label===1;
    right+=Number(got===expected);
    fp+=Number(got&&!expected);
    fn+=Number(!got&&expected);
  }
  return {total:rows.length,right,fp,fn};
}
report.legacySynthetic={note:'Diagnóstico de transferência, SEM gate de promoção: os 132 casos legados não têm os novos sinais semânticos.',splits:{}};
for(const split of ['validation','holdout']){
  const rows=legacyScenarios.filter(x=>x.split===split);
  report.legacySynthetic.splits[split]={
    baseline:legacyScore(rows,current,false),
    candidate:legacyScore(rows,candidate,true)
  };
  const oldScores=report.legacySynthetic.splits[split];
  assert.ok(oldScores.candidate.right>=oldScores.baseline.right &&
    oldScores.candidate.fp<=oldScores.baseline.fp,
    'Regressão nos cenários legados reservados: '+split);
}
report.releaseStatus={
  candidatePassedSyntheticGates:true,
  deployed:false,
  readyForProduction:false,
  blocker:'Falta avaliação independente de sites reais e aprovação visual P3'
};
fs.writeFileSync(path.join(root,'data/contextual-ci-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
