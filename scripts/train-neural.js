#!/usr/bin/env node
'use strict';
// Treinamento determinístico com exemplos sintéticos/curados. Sem pacotes externos, sem coleta de dados.
const fs = require('node:fs');
const path = require('node:path');
let seed = 20261023;
function rnd() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
const INPUT = 3, HIDDEN = 8;
const w1 = Array.from({length:HIDDEN}, () => Array.from({length:INPUT}, () => (rnd()-.5)*1.5));
const b1 = Array(HIDDEN).fill(0);
const w2 = Array.from({length:HIDDEN}, () => (rnd()-.5)*1.5);
let b2 = 0;
const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x))));
function probability([bg,fg,alpha]) {
  const h=w1.map((row,j)=>Math.tanh(row[0]*bg+row[1]*fg+row[2]*alpha+b1[j]));
  return {h,p:sigmoid(h.reduce((sum,n,j)=>sum+n*w2[j],b2))};
}
function label([bg,fg,alpha]) {
  return Number(alpha >= .82 && bg >= .175 && fg <= .28 && (bg - fg >= .105));
}
function samples(n) {
  const set = [];
  for (let y=0;y<2;y++) {
    let count=0;
    while(count<n/2) {
      const sample=[rnd(), rnd(), .45 + .55*rnd()];
      if(label(sample)!==y) continue;
      set.push({x:sample,y});count++;
    }
  }
  return set;
}
const training=samples(3200);
const evaluation=samples(800);
const rate=.09;
for(let epoch=0;epoch<75;epoch++) {
  for(let i=training.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[training[i],training[j]]=[training[j],training[i]];}
  for(const {x,y} of training){
    const {h,p}=probability(x);
    const diff=p-y;
    const back=w2.map((weight,i)=>diff*weight*(1-h[i]*h[i]));
    for(let j=0;j<HIDDEN;j++) {
      w2[j]-=rate*diff*h[j];
      for(let k=0;k<INPUT;k++)w1[j][k]-=rate*back[j]*x[k];
      b1[j]-=rate*back[j];
    }
    b2-=rate*diff;
  }
}
const accuracy=evaluation.filter(({x,y})=>(probability(x).p >= 0.5 ? 1 : 0)===y).length/evaluation.length;
const checks = [[.28,.008,1],[.02,.86,1],[.95,.008,1]];
const predictions=checks.map(x=>probability(x).p);
if(accuracy<.97 || predictions[0]<=.78 || predictions[1]>=.20 || predictions[2]<=.90) {
  throw Error(`Treinamento insuficiente: acurácia sintética ${accuracy}, exemplos ${predictions}`);
}
const obj={input:INPUT,hidden:HIDDEN,w1:w1.map(r=>r.map(n=>+n.toFixed(7))),b1:b1.map(n=>+n.toFixed(7)),w2:w2.map(n=>+n.toFixed(7)),b2:+b2.toFixed(7)};
const output=`/* Rede neural pequena, treinada localmente com amostras sintéticas curadas.\n * Gerada por: node scripts/train-neural.js (Node nativo).\n * Sem aprendizagem online, telemetria, dependências ou conexões externas. */\n(function exposeNeural(root) {\n  'use strict';\n  const MODEL = Object.freeze(${JSON.stringify(obj)});\n  function probability(features) {\n    if (!Array.isArray(features) || features.length !== MODEL.input) return 0;\n    const x = features.map(value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);\n    let sum = MODEL.b2;\n    for (let j=0;j<MODEL.hidden;j++) {\n      let a = MODEL.b1[j];\n      for (let k=0;k<MODEL.input;k++) a += MODEL.w1[j][k]*x[k];\n      sum += Math.tanh(a)*MODEL.w2[j];\n    }\n    return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, sum))));\n  }\n  const api = Object.freeze({MODEL, probability});\n  if (typeof module !== 'undefined' && module.exports) module.exports = api;\n  else root.DarkExtensionNeural = api;\n})(globalThis);\n`;
const target=path.join(__dirname,'../content/neural.js');
fs.writeFileSync(target,output);
console.log(`Acurácia em amostras sintéticas de validação: ${(accuracy*100).toFixed(1)}% (${evaluation.length}); pesos: ${Buffer.byteLength(output)} bytes`);
console.log(`Exemplos: ${predictions.map(x=>x.toFixed(3)).join(', ')}`);
