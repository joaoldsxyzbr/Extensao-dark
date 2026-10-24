#!/usr/bin/env node
'use strict';
// P4: microbenchmark de INFERÊNCIA pura, não de DOM nem de navegação.
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const core=require('../vendor/neural_core/neural-core.js');
const ROOT=path.resolve(__dirname,'..');
const inputArg=name=>process.argv.find(s=>s.startsWith('--'+name+'='))?.slice(name.length+3);
const INPUT=path.resolve(inputArg('candidate')||path.join(ROOT,'data/contextual-ci-candidate.json'));
const OUTPUT=path.resolve(inputArg('output')||path.join(ROOT,'data/p4-ci-benchmark.json'));
const median=arr=>{const x=[...arr].sort((a,b)=>a-b);return x[Math.floor(x.length/2)];};
const LIMITS=Object.freeze({maxCandidateUs:1000,maxRelativeRatio:12,maxModelBytes:50000});
function assessBudget(metrics,limits=LIMITS){
  if(!metrics||metrics.formatVersion!==1||
     !Number.isFinite(metrics.candidateMedianUs)||
     !Number.isFinite(metrics.baselineMedianUs)||
     !Number.isFinite(metrics.ratio)||
     !Number.isSafeInteger(metrics.candidateBytes)||
     metrics.candidateMedianUs<=0||metrics.baselineMedianUs<=0||
     metrics.ratio<=0||metrics.candidateBytes<=0)
    return {pass:false,reasons:['Medições ausentes ou inválidas']};
  const reasons=[];
  if(metrics.candidateMedianUs>limits.maxCandidateUs)
    reasons.push('Inferência candidata acima do orçamento absoluto');
  if(metrics.ratio>limits.maxRelativeRatio)
    reasons.push('Custo relativo superior ao limite');
  if(metrics.candidateBytes>limits.maxModelBytes)
    reasons.push('Modelo acima do limite de tamanho');
  if(metrics.inputs?.baseline!==7 || metrics.inputs?.candidate!==18)
    reasons.push('Dimensões não correspondem aos modelos avaliados');
  return {pass:reasons.length===0,reasons};
}
function benchmark(model,vectors,iterations=2500){
  const warm=500,rounds=5;
  let check=0;
  for(let i=0;i<warm;i++)check+=core.predict(model,vectors[i%vectors.length])[0];
  const times=[];
  for(let round=0;round<rounds;round++){
    const started=performance.now();
    for(let i=0;i<iterations;i++)check+=core.predict(model,vectors[(i+round)%vectors.length])[0];
    times.push((performance.now()-started)*1000/iterations);
  }
  if(!Number.isFinite(check))throw Error('Resultado não finito no benchmark');
  return median(times);
}
function main(){
  const baselineRaw=JSON.parse(fs.readFileSync(path.join(ROOT,'data/neural-model.json'),'utf8'));
  const candidateBuffer=fs.readFileSync(INPUT);
  const candidateRaw=JSON.parse(candidateBuffer);
  const baseline=core.loadModel(baselineRaw),candidate=core.loadModel(candidateRaw);
  if(baseline.inputSize!==7 || candidate.inputSize!==18 || candidate.outputSize!==1)
    throw Error('Dimensão neural inesperada no benchmark');
  const dataset=JSON.parse(fs.readFileSync(path.join(ROOT,'training/contextual-features.json'),'utf8'));
  const features=dataset.samples.filter(x=>x.split==='holdout').map(x=>x.x);
  if(features.length!==504||features.some(x=>x.length!==18))
    throw Error('Amostras de benchmark insuficientes ou alteradas');
  const baselineInputs=features.map(x=>x.slice(0,7));
  // Alterna ordenação: números são medição aproximada, não SLA de página.
  const c1=benchmark(candidate,features),b1=benchmark(baseline,baselineInputs);
  const b2=benchmark(baseline,baselineInputs),c2=benchmark(candidate,features);
  const report={formatVersion:1,kind:'offline-inference-only',
    iterations:2500,modelBytes:fs.statSync(INPUT).size,
    candidateBytes:candidateBuffer.byteLength,
    inputs:{baseline:7,candidate:18},
    baselineMedianUs:Number(median([b1,b2]).toFixed(4)),
    candidateMedianUs:Number(median([c1,c2]).toFixed(4))};
  report.ratio=Number((report.candidateMedianUs/report.baselineMedianUs).toFixed(4));
  report.budget=assessBudget(report);
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(!report.budget.pass)process.exitCode=1;
}
if(require.main===module)main();
module.exports={LIMITS,assessBudget,benchmark};
