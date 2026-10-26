'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {generate,validate}=require('../scripts/p11-generate-descendant-data.js');
const {KIND,loadCandidate,featuresFor,predictText}=require('../training/p11-descendant-runtime.js');
function candidate(bias){
  return {kind:KIND,formatVersion:1,featureCount:12,outputCount:3,
    model:{formatVersion:1,layers:[{inputSize:12,outputSize:3,activation:'sigmoid',
      weights:Array(36).fill(0),biases:[bias,bias,bias]}]}};
}
test('P11: corpus separa familias completas e nao reusa vetores de sites reais',()=>{
  const data=generate(),counts=validate(data);
  assert.deepEqual(counts,{total:2592,train:1440,validation:576,holdout:576});
  assert.equal(data.origin,'p11-synthetic-descendant-contrast-teacher-not-websites');
  const splits={};
  for(const s of data.samples)(splits[s.split]??=new Set()).add(s.family);
  assert.equal([...splits.train].some(x=>splits.holdout.has(x)),false);
  const fingerprint=new Set();
  for(const s of data.samples){
    assert.equal(s.x.length,12);
    assert.equal(s.y.length,3);
    assert.ok([...s.x,...s.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    const k=s.id;
    assert.equal(fingerprint.has(k),false);
    fingerprint.add(k);
  }
  assert.throws(()=>validate({...data,origin:'collected-user-browsing'}),/Contrato/);
  assert.throws(()=>validate({...data,samples:[...data.samples,data.samples[0]]}),/duplicada/);
});
test('P11: formato de 12 sinais inclui fundo/texto/contexto sem DOM e é validado',()=>{
  const x=featuresFor(colors,{background:'rgb(22, 28, 35)',
    text:'rgb(42, 64, 120)',sourceBackground:'rgb(252, 250, 248)',
    isLink:true,isLarge:false,explicitColor:true});
  assert.equal(x.length,12);
  assert.deepEqual(x.slice(9),[1,0,1]);
  assert.throws(()=>featuresFor(colors,{background:'rgba(22,28,35,.4)',
    text:'rgb(42,64,120)',sourceBackground:'rgb(255,255,255)'}),/incompleto/);
});
test('P11: inferencia neural aceita output legível e rejeita cor ilegível',()=>{
  const x=featuresFor(colors,{background:'rgb(20, 25, 30)',text:'rgb(35, 35, 35)',
    sourceBackground:'rgb(255, 255, 255)'});
  const bright=loadCandidate(core,candidate(4));
  assert.equal(predictText(core,bright,x,colors).action,'suggest');
  const dark=loadCandidate(core,candidate(-4));
  assert.deepEqual(predictText(core,dark,x,colors),
    {action:'reject',reason:'insufficient-neural-contrast'});
  assert.throws(()=>predictText(core,bright,x.slice(1),colors),/entradas/);
  assert.throws(()=>loadCandidate(core,{...candidate(4),featureCount:57}),/contrato/);
});
test('P11: pesos nao fazem parte do manifesto e a seguranca continua independente',()=>{
  const manifest=require('../manifest.json');
  assert.equal(manifest.content_scripts[0].js.some(p=>p.includes('p11')),false);
  assert.equal(manifest.permissions.includes('webRequest'),false);
});
