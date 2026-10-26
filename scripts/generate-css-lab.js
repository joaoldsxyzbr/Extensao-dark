#!/usr/bin/env node
'use strict';
// P6 - Laboratório de aumento determinístico de CSS. NÃO contém páginas reais,
// NÃO é evidência independente de desempenho da extensão nem treina pesos.
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const {generate:generateP2}=require('./export-contextual-features.js');
const labels=require('../data/contextual-labels.json');

const STYLE_PROFILES=Object.freeze([
  'css-basic',
  'css-grid-geometry',
  'css-flex-interaction',
  'css-floating-overlay',
  'css-layered-shadow',
  'css-typography',
  'css-scroll-area',
  'css-stress-unseen'
]);
const EXPECTED=2520*STYLE_PROFILES.length;
const WIDTH={compact:24,regular:124,large:320};
// Hash FNV-1a pequeno e reproduzível. Variações de CSS, nunca dados de sites.
function hashFixture(id){
  let h=2166136261;
  for(const ch of id){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function cssFor(row,profile){
  const dim=WIDTH[row.size];
  const h=hashFixture(row.id+':'+profile);
  const width=dim+h%29, height=dim+((h>>>8)%29);
  const style={
    display:'block',position:'static',opacity:'1',
    fontSize:(14+((h>>>16)%23))+'px',
    fontWeight:'400',lineHeight:'normal',width:width+'px',height:height+'px',
    backgroundImage:row.group==='gradient'?'linear-gradient(#aaa,#333)':'none',
    colorScheme:'normal',overflowX:'visible',overflowY:'visible',
    borderTopLeftRadius:'0px',borderTopWidth:'0px',borderRightWidth:'0px',
    borderBottomWidth:'0px',borderLeftWidth:'0px',
    outlineWidth:'0px',boxShadow:'none',textShadow:'none',
    filter:'none',backdropFilter:'none',mixBlendMode:'normal',
    isolation:'auto',pointerEvents:'auto',cursor:'default',zIndex:'auto'
  };
  switch(profile){
    case 'css-basic':break;
    case 'css-grid-geometry':
      Object.assign(style,{display:'grid',borderTopLeftRadius:'12px',
        overflowX:'hidden',fontSize:'18px'});break;
    case 'css-flex-interaction':
      Object.assign(style,{display:'flex',fontWeight:'600',
        cursor:row.state==='hover'?'pointer':'default',
        opacity:row.state==='disabled'?'0.45':'1',lineHeight:'24px'});break;
    case 'css-floating-overlay':
      Object.assign(style,{position:'fixed',zIndex:'28',
        boxShadow:'0 6px 16px rgb(0 0 0 / .2)',
        borderTopWidth:'2px',outlineWidth:'1px'});break;
    case 'css-layered-shadow':
      Object.assign(style,{boxShadow:'0 2px 12px rgba(0,0,0,.3)',
        textShadow:'0 1px 2px rgba(0,0,0,.3)',
        backdropFilter:'blur(6px)',opacity:'.84',
        isolation:'isolate'});break;
    case 'css-typography':
      Object.assign(style,{fontSize:'26px',fontWeight:'700',
        lineHeight:'36px',outlineWidth:'2px',borderTopLeftRadius:'4px'});break;
    case 'css-scroll-area':
      Object.assign(style,{overflowX:'auto',overflowY:'hidden',
        pointerEvents:row.state==='disabled'?'none':'auto',
        cursor:'pointer',height:Math.max(44,height)+'px',
        width:Math.max(100,width)+'px'});break;
    case 'css-stress-unseen':
      Object.assign(style,{display:'inline-grid',position:'sticky',
        isolation:'isolate',mixBlendMode:'multiply',filter:'brightness(1.2)',
        backdropFilter:'blur(12px)',outlineWidth:'4px',zIndex:'90',
        colorScheme:'dark',borderTopLeftRadius:'72px',
        overflowY:'scroll',pointerEvents:'auto',
        fontWeight:'900',fontSize:'42px'});
      if(row.group==='gradient')style.backgroundImage='url("data:image/svg+xml;base64,PHN2Zy8+")';
      break;
    default:throw Error('Perfil CSS não autorizado: '+profile);
  }
  return style;
}
function verifyDataset(data){
  if(!data||data.formatVersion!==1||data.featureCount!==48||
    data.origin!=='deterministic-css-augmentations-not-real-websites'||
    !Array.isArray(data.samples)||data.samples.length!==EXPECTED)
    throw Error('Quantidade ou origem de amostras inválida');
  const ids=new Set(),groups=new Map(),vectors=new Map();
  const counts={train:0,validation:0,holdout:0,stress:0};
  for(const row of data.samples){
    if(typeof row.id!=='string'||ids.has(row.id))throw Error('ID duplicado/inválido');
    ids.add(row.id);
    if(!Object.hasOwn(counts,row.split))throw Error('Split inválido');
    if(!labels.families.some(f=>f.family===row.group&&
      (row.split==='stress'||f.split===row.split)))
      throw Error('Grupo fora do split original: '+row.id);
    if(row.split==='stress'){
      if(row.profile!=='css-stress-unseen')throw Error('Perfil de stress inválido');
    }else{
      if(row.profile==='css-stress-unseen')throw Error('Vazamento de perfil de stress');
      if(groups.has(row.group)&&groups.get(row.group)!==row.split)
        throw Error('Vazamento de família');
      groups.set(row.group,row.split);
    }
    if(!Array.isArray(row.x)||row.x.length!==48||row.x.some(v=>
      typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
      throw Error('Vetor de característica inválido: '+row.id);
    if(!Array.isArray(row.y)||row.y.length!==1||![0,1].includes(row.y[0]))
      throw Error('Rótulo inválido');
    const key=row.x.join(',');
    if(vectors.has(key)&&vectors.get(key)!==row.y[0])
      throw Error('Rótulos contraditórios de vetor idêntico: '+row.id);
    vectors.set(key,row.y[0]);counts[row.split]++;
  }
  if(groups.size!==30||counts.train!==10584||counts.validation!==3528||
     counts.holdout!==3528||counts.stress!==2520)
    throw Error('Quantidade por split/família inválida');
  if(JSON.stringify(counts)!==JSON.stringify(data.summary?.splits)||
     data.summary.groups!==30)throw Error('Resumo do corpus inválido');
  return {valid:true,counts,groups:groups.size,distinctVectors:vectors.size};
}
function generate(){
  const original=generateP2();
  const samples=[];
  const splits={train:0,validation:0,holdout:0,stress:0};
  for(const base of original.samples){
    for(const profile of STYLE_PROFILES){
      const css=cssFor(base,profile);
      const extra=colors.advancedStyleFeatures(css);
      if(extra.length!==30)throw Error('Contrato de características CSS alterado');
      const split=profile==='css-stress-unseen'?'stress':base.split;
      splits[split]++;
      samples.push({
        id:base.id+':'+profile,
        baseId:base.id,group:base.group,split,profile,
        policy:base.policy,palette:base.palette,state:base.state,size:base.size,
        x:base.x.concat(extra.map(v=>Number(v.toFixed(12)))),
        y:[...base.y]
      });
    }
  }
  const result={
    formatVersion:1,featureCount:colors.ADVANCED_FEATURE_COUNT,
    featureNames:[...colors.ADVANCED_FEATURE_NAMES],
    origin:'deterministic-css-augmentations-not-real-websites',
    note:'20.160 variações sintéticas de 2.520 exemplos-base; NÃO são 20.160 websites nem rótulos reais independentes. O perfil stress não integra o treinamento; separar sempre por família.',
    summary:{groups:30,profiles:8,splits},samples
  };
  verifyDataset(result);
  return result;
}
function main(){
  const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)
    ||path.join(__dirname,'../training/css-advanced-features.json'));
  const data=generate();
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(data)+'\n');
  console.log(JSON.stringify({path:output,samples:data.samples.length,
    profileCount:STYLE_PROFILES.length,featureCount:data.featureCount,
    ...verifyDataset(data)}));
}
if(require.main===module)main();
module.exports={STYLE_PROFILES,cssFor,verifyDataset,generate};
