#!/usr/bin/env node
'use strict';
// P8: compara arquiteturas contra P7, não promove modelos.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const core=require('../vendor/neural_core/neural-core.js');
const {verify}=require('./export-neural-color-features.js');
const {loadCandidate,predictColors}=require('../training/neural-color-p8-runtime.js');
const {decode:decodeP7}=require('../training/neural-color-runtime.js');
const colors=require('../content/colors.js');
const ROOT=path.join(__dirname,'..');
const load=filepath=>JSON.parse(fs.readFileSync(path.join(ROOT,filepath),'utf8'));
const doc=load('training/neural-color-features.json');
verify(doc);
const p7=core.loadModel(load('data/neural-color-ci-candidate.json'));
const p8raw=load('data/neural-color-p8-ci-candidate.json');
const p8=loadCandidate(core,p8raw);
assert.equal(p8raw.kind,'neural-color-twohead-experimental-v1');
const report={kind:'p8-independent-audit-synthetic-not-deployed',
  deploymentEligible:false,
  note:'P8 calibrated on validation only; holdout/stress audited, not used for training or threshold selection',
  validationSelectedThreshold:p8.threshold,comparison:{},performance:{}};
for(const split of ['train','validation','holdout','stress']){
  const rows=doc.samples.filter(row=>row.split===split);
  const stats={};
  for(const which of ['p7','p8']){
    let fp=0,fn=0,tp=0,tn=0,contrastBelowAA=0,converted=0,rgbMAE=0,positiveChannels=0;
    const families={};
    for(const row of rows){
      const action=which==='p7'?decodeP7(core,p7,row.x):predictColors(core,p8,row.x);
      const expected=row.y[0]===1,actual=action.action==='convert';
      if(expected&&actual){tp++;}else if(expected){fn++;}else if(actual){fp++;}else{tn++;}
      const group=families[row.group]??={fp:0,fn:0,total:0};
      group.total++;
      if(!expected&&actual)group.fp++;
      if(expected&&!actual)group.fn++;
      if(actual){
        converted++;
        const bg=colors.parseColor(action.background),fg=colors.parseColor(action.color);
        assert.ok(bg&&fg);
        if(colors.contrastRatio(bg,fg)<4.5)contrastBelowAA++;
      }
      if(expected){
        const outputs=which==='p7'?Array.from(core.predict(p7,row.x)).slice(1):
          Array.from(core.predict(p8.rgb,row.x));
        rgbMAE+=outputs.reduce((sum,value,i)=>sum+Math.abs(value-row.y[i+1]),0);
        positiveChannels+=6;
      }
    }
    stats[which]={total:rows.length,tp,tn,fp,fn,converted,
      rgbMAE:positiveChannels?Number((rgbMAE/positiveChannels).toFixed(5)):null,
      contrastBelowAA,families};
  }
  report.comparison[split]=stats;
}
const subset=doc.samples.filter(row=>row.split==='train').slice(0,100);
function bench(run){
  for(const sample of subset)run(sample.x);
  const start=process.hrtime.bigint();
  for(const sample of subset)run(sample.x);
  return Number(process.hrtime.bigint()-start)/1e6;
}
report.performance={note:'Microbenchmark Node.js de 100 amostras; não equivale a desempenho no navegador',
  p7Ms:bench(x=>decodeP7(core,p7,x)),p8Ms:bench(x=>predictColors(core,p8,x))};
const metrics=load('data/neural-color-p8-ci-metrics.json');
assert.equal(metrics.thresholdSource,'validation-negative-max');
assert.equal(metrics.threshold,p8.threshold);
assert.equal(metrics.featureAudit.overlap.validation,0);
assert.equal(metrics.featureAudit.overlap.holdout,0);
assert.equal(metrics.featureAudit.overlap.stress,0);
console.log(JSON.stringify({threshold:report.validationSelectedThreshold,
  splits:Object.fromEntries(Object.entries(report.comparison).map(([name,models])=>
    [name,Object.fromEntries(Object.entries(models).map(([k,stats])=>[k,
      {tp:stats.tp,tn:stats.tn,fp:stats.fp,fn:stats.fn,rgbMAE:stats.rgbMAE,contrastBelowAA:stats.contrastBelowAA}]))])),
  microbenchMs:report.performance}));
fs.writeFileSync(path.join(ROOT,'data/neural-color-p8-ci-comparison.json'),
  JSON.stringify(report,null,2)+'\n');
assert.equal(report.deploymentEligible,false);
