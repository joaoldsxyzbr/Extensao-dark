#!/usr/bin/env node
'use strict';
// Avaliação separada da amostragem do treinamento; exemplos de papéis visuais rotulados manualmente.
// Não são capturas nem medições de sites reais. Esta avaliação NÃO comprova superioridade ao Dark Reader.
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const {probability, MODEL} = require('../content/neural.js');

const examples = [
  {role: 'painel cinza, texto preto', x:[.28,.015,1], label:1},
  {role: 'cartão cinza médio, texto escuro', x:[.33,.045,1],label:1},
  {role: 'painel cinza, texto quase preto',x:[.185,.005,1],label:1},
  {role: 'fundo branco, texto preto',x:[.95,.02,1],label:1},
  {role: 'fundo cinza, texto preto',x:[.23,.02,.9],label:1},
  {role: 'chat escuro, texto claro',x:[.028,.8,1],label:0},
  {role: 'painel cinza, texto claro',x:[.30,.85,1],label:0},
  {role: 'chip azul, texto branco',x:[.23,.86,1],label:0},
  {role: 'elemento transparente',x:[.35,.01,.1],label:0},
  {role: 'painel parcialmente opaco',x:[.23,.02,.81],label:0},
  {role: 'texto claro sobre preto',x:[.015,.96,1],label:0},
  {role: 'painel quase preto com texto branco',x:[.08,.8,.95],label:0},
];
let tp=0,tn=0,fp=0,fn=0;
for(const item of examples) {
  const predicted=probability(item.x)>=.8 ? 1 : 0;
  if(predicted===1 && item.label===1)tp++;
  else if(predicted===0 && item.label===0)tn++;
  else if(predicted===1) {fp++; console.error('Falso positivo:',item.role);}
  else {fn++; console.error('Falso negativo:',item.role);}
}
const precision=tp/(tp+fp||1);
const recall=tp/(tp+fn||1);
const accuracy=(tp+tn)/examples.length;
const started=performance.now();
for(let i=0;i<100000;i++) probability(examples[i%examples.length].x);
const elapsed=performance.now()-started;
console.log(JSON.stringify({kind:'synthetic-curated',examples:examples.length,accuracy,precision,recall,falsePositives:fp,falseNegatives:fn,modelWeights:MODEL.hidden*(MODEL.input+2)+1,benchmark100kMs:+elapsed.toFixed(1)},null,2));
assert.equal(fp,0,'exemplos de destaque/tema escuro não devem ser transformados');
assert.equal(fn,0,'exemplos claros relevantes não devem ser ignorados');
// Não impor teto de tempo variável entre máquinas; apenas reportar métrica.
