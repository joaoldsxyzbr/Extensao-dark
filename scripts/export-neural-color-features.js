#!/usr/bin/env node
'use strict';
// P7: laboratório de alvos de paleta sintéticos. Nenhuma captura real ou dado privado.
const fs=require('node:fs');
const path=require('node:path');
const {generate:baseCorpus,PALETTES}=require('./export-contextual-features.js');
const {cssFor}=require('./generate-css-lab.js');
const colors=require('../content/colors.js');

const THEMES=Object.freeze(['soft','deep','amoled']);
const PROFILES=Object.freeze(['css-basic','css-flex-interaction','css-typography','css-layered-shadow']);
const FEATURE_NAMES=Object.freeze([...colors.ADVANCED_FEATURE_NAMES,
  'sourceBackgroundR','sourceBackgroundG','sourceBackgroundB',
  'sourceTextR','sourceTextG','sourceTextB','themeSoft','themeDeep','themeAmoled']);
const TARGET_NAMES=Object.freeze(['apply','backgroundR','backgroundG','backgroundB','textR','textG','textB']);
const TOKENS=Object.freeze({
  soft:{surface:[38,42,48],control:[49,55,64],selected:[35,65,96],text:[232,237,244]},
  deep:{surface:[22,25,30],control:[34,39,47],selected:[27,55,85],text:[238,241,247]},
  amoled:{surface:[2,3,5],control:[15,19,24],selected:[20,45,73],text:[249,250,253]}
});
const CONTROL_GROUPS=new Set(['button','input','checkbox','tab','textarea','radio','select','progress']);
const clampColor=values=>values.map(n=>n/255);
function sourceColors(row) {
  const palette=PALETTES.find(item=>item.id===row.palette);
  if(!palette)throw Error('Paleta não reconhecida');
  const parse=value=>{
    const rgb=colors.parseColor(value);
    if(!rgb)throw Error('Cor base inválida');
    return [rgb.r,rgb.g,rgb.b];
  };
  const bg=row.group==='badge'?parse('rgb(8,115,235)'):
    row.policy==='contrast'||row.group==='iframe'? [0,0,0]:
    row.group==='translucent'?[255,255,255]:parse(palette.bg);
  return {bg,fg:parse(palette.fg)};
}
function target(row,theme,source) {
  if(row.y[0]===0)return [0,...clampColor(source.bg),...clampColor(source.fg)];
  const tokens=TOKENS[theme];
  const bg=row.state==='selected'?tokens.selected:
    CONTROL_GROUPS.has(row.group)?tokens.control:tokens.surface;
  return [1,...clampColor(bg),...clampColor(tokens.text)];
}
function profileFor(row){
  // Perfis aleatórios NÃO: a família entra somente no ID, sem leitura de sites.
  const hash=[...row.id].reduce((value,ch)=>(Math.imul(value,33)+ch.charCodeAt(0))>>>0,5381);
  return PROFILES[hash%3];
}
function rowFor(row,theme,profile,split=row.split) {
  const css=colors.advancedStyleFeatures(cssFor(row,profile));
  const source=sourceColors(row);
  const x=[...row.x,...css,...clampColor(source.bg),...clampColor(source.fg),
    ...THEMES.map(name=>Number(theme===name))];
  return {id:row.id+':'+profile+':'+theme,group:row.group,split,theme,profile,
    x,y:target(row,theme,source)};
}
function generate(){
  const rows=baseCorpus().samples.filter(row=>row.size==='regular' &&
    ['rest','selected'].includes(row.state));
  const samples=[];
  for(const row of rows)for(const theme of THEMES){
    samples.push(rowFor(row,theme,profileFor(row)));
    if(row.state==='rest')samples.push(rowFor(row,theme,'css-stress-unseen','stress'));
  }
  const corpus={
    formatVersion:1,origin:'synthetic-design-tokens-not-real-websites',
    featureCount:FEATURE_NAMES.length,outputCount:TARGET_NAMES.length,
    featureNames:FEATURE_NAMES,targetNames:TARGET_NAMES,
    note:'Rótulos de cores gerados de 3 paletas editoriais; NÃO são anotação humana por componente, nem prova de generalização real.',
    samples
  };
  verify(corpus);
  return corpus;
}
function verify(doc){
  if(!doc||doc.formatVersion!==1||doc.origin!=='synthetic-design-tokens-not-real-websites'||
    doc.featureCount!==57||doc.outputCount!==7||
    JSON.stringify(doc.featureNames)!==JSON.stringify(FEATURE_NAMES)||
    JSON.stringify(doc.targetNames)!==JSON.stringify(TARGET_NAMES)||
    !Array.isArray(doc.samples)||doc.samples.length!==1890)
    throw Error('Contrato P7 inválido');
  const counts={train:0,validation:0,holdout:0,stress:0},ids=new Set(),groups=new Map();
  for(const row of doc.samples){
    if(!row||typeof row.id!=='string'||ids.has(row.id))throw Error('ID P7 duplicado');
    ids.add(row.id);
    if(!Object.hasOwn(counts,row.split))throw Error('Split P7 inválido');
    if(!THEMES.includes(row.theme))throw Error('Tema inválido');
    if(row.split==='stress'){
      if(row.profile!=='css-stress-unseen')throw Error('Stress vazou');
    }else{
      if(row.profile==='css-stress-unseen')throw Error('Treino contaminado pelo stress');
      if(groups.has(row.group)&&groups.get(row.group)!==row.split)
        throw Error('Família misturada entre treino/avaliação');
      groups.set(row.group,row.split);
    }
    for(const [name,v,size] of [['x',row.x,57],['y',row.y,7]])if(
      !Array.isArray(v)||v.length!==size||v.some(n=>
        typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))
      throw Error('Vetor P7 inválido: '+name);
    if(![0,1].includes(row.y[0]))throw Error('Rótulo de aplicação inválido');
    const suffix=row.x.slice(-3);
    if(suffix.filter(v=>v===1).length!==1 || suffix.reduce((a,b)=>a+b,0)!==1)
      throw Error('Tema não codificado como one-hot');
    counts[row.split]++;
  }
  if(groups.size!==30||counts.train!==756||counts.validation!==252||
    counts.holdout!==252||counts.stress!==630)throw Error('Contagem P7 inválida');
  return {counts,groups:groups.size,samples:doc.samples.length};
}
function main(){
  const output=path.resolve(process.argv.find(x=>x.startsWith('--output='))?.slice(9)||
    path.join(__dirname,'../training/neural-color-features.json'));
  const corpus=generate();
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(corpus)+'\n');
  console.log(JSON.stringify({output,...verify(corpus),origin:corpus.origin}));
}
if(require.main===module)main();
module.exports=Object.freeze({generate,verify,rowFor,sourceColors,target,FEATURE_NAMES,TARGET_NAMES,THEMES});
