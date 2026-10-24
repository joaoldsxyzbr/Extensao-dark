'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {generate,validatePolicies,PALETTES,STATES,SIZES}=require('../scripts/export-contextual-features.js');
const labels=require('../data/contextual-labels.json');
const colors=require('../content/colors.js');

test('P2: 2520 cenários sintetizados com política manual, split por família e 18 características',()=>{
  const data=generate();
  assert.equal(data.origin,'curated-synthetic-policy');
  assert.equal(data.samples.length,30*7*4*3);
  assert.equal(data.featureCount,18);
  assert.equal(PALETTES.length,7);
  assert.equal(STATES.length,4);
  assert.equal(SIZES.length,3);
  const counts={train:0,validation:0,holdout:0}, groups=new Map(),ids=new Set();
  for(const row of data.samples){
    counts[row.split]++;
    assert.equal(row.x.length,colors.CONTEXT_FEATURE_COUNT);
    assert.ok(row.x.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
    assert.ok([0,1].includes(row.y[0]));
    assert.ok(!ids.has(row.id));ids.add(row.id);
    if(groups.has(row.group))assert.equal(groups.get(row.group),row.split,'vazamento de família');
    else groups.set(row.group,row.split);
    if(row.policy!=='convert')assert.equal(row.y[0],0);
    if(row.y[0]===1)assert.equal(row.action,'convert');
  }
  assert.deepEqual(counts,{train:1512,validation:504,holdout:504});
  assert.equal(groups.size,30);
  assert.deepEqual(data,generate(),'geração deve ser determinística');
});
test('P2: rejeita duplicações, splits inconsistentes, políticas desconhecidas',()=>{
  const rows=labels.families;
  assert.deepEqual(validatePolicies(),{train:18,validation:6,holdout:6});
  assert.throws(()=>validatePolicies([...rows,rows[0]]),/duplicada/);
  assert.throws(()=>validatePolicies(rows.slice(1)),/insuficiente/);
  assert.throws(()=>validatePolicies(rows.map((x,i)=>i===0?{...x,policy:'inventado'}:x)),/desconhecida/);
  assert.throws(()=>validatePolicies(rows.map((x,i)=>i===0?{...x,split:'reconhecido'}:x)),/Split desconhecido/);
});
test('P2: protege todas as máscaras, gráficos e textos sem superfícies',()=>{
  const data=generate();
  for(const row of data.samples.filter(x=>x.policy!=='convert')){
    assert.equal(row.y[0],0,row.id);
  }
  for(const family of ['masked-icon','svg-icon','pseudo-icon','image','canvas','video']){
    assert.equal(data.samples.filter(x=>x.group===family).length,84);
    assert.ok(data.samples.filter(x=>x.group===family).every(x=>x.y[0]===0));
  }
});
test('P2: treinamentos candidatos não substituem pesos do modelo distribuído',()=>{
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/neural-model.json'),'utf8'));
  assert.equal(source.layers[0].inputSize,7);
  assert.equal(source.layers[0].outputSize,12);
  const generated=path.resolve(__dirname,'../training/contextual-features.json');
  if(fs.existsSync(generated)){
    const rows=JSON.parse(fs.readFileSync(generated,'utf8'));
    assert.deepEqual(rows,generate(),'vetores do CI precisam refletir o extrator local');
  }
});

test('P2: treinamento vê sobreposições translúcidas sem acessar família do holdout',()=>{
  const data=generate();
  const train=data.samples.filter(r=>r.split==='train'&&r.x[14]===1);
  assert.ok(train.length>=24);
  assert.ok(train.every(r=>r.group!=='translucent'&&r.y[0]===0));
  assert.ok(data.samples.filter(r=>r.group==='translucent')
    .every(r=>r.split==='holdout'&&r.y[0]===0));
});

test('P2: dados legados adicionados apenas do split treino',()=>{
  const source=require('../data/neural-cases.json').cases;
  const train=new Set(source.filter(r=>r.split==='train').map(r=>'legacy:'+r.id));
  const reserved=new Set(source.filter(r=>r.split!=='train').map(r=>'legacy:'+r.id));
  const data=generate();
  assert.equal(data.legacyTrain.length,82);
  for(const row of data.legacyTrain){
    assert.ok(train.has(row.id));
    assert.ok(!reserved.has(row.id));
    assert.equal(row.source,'legacy-train-only');
    assert.equal(row.split,'train');
    assert.equal(row.x.length,18);
  }
  assert.equal(data.samples.length,2520);
});
