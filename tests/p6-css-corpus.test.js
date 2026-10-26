'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {generate,STYLE_PROFILES,verifyDataset}=require('../scripts/generate-css-lab.js');
const old=require('../scripts/export-contextual-features.js');
const colors=require('../content/colors.js');
test('P6: mais de 20 mil amostras reproduzíveis e 48 atributos, sem dependências',()=>{
  const corpus=generate();
  assert.equal(corpus.featureCount,48);
  assert.equal(corpus.origin,'deterministic-css-augmentations-not-real-websites');
  assert.equal(corpus.samples.length,2520*8);
  assert.equal(STYLE_PROFILES.length,8);
  assert.equal(corpus.summary.groups,30);
  assert.equal(corpus.summary.splits.train,18*7*4*3*7);
  assert.equal(corpus.summary.splits.validation,6*7*4*3*7);
  assert.equal(corpus.summary.splits.holdout,6*7*4*3*7);
  assert.equal(corpus.summary.splits.stress,2520);
  assert.deepEqual(corpus,generate(),'ordem e métricas devem ser determinísticas');
});
test('P6: mantém famílias isoladas do treino e reserva stress de perfil CSS',()=>{
  const corpus=generate();
  const seen=new Set();
  const familySplits=new Map();
  for(const r of corpus.samples){
    assert.equal(r.x.length,48,r.id);
    assert.ok(r.x.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    assert.ok([0,1].includes(r.y[0]));
    assert.ok(!seen.has(r.id),'ID duplicado '+r.id);
    seen.add(r.id);
    if(r.split!=='stress'){
      if(familySplits.has(r.group))assert.equal(r.split,familySplits.get(r.group));
      else familySplits.set(r.group,r.split);
    }else assert.equal(r.profile,'css-stress-unseen');
  }
  assert.equal(familySplits.size,30);
  assert.equal(corpus.samples.filter(r=>r.split==='stress').length,2520);
});
test('P6: 18 características antigas reaproveitam o extrator atual',()=>{
  const base=new Map(old.generate().samples.map(s=>[s.id,s.x]));
  const corpus=generate();
  for(const row of corpus.samples){
    assert.deepEqual(row.x.slice(0,18),base.get(row.baseId),row.id);
  }
  assert.equal(verifyDataset(corpus).valid,true);
});
test('P6: auditoria rejeita vazamento, vetores quebrados e números alterados',()=>{
  const dataset=generate();
  const bad=structuredClone(dataset);
  bad.samples[0].x[20]=Infinity;
  assert.throws(()=>verifyDataset(bad),/característica|vetor|inválid/i);
  const duplicate=structuredClone(dataset);
  duplicate.samples[1].id=duplicate.samples[0].id;
  assert.throws(()=>verifyDataset(duplicate),/duplicad/i);
  const missing=structuredClone(dataset);
  missing.samples.pop();
  assert.throws(()=>verifyDataset(missing),/quantidade|amostras/i);
});
test('P6: nunca escreve no modelo de produção',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/generate-css-lab.js'),'utf8');
  assert.doesNotMatch(source,/writeFileSync\([^)]*neural-model\.json/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/neural-model.json'),'utf8')).layers[0].inputSize,7);
});
