#!/usr/bin/env node
'use strict';
// P9: avaliação manual de CSS, independente dos geradores P7/P8.
// NÃO é validação em sites reais e NÃO autoriza promoção de pesos.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {decode:decodeP7}=require('../training/neural-color-runtime.js');
const {loadCandidate,predictColors}=require('../training/neural-color-p8-runtime.js');
const ROOT=path.resolve(__dirname,'..');
const SOURCE=path.join(ROOT,'tests/p9/manual-css-evaluation.json');
const THEMES=['soft','deep','amoled'];
const ORIGIN='hand-authored-independent-css-fixtures-not-real-sites';
const RGB=['background','text','parent'];

function compileCase(sample){
  if(!sample||!THEMES.includes(sample.theme))throw new TypeError('P9: tema inválido');
  if(typeof sample.tag!=='string'||!/^[A-Z]+$/.test(sample.tag))throw new TypeError('P9: tag inválida');
  if(!sample.style||typeof sample.style!=='object'||Array.isArray(sample.style))
    throw new TypeError('P9: estilo ausente');
  const parsed=RGB.map(name=>{
    const color=colors.parseColor(sample[name]);
    if(!color)throw new TypeError('P9: cor inválida: '+name);
    return color;
  });
  const [bg,fg,parent]=parsed;
  const attrs=sample.attrs||{};
  if(!attrs||typeof attrs!=='object'||Array.isArray(attrs)||
     Object.values(attrs).some(value=>typeof value!=='string'))
    throw new TypeError('P9: atributos inválidos');
  const style={backgroundColor:sample.background,color:sample.text,
    width:'220px',height:'100px',backgroundImage:'none',maskImage:'none',
    webkitMaskImage:'none',clipPath:'none',webkitClipPath:'none',
    display:'block',position:'static',opacity:'1',...sample.style};
  const element={
    tagName:sample.tag,
    getAttribute:key=>attrs[key]??null,
    hasAttribute:key=>Object.hasOwn(attrs,key),
    querySelector:()=>null
  };
  const visual=colors.visualContext(element,style);
  const context=colors.advancedContextFeatures(bg,fg,parent,visual,style);
  const rgb=[bg.r,bg.g,bg.b,fg.r,fg.g,fg.b].map(value=>value/255);
  const x=context.concat(rgb,THEMES.map(theme=>Number(sample.theme===theme)));
  if(x.length!==57||x.some(value=>!Number.isFinite(value)||value<0||value>1))
    throw new TypeError('P9: 57 características inválidas');
  return x;
}
function validateManualCorpus(doc){
  if(!doc||doc.formatVersion!==1||doc.origin!==ORIGIN||doc.modelInputs!==57||
      !Array.isArray(doc.samples)||doc.samples.length<12)
    throw new TypeError('P9: contrato/origem do corpus inválido');
  const ids=new Set(),counts={positives:0,negatives:0},themes=new Set();
  for(const sample of doc.samples){
    if(typeof sample.id!=='string'||!/^[a-z0-9-]+$/.test(sample.id)||ids.has(sample.id))
      throw new TypeError('P9: ID duplicado/inválido');
    ids.add(sample.id);
    if(!['convert','preserve'].includes(sample.expected))throw new TypeError('P9: rótulo inválido');
    if(typeof sample.group!=='string'||!sample.group)throw new TypeError('P9: grupo inválido');
    if(Object.hasOwn(sample,'x')||Object.hasOwn(sample,'y'))
      throw new TypeError('P9: rótulo não pode ser vetor de treinamento');
    compileCase(sample);
    themes.add(sample.theme);
    counts[sample.expected==='convert'?'positives':'negatives']++;
  }
  if(counts.positives<4||counts.negatives<4||themes.size!==3)
    throw new TypeError('P9: cobertura manual insuficiente');
  return {total:ids.size,...counts};
}
function readOnlyOutput(destination){
  const target=path.resolve(destination);
  if([path.join(ROOT,'data/neural-model.json'),path.join(ROOT,'data/neural-model-previous.json'),
    path.join(ROOT,'manifest.json'),path.join(ROOT,'content/neural.js'),
    SOURCE].includes(target)||path.extname(target)!=='.json')
    throw new TypeError('P9: arquivo protegido/inválido para relatório');
  return target;
}
function assess(opinions){
  const scores={};
  for(const model of ['p7','p8']){
    const tally={total:0,truePositive:0,trueNegative:0,falsePositives:0,falseNegatives:0,
      lowContrast:0,invalidColors:0};
    for(const record of opinions){
      const out=record[model],expected=record.expected==='convert';
      if(!out||!['convert','preserve'].includes(out.action))
        throw new TypeError('P9: resultado inválido');
      if(expected&&out.action==='convert')tally.truePositive++;
      else if(!expected&&out.action==='preserve')tally.trueNegative++;
      else if(expected)tally.falseNegatives++;
      else tally.falsePositives++;
      if(out.action==='convert'){
        const bg=colors.parseColor(out.background),fg=colors.parseColor(out.color);
        if(!bg||!fg){tally.invalidColors++;continue;}
        if(colors.contrastRatio(bg,fg)<4.5)tally.lowContrast++;
      }
      tally.total++;
    }
    scores[model]=tally;
  }
  return {kind:'p9-manual-css-diagnostic-not-real-sites',promotionEligible:false,
    readyForRelease:false,
    reason:'Rótulos manuais sem validação cega de sites reais nem revisão humana',
    ...scores};
}
function audit(options={}){
  const doc=JSON.parse(fs.readFileSync(SOURCE,'utf8'));
  const coverage=validateManualCorpus(doc);
  const training=JSON.parse(fs.readFileSync(path.join(ROOT,'training/neural-color-features.json'),'utf8'));
  assert.equal(training.origin,'synthetic-design-tokens-not-real-websites');
  const trainVectors=new Set(training.samples.filter(row=>row.split==='train').map(row=>row.x.join(',')));
  const p7=core.loadModel(JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-ci-candidate.json'),'utf8')));
  const p8=loadCandidate(core,JSON.parse(fs.readFileSync(
    path.join(ROOT,'data/neural-color-p8-ci-candidate.json'),'utf8')));
  const rows=doc.samples.map(sample=>{
    const x=compileCase(sample);
    if(trainVectors.has(x.join(',')))throw new Error('P9: vetor manual coincide com treino: '+sample.id);
    const a=decodeP7(core,p7,x),b=predictColors(core,p8,x);
    return {id:sample.id,group:sample.group,theme:sample.theme,expected:sample.expected,
      p7:a,p8:b};
  });
  const result={...assess(rows),origin:doc.origin,coverage,
    trainingVectorOverlap:0,
    note:'As 22 amostras CSS são elaboradas manualmente, sem screenshots nem anotadores externos. A comparação é diagnóstica, não um holdout de websites.',
    cases:rows.map(row=>({...row,p7:{...row.p7},p8:{...row.p8}}))};
  const output=readOnlyOutput(options.output||path.join(ROOT,'data/p9-manual-qa-ci.json'));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,coverage,result:{p7:result.p7,p8:result.p8},
    promotionEligible:result.promotionEligible}));
  return result;
}
if(require.main===module){
  try{audit({output:process.argv.find(x=>x.startsWith('--output='))?.slice('--output='.length)});}
  catch(error){console.error('P9: avaliação falhou:',error.stack||error);process.exitCode=1;}
}
module.exports={compileCase,validateManualCorpus,readOnlyOutput,assess,audit};
