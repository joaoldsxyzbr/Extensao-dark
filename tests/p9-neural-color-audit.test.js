'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateManualCorpus,compileCase,assess,readOnlyOutput}=require('../scripts/evaluate-neural-colors-p9.js');
const fixture=require('./p9/manual-css-evaluation.json');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const experimental=require('../training/neural-color-p8-runtime.js');

test('P9: avaliações autorais independem dos geradores do treinamento e preservam etiquetas',()=>{
  const result=validateManualCorpus(fixture);
  assert.equal(result.total,22);
  assert.equal(result.positives,8);
  assert.equal(result.negatives,14);
  assert.ok(!fixture.samples.some(s=>Object.hasOwn(s,'x')||Object.hasOwn(s,'y')),'proibido inserir vetores gerados');
  const paths=['scripts/evaluate-neural-colors-p9.js','tests/p9/manual-css-evaluation.json'];
  for(const p of paths)assert.ok(fs.existsSync(path.join(__dirname,'..',p)));
  const x=compileCase(fixture.samples[0]);
  assert.equal(x.length,57);
  assert.ok(x.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.equal(x.at(-3),1);
});

test('P9: rejeita duplicatas, entradas inválidas e rótulos ausentes',()=>{
  assert.throws(()=>validateManualCorpus({...fixture,samples:[...fixture.samples,fixture.samples[0]]}),/duplicad/);
  assert.throws(()=>compileCase({...fixture.samples[0],theme:'desconhecido'}),/tema|theme/i);
  assert.throws(()=>compileCase({...fixture.samples[0],background:'javascript:invalid'}),/cor/i);
  assert.throws(()=>validateManualCorpus({...fixture,origin:'training-data'}),/origem|contrato/i);
  assert.throws(()=>compileCase({...fixture.samples[0],style:{...fixture.samples[0].style,
    backgroundColor:'rgb(0, 0, 0)'}}),/sobrescrita/);
});

test('P9: avaliação conta falsos positivos e negativos e bloqueia promoção',()=>{
  const samples=[fixture.samples[0],fixture.samples[8],fixture.samples[1]];
  const opinions=samples.map(s=>({id:s.id,expected:s.expected,
    p7:{action:s.expected==='convert'?'preserve':'convert',confidence:0.7,background:'rgb(0, 0, 0)',color:'rgb(20, 20, 20)'},
    p8:{action:s.expected,confidence:0.75,
      background:'rgb(18, 19, 24)',color:'rgb(242, 244, 248)'}}));
  const report=assess(opinions);
  assert.equal(report.promotionEligible,false);
  assert.equal(report.p7.falseNegatives+report.p7.falsePositives,samples.length);
  assert.equal(report.p8.falseNegatives+report.p8.falsePositives,0);
  assert.ok(report.p7.lowContrast>=1);
});

test('P9: saídas do relatório não podem substituir arquivos distribuídos',()=>{
  const root=path.resolve(__dirname,'..');
  assert.throws(()=>readOnlyOutput(path.join(root,'data/neural-model.json')),/protegido/);
  assert.throws(()=>readOnlyOutput(path.join(root,'manifest.json')),/protegido/);
  assert.throws(()=>readOnlyOutput(path.join(root,'content/neural.js')),/protegido/);
  assert.throws(()=>readOnlyOutput(path.join(root,'training/neural-color-features.json')),/protegido/);
  assert.equal(typeof core.loadModel,'function');
  assert.equal(typeof experimental.predictColors,'function');
});
