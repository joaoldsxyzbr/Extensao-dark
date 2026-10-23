'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const neural=require('../content/neural.js');
const dataset=require('../data/neural-cases.json');

test('modelo recebe sete entradas de contexto (não só luminância/opacidade)',()=>{
  assert.equal(neural.MODEL.input,7);
  const x=colors.neuralFeatures(colors.parseColor('rgb(180,180,180)'),colors.parseColor('rgb(15,15,15)'),colors.parseColor('rgb(25,25,25)'),{control:true,selected:true});
  assert.equal(x.length,7);
  assert.equal(x[5],1);
  assert.equal(x[6],1);
});

test('modelo evita apagar estado selecionado e preserva cartões não selecionados',()=>{
  const bg=colors.parseColor('rgb(190,190,192)'),fg=colors.parseColor('rgb(22,22,22)'),parent=colors.parseColor('rgb(235,235,235)');
  const plain=neural.probability(colors.neuralFeatures(bg,fg,parent,{control:true,selected:false}));
  const selected=neural.probability(colors.neuralFeatures(bg,fg,parent,{control:true,selected:true}));
  assert.ok(plain>.8,`controle claro normal precisa adaptar (${plain})`);
  assert.ok(selected<.8,`controle selecionado precisa ser preservado (${selected})`);
});

test('amostras holdout são independentes das amostras de treino',()=>{
  const ids=new Set(), train=new Set(), validation=new Set(), holdout=new Set();
  const splits={train,validation,holdout};
  for(const row of dataset.cases){assert.ok(!ids.has(row.id),row.id);ids.add(row.id);assert.ok(splits[row.split],row.id);splits[row.split].add(row.id);}
  assert.ok(train.size>=50 && validation.size>=15 && holdout.size>=25);
  assert.ok([...validation,...holdout].every(id=>!train.has(id)));
  assert.ok([...holdout].every(id=>!validation.has(id)));
});
