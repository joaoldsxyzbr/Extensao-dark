'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generate,verify,COUNT}=require('../scripts/generate-p8-hard-negatives.js');
test('P8.1: treinamento inclui transparências difíceis derivadas apenas de famílias de treino',()=>{
  const doc=generate();
  assert.equal(COUNT,378);
  assert.equal(doc.samples.length,COUNT);
  assert.equal(verify(doc).count,COUNT);
  assert.ok(doc.samples.every(row=>row.split==='train'&&row.y[0]===0 &&
    row.x[2]>0&&row.x[2]<1));
});
test('P8.1: rejeita amostra falsificada de holdout ou perda da transparência',()=>{
  const data=generate();
  const leak=structuredClone(data);
  leak.samples[0].group='translucent';
  assert.throws(()=>verify(leak),/Vazamento/);
  const opaque=structuredClone(data);
  opaque.samples[0].x[2]=1;
  assert.throws(()=>verify(opaque),/translúcida/);
  const changed=structuredClone(data);
  changed.samples[0].y[0]=1;
  assert.throws(()=>verify(changed),/Vetor/);
});
