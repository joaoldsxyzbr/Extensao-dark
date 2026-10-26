#!/usr/bin/env node
'use strict';
// P7: mede acerto no laboratório; NUNCA transforma a extensão em runtime experimental.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const neural=require('../vendor/neural_core/neural-core.js');
const {decode}=require('../training/neural-color-runtime.js');
const {verify}=require('./export-neural-color-features.js');
const colors=require('../content/colors.js');
const ROOT=path.join(__dirname,'..');
const corpus=JSON.parse(fs.readFileSync(path.join(ROOT,'training/neural-color-features.json')));
verify(corpus);
const definition=JSON.parse(fs.readFileSync(path.join(ROOT,'data/neural-color-ci-candidate.json')));
const model=neural.loadModel(definition);
assert.equal(model.inputSize,57);
assert.equal(model.outputSize,7);
assert.equal(definition.layers.at(-1).activation,'sigmoid');
const trainFeatures=new Set(corpus.samples.filter(r=>r.split==='train').map(r=>r.x.join(',')));
const result={kind:'synthetic-neural-color-lab-not-deployed',promotionEligible:false,
  note:'Métricas exploratórias: alvos artificiais, sem avaliação visual independente',splits:{}};
for(const split of ['train','validation','holdout','stress']){
  const rows=corpus.samples.filter(r=>r.split===split);
  let converted=0,falsePositives=0,falseNegatives=0,lowContrast=0,colorError=0,channels=0,overlap=0;
  for(const row of rows){
    const p=neural.predict(model,row.x);
    assert.ok(p.length===7 && Array.from(p).every(n=>Number.isFinite(n)&&n>=0&&n<=1));
    const output=decode(neural,model,row.x);
    const actual=output.action==='convert',expected=row.y[0]===1;
    if(actual)converted++;
    if(actual&&!expected)falsePositives++;
    if(!actual&&expected)falseNegatives++;
    if(actual){
      const bg=colors.parseColor(output.background),fg=colors.parseColor(output.color);
      assert.ok(bg&&fg);
      if(colors.contrastRatio(bg,fg)<4.5)lowContrast++;
    }
    if(expected){colorError+=Array.from(p).slice(1).reduce((s,v,i)=>s+Math.abs(v-row.y[i+1]),0);channels+=6;}
    if(split!=='train'&&trainFeatures.has(row.x.join(',')))overlap++;
  }
  result.splits[split]={total:rows.length,converted,falsePositives,falseNegatives,
    contrastBelowAA:lowContrast,rgbMAE:channels?Number((colorError/channels).toFixed(5)):null,
    sameFeatureAsTraining:overlap};
}
const target=path.join(ROOT,'data/neural-color-ci-evaluation.json');
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
