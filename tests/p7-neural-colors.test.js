'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../vendor/neural_core/neural-core.js');
const {decode}=require('../training/neural-color-runtime.js');
const {generate,verify}=require('../scripts/export-neural-color-features.js');

test('P7: modelo neural produz sete saídas a partir de 57 entradas CSS/RGB/tema',()=>{
  const corpus=generate();
  assert.equal(corpus.featureCount,57);
  assert.equal(corpus.outputCount,7);
  assert.equal(corpus.origin,'synthetic-design-tokens-not-real-websites');
  assert.equal(corpus.samples.length,1890);
  assert.equal(verify(corpus).groups,30);
  assert.deepEqual(corpus,generate(),'dados precisam ser reproduzíveis');
});
test('P7: holdout por família e CSS stress nunca alimentam o treino',()=>{
  const doc=generate(),split=new Map();
  for(const row of doc.samples){
    if(row.split==='stress')continue;
    assert.notEqual(row.profile,'css-stress-unseen');
    if(split.has(row.group))assert.equal(split.get(row.group),row.split);
    else split.set(row.group,row.split);
  }
  assert.deepEqual(new Set([...split.values()]),new Set(['train','validation','holdout']));
  const tampered=structuredClone(doc);
  tampered.samples[0].y[2]=NaN;
  assert.throws(()=>verify(tampered),/Vetor/);
  const leak=structuredClone(doc);
  leak.samples[0].split='holdout';
  assert.throws(()=>verify(leak),/misturada|Contagem/);
});
test('P7: apenas inferência da rede define ação e canais RGB',()=>{
  const model=core.loadModel({formatVersion:1,layers:[{inputSize:57,
    outputSize:7,activation:'sigmoid',weights:Array(57*7).fill(0),
    biases:[3,-2,-1,0,2,2,2]}]});
  const features=Array(57).fill(0);
  const result=decode(core,model,features);
  assert.equal(result.action,'convert');
  assert.match(result.background,/^rgb\(\d+, \d+, \d+\)$/);
  assert.match(result.color,/^rgb\(\d+, \d+, \d+\)$/);
  const preserve=core.loadModel({formatVersion:1,layers:[{inputSize:57,
    outputSize:7,activation:'sigmoid',weights:Array(57*7).fill(0),
    biases:[-4,2,2,2,2,2,2]}]});
  assert.deepEqual(decode(core,preserve,features).action,'preserve');
  assert.throws(()=>decode(core,preserve,[...features,0]),/incompatível/);
  assert.throws(()=>decode(core,preserve,Array(57).fill(Infinity)),/incompatível/);
});
test('P7: motor neural de cores é isolado, sem publicação ou injeção no navegador',()=>{
  const manifest=require('../manifest.json');
  assert.ok(!manifest.content_scripts[0].js.some(x=>x.includes('neural-color')));
  const source=fs.readFileSync(path.join(__dirname,'../training/neural-color-runtime.js'),'utf8');
  assert.doesNotMatch(source,/mapBackground|mapText|mapBorder|localStorage|fetch\s*\(/);
  assert.equal(require('../data/neural-model.json').layers[0].inputSize,7);
});
