#!/usr/bin/env node
'use strict';
// Treino determinístico offline: rótulos visuais curados em data/neural-cases.json.
// Exemplos sintéticos de casos de interface; NÃO são capturas de sites reais.
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const dataset=require('../data/neural-cases.json').cases;
const INPUT=7,HIDDEN=12;
let seed=20261023;
const rnd=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const sigmoid=x=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
const trainCases=dataset.filter(row=>row.split==='train');
const holdoutCases=dataset.filter(row=>row.split==='holdout');
if(trainCases.length<20 || holdoutCases.length<10) throw Error('Dataset insuficiente');
function jitterColor(color,magnitude=6) {
  const c=colors.parseColor(color);
  if(!c)throw Error('Cor inválida no dataset: '+color);
  const adjust=n=>Math.max(0,Math.min(255,Math.round(n+(rnd()*2-1)*magnitude)));
  return {r:adjust(c.r),g:adjust(c.g),b:adjust(c.b),a:c.a};
}
function features(row,augment=false) {
  const bg=augment?jitterColor(row.bg):colors.parseColor(row.bg);
  const fg=augment?jitterColor(row.fg):colors.parseColor(row.fg);
  const ancestor=augment?jitterColor(row.parent):colors.parseColor(row.parent);
  return colors.neuralFeatures(bg,fg,ancestor,{control:row.control,selected:row.selected});
}
const training=[];
for(const row of trainCases) {
  // O split é por cenário; nenhum exemplo de holdout é usado para ajustar pesos.
  for(let k=0;k<48;k++)training.push({x:features(row,k!==0),y:row.label});
}
const w1=Array.from({length:HIDDEN},()=>Array.from({length:INPUT},()=> (rnd()-.5)*.75));
const b1=Array(HIDDEN).fill(0);
const w2=Array.from({length:HIDDEN},()=> (rnd()-.5)*.75);
let b2=0;
function probability(x){
  const h=w1.map((weights,i)=>Math.tanh(weights.reduce((v,w,k)=>v+w*x[k],b1[i])));
  return {h,p:sigmoid(h.reduce((v,a,i)=>v+a*w2[i],b2))};
}
for(let epoch=0;epoch<125;epoch++){
  for(let i=training.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[training[i],training[j]]=[training[j],training[i]];}
  const rate=.047 * (.35 + .65 * (1-epoch/125));
  for(const {x,y} of training){
    const {h,p}=probability(x),diff=p-y;
    const back=w2.map((weight,i)=>diff*weight*(1-h[i]*h[i]));
    for(let j=0;j<HIDDEN;j++){
      w2[j]-=rate*diff*h[j];
      for(let k=0;k<INPUT;k++)w1[j][k]-=rate*back[j]*x[k];
      b1[j]-=rate*back[j];
    }
    b2-=rate*diff;
  }
}
const predict=row=>probability(features(row)).p>=.80?1:0;
const stats=cases=>{
  let tp=0,tn=0,fp=0,fn=0;
  for(const row of cases){const got=predict(row);if(got&&row.label)tp++;else if(!got&&!row.label)tn++;else if(got)fp++;else fn++;}
  return {total:cases.length,tp,tn,fp,fn,accuracy:(tp+tn)/cases.length};
};
const report={train:stats(trainCases),holdout:stats(holdoutCases)};
console.log('Métricas por cenário (não por amostras aumentadas):',JSON.stringify(report));
for(const row of holdoutCases)console.log(row.id, row.label, probability(features(row)).p.toFixed(4));
if(report.holdout.accuracy<.85 || report.holdout.fp>1 || report.holdout.fn>1)throw Error('Modelo falhou na avaliação reservada');
const obj={input:INPUT,hidden:HIDDEN,w1:w1.map(r=>r.map(n=>+n.toFixed(7))),b1:b1.map(n=>+n.toFixed(7)),w2:w2.map(n=>+n.toFixed(7)),b2:+b2.toFixed(7)};
const output=`/* Modelo neural contextual, treino offline reproduzível com exemplos curados.\n * Gerado por node scripts/train-neural.js. Sem telemetria ou aprendizagem online. */\n(function exposeNeural(root){\n 'use strict';\n const MODEL=Object.freeze(${JSON.stringify(obj)});\n function probability(features){\n  if(!Array.isArray(features)||features.length!==MODEL.input || !features.every(Number.isFinite))return 0;\n  const x=features.map(value=>Math.max(0,Math.min(1,value)));\n  let sum=MODEL.b2;\n  for(let j=0;j<MODEL.hidden;j++){\n   let a=MODEL.b1[j];for(let k=0;k<MODEL.input;k++)a+=MODEL.w1[j][k]*x[k];\n   sum+=Math.tanh(a)*MODEL.w2[j];\n  }\n  return 1/(1+Math.exp(-Math.max(-35,Math.min(35,sum))));\n }\n const api=Object.freeze({MODEL,probability});\n if(typeof module!=='undefined'&&module.exports)module.exports=api;\n else root.DarkExtensionNeural=api;\n})(globalThis);\n`;
fs.writeFileSync(path.join(__dirname,'../content/neural.js'),output);
console.log('Pesos:',Buffer.byteLength(output),'bytes');
