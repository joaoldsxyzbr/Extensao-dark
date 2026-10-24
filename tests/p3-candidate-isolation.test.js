'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {candidateExtension}=require('../scripts/real-site-lab.js');
const repo=path.resolve(__dirname,'..');
test('P3: candidato de 18 entradas é montado só na cópia temporária sem alterar a extensão original',()=>{
  const original=fs.readFileSync(path.join(repo,'content/neural.js'),'utf8');
  const manifest=fs.readFileSync(path.join(repo,'manifest.json'),'utf8');
  const model={formatVersion:1,layers:[{inputSize:18,outputSize:1,activation:'sigmoid',
    weights:Array(18).fill(0),biases:[0]}]};
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'p3-audit-test-'));
  try{
    candidateExtension(model,temp);
    const copy=fs.readFileSync(path.join(temp,'content/neural.js'),'utf8');
    assert.match(copy,/"inputSize":18/);
    assert.notEqual(copy,original);
    assert.equal(fs.readFileSync(path.join(repo,'content/neural.js'),'utf8'),original);
    assert.equal(fs.readFileSync(path.join(temp,'manifest.json'),'utf8'),manifest);
    assert.equal(fs.existsSync(path.join(temp,'content/content.js')),true);
    assert.equal(fs.existsSync(path.join(temp,'vendor/neural_core/neural-core.js')),true);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('P3: rejeita modelos malformados e modelos anteriores no papel de candidato',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'p3-audit-bad-'));
  try{
    assert.throws(()=>candidateExtension(require('../data/neural-model.json'),temp),
      /18 entradas/);
    assert.throws(()=>candidateExtension({formatVersion:1,layers:[]},temp),
      /Quantidade de camadas|invalid|camadas/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
