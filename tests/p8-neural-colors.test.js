'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../vendor/neural_core/neural-core.js');
const {loadCandidate,predictColors,KIND}=require('../training/neural-color-p8-runtime.js');
const model=(outputs,biases)=>({formatVersion:1,layers:[{
  inputSize:57,outputSize:outputs,activation:'sigmoid',
  weights:Array(57*outputs).fill(0),biases
}]});
const candidate=(score=2,threshold=0.65)=>({formatVersion:1,kind:KIND,featureCount:57,
  threshold,heads:{apply:model(1,[score]),rgb:model(6,[-1,-1,-1,2,2,2])}});
const input=Array(57).fill(0);

test('P8: duas redes neurais distintas assumem decisão e geração de cores',()=>{
  const loaded=loadCandidate(core,candidate());
  const result=predictColors(core,loaded,input);
  assert.equal(result.action,'convert');
  assert.match(result.background,/^rgb\(\d+, \d+, \d+\)$/);
  assert.match(result.color,/^rgb\(\d+, \d+, \d+\)$/);
  assert.equal(loaded.apply.outputSize,1);
  assert.equal(loaded.rgb.outputSize,6);
});
test('P8: decisão sem confiança preserva o elemento e não consulta rede RGB',()=>{
  const loaded=loadCandidate(core,candidate(-2));
  const proxy={predict(model,x){
    assert.equal(model.outputSize,1,'RGB não pode executar no elemento preservado');
    return core.predict(model,x);
  }};
  assert.deepEqual(predictColors(proxy,loaded,input).action,'preserve');
  assert.throws(()=>predictColors(core,loaded,[...input,0]),/entrada/);
  assert.throws(()=>predictColors(core,loaded,Array(57).fill(NaN)),/entrada/);
});
test('P8: contrato rejeita dimensões, limiar e modelos adulterados',()=>{
  assert.throws(()=>loadCandidate(core,{...candidate(),threshold:NaN}),/Contrato/);
  assert.throws(()=>loadCandidate(core,{...candidate(),threshold:1.1}),/Contrato/);
  const corrupted=candidate();
  corrupted.heads.rgb=model(5,[0,0,0,0,0]);
  assert.throws(()=>loadCandidate(core,corrupted),/Dimensões/);
  const legacy=require('../data/neural-model.json');
  assert.throws(()=>loadCandidate(core,legacy),/Contrato/);
});
test('P8: treinamento não está instalado no manifesto nem usa regras CSS para cores',()=>{
  const manifest=require('../manifest.json');
  assert.equal(manifest.content_scripts[0].js.some(p=>p.includes('neural-color')),false);
  const src=fs.readFileSync(require.resolve('../training/neural-color-p8-runtime.js'),'utf8');
  assert.doesNotMatch(src,/mapText|mapBackground|mapBorder|ensureContrast|fetch\s*\(/);
});
