#!/usr/bin/env node
'use strict';
// P8.1: contraexemplos de transparência SOMENTE de famílias do TREINO P2.
// Nenhuma linha de validação/holdout, website, usuário ou formulário é lida.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {makeRow,PALETTES}=require('./export-contextual-features.js');
const {rowFor,THEMES}=require('./export-neural-color-features.js');
const labels=require('../data/contextual-labels.json');
const FAMILIES=['card','alert'];
const SIZES=['compact','regular','large'];
const PROFILES=['css-basic','css-flex-interaction','css-layered-shadow'];
const COUNT=FAMILIES.length*PALETTES.length*SIZES.length*THEMES.length*PROFILES.length;

function generate(){
  const examples=[];
  for(const family of FAMILIES){
    const policy=labels.families.find(row=>row.family===family);
    assert.equal(policy?.split,'train','transparências só de famílias do treino');
    for(const palette of PALETTES)for(const size of SIZES){
      const base=makeRow(policy,palette,'hover',size);
      assert.deepEqual(base.y,[0],'transparência deve preservar');
      assert.equal(base.split,'train');
      assert.ok(base.x[2]>0&&base.x[2]<1,'fundo deve manter alfa translúcido');
      for(const theme of THEMES)for(const profile of PROFILES)
        examples.push(rowFor(base,theme,profile,'train'));
    }
  }
  return {formatVersion:1,origin:'training-only-translucency-augmentation-not-real-websites',
    featureCount:57,note:'Somente card/alert: hover translúcido. Rótulos sintéticos; não usa holdout ou dados reais.',
    samples:examples};
}
function verify(doc){
  if(!doc||doc.formatVersion!==1||
    doc.origin!=='training-only-translucency-augmentation-not-real-websites'||
    doc.featureCount!==57||!Array.isArray(doc.samples)||doc.samples.length!==COUNT)
    throw Error('Formato P8 hard-negative inválido');
  const ids=new Set();
  for(const r of doc.samples){
    if(!r||typeof r.id!=='string'||ids.has(r.id))throw Error('ID de amostra P8 duplicado');
    ids.add(r.id);
    const policy=labels.families.find(x=>x.family===r.group);
    if(!policy||policy.split!=='train'||!FAMILIES.includes(r.group)||
      r.split!=='train'||!PROFILES.includes(r.profile))
      throw Error('Vazamento: amostra P8 fora das famílias e perfis de treino');
    if(!Array.isArray(r.x)||r.x.length!==57||r.x.some(v=>
        typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||
       !Array.isArray(r.y)||r.y.length!==7||r.y.some(v=>
        typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||
       r.y[0]!==0)
      throw Error('Vetor/rótulo inválido');
    if(!(r.x[2]>0&&r.x[2]<1))throw Error('Amostra deve ser translúcida');
  }
  return {count:ids.size,families:FAMILIES};
}
function main(){
  const filename=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||
    path.join(__dirname,'../training/neural-color-p8-hard-negatives.json');
  const output=path.resolve(filename);
  const doc=generate();
  verify(doc);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(doc)+'\n');
  console.log(JSON.stringify({output,...verify(doc),origin:doc.origin}));
}
if(require.main===module)main();
module.exports=Object.freeze({generate,verify,COUNT});
