#!/usr/bin/env node
'use strict';
// P2: gera exemplos sintéticos SUPERVISIONADOS a partir de 30 políticas explícitas.
// Não carrega páginas reais nem modifica o modelo implantado.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const catalog=require('../tests/visual-corpus/catalog.js');
const labels=require('../data/contextual-labels.json');
const PALETTES=Object.freeze([
  {id:'white',type:'light',bg:'rgb(250,250,250)',fg:'rgb(18,20,24)',parent:'rgb(246,246,246)'},
  {id:'offwhite',type:'light',bg:'rgb(232,235,240)',fg:'rgb(25,27,30)',parent:'rgb(246,246,246)'},
  {id:'gray',type:'light',bg:'rgb(159,161,163)',fg:'rgb(20,22,25)',parent:'rgb(28,29,33)'},
  {id:'dark',type:'native-dark',bg:'rgb(20,22,27)',fg:'rgb(235,235,235)',parent:'rgb(21,22,26)'},
  {id:'dark-soft',type:'native-dark',bg:'rgb(39,41,45)',fg:'rgb(230,230,230)',parent:'rgb(18,18,20)'},
  {id:'contrast',type:'high-contrast',bg:'rgb(0,0,0)',fg:'rgb(255,255,255)',parent:'rgb(0,0,0)'},
  {id:'accent',type:'accent',bg:'rgb(8,115,235)',fg:'rgb(255,255,255)',parent:'rgb(22,23,25)'}
]);
const STATES=Object.freeze(['rest','selected','disabled','hover']);
const SIZES=Object.freeze(['compact','regular','large']);
const FAMILIES=new Set(catalog.FAMILIES.map(f=>f.id));
const GRAPHIC_TAGS={ 'svg-icon':'SVG','image':'IMG','canvas':'CANVAS','video':'VIDEO','iframe':'IFRAME'};
const CONTROL_TAGS={button:'BUTTON',input:'INPUT',textarea:'TEXTAREA',checkbox:'INPUT',radio:'INPUT',tab:'BUTTON',select:'SELECT',progress:'PROGRESS'};
const TEXT_TAGS={paragraph:'P','muted-text':'SMALL',link:'A'};
const tagFor=id=>GRAPHIC_TAGS[id]||CONTROL_TAGS[id]||TEXT_TAGS[id]||'DIV';
const rgb=colors.parseColor;
function validatePolicies(policies=labels.families){
  if(labels.formatVersion!==2 || !Array.isArray(policies))throw Error('Contrato de políticas P2 inválido');
  const ids=new Set(),counts={train:0,validation:0,holdout:0},perSplit={train:new Set(),validation:new Set(),holdout:new Set()};
  for(const p of policies){
    if(!p || !FAMILIES.has(p.family) || ids.has(p.family))throw Error('Família ausente/duplicada: '+p?.family);
    if(!['convert','preserve','contrast'].includes(p.policy))throw Error('Política desconhecida: '+p.family);
    if(!Object.hasOwn(counts,p.split))throw Error('Split desconhecido: '+p.family);
    ids.add(p.family);counts[p.split]++;perSplit[p.split].add(p.family);
  }
  if(ids.size!==FAMILIES.size || counts.train<15 || counts.validation<5 || counts.holdout<5)
    throw Error('Separação por famílias insuficiente');
  for(const a of Object.keys(perSplit))for(const b of Object.keys(perSplit))
    if(a!==b && [...perSplit[a]].some(id=>perSplit[b].has(id)))throw Error('Vazamento entre splits');
  return counts;
}
function makeRow(p,palette,state,size){
  const attrs={};
  if(state==='selected')attrs['aria-selected']='true';
  if(state==='disabled')attrs['aria-disabled']='true';
  if(p.family==='tab')attrs.role='tab';
  if(['svg-icon','masked-icon','pseudo-icon','image','canvas','video'].includes(p.family))attrs.role='img';
  if(p.family==='pseudo-icon')attrs.class='nav-icon';
  if(p.family==='masked-icon')attrs.class='masked-icon';
  if(p.family==='badge')attrs.class='notification-badge';
  if(p.family==='progress')attrs.role='progressbar';
  const tag=tagFor(p.family);
  const dim={compact:24,regular:124,large:320}[size];
  const element={
    tagName:tag,getAttribute:key=>attrs[key]??null,
    hasAttribute:key=>Object.hasOwn(attrs,key),
    querySelector:selector=>p.family==='shadow-dom'&&selector.includes('svg')?null:null
  };
  const style={
    backgroundColor:palette.bg,color:palette.fg,width:dim+'px',height:dim+'px',
    backgroundImage:'none',maskImage:'none',webkitMaskImage:'none',
    clipPath:'none',webkitClipPath:'none'
  };
  if(p.policy==='contrast')style.backgroundColor='rgba(0,0,0,0)';
  if(p.family==='translucent')style.backgroundColor=palette.type==='light'?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.45)';
  if(p.family==='iframe')style.backgroundColor='rgba(0,0,0,0)';
  if(p.family==='badge')style.backgroundColor='rgb(8,115,235)';
  if(p.family==='masked-icon')style.maskImage='linear-gradient(#000,#000)';
  if(p.family==='gradient')style.backgroundImage='linear-gradient(#aaa,#333)';
  const context=colors.visualContext(element,style,
    p.family==='pseudo-icon'?()=>[{content:'""',maskImage:'url(icon.svg)'}]:undefined);
  const background=rgb(style.backgroundColor),foreground=rgb(style.color);
  const x=colors.contextFeatures(background,foreground,rgb(palette.parent),context);
  if(!x || x.length!==colors.CONTEXT_FEATURE_COUNT || !x.every(Number.isFinite))
    throw Error('Falha no vetor contextual: '+p.family);
  const label=Number(p.policy==='convert'&&palette.type==='light');
  // Um gráfico nunca pode se tornar uma superfície por engano na curadoria.
  if(p.policy==='preserve' && label!==0)throw Error('Gráfico rotulado para recolorir');
  return {id:[p.family,palette.id,state,size].join(':'),group:p.family,split:p.split,
    policy:p.policy,palette:palette.id,state,size,action:context.action,
    x:x.map(n=>Number(n.toFixed(12))),y:[label]};
}
function generate(policies=labels.families){
  validatePolicies(policies);
  const samples=[];
  const ids=new Set(),vectors=new Map();
  for(const policy of policies)for(const palette of PALETTES)
    for(const state of STATES)for(const size of SIZES) {
      const row=makeRow(policy,palette,state,size);
      if(ids.has(row.id))throw Error('ID duplicado: '+row.id);
      ids.add(row.id);
      const key=row.x.join(',');
      if(vectors.has(key)&&vectors.get(key)!==row.y[0])
        throw Error('Rótulos contraditórios em vetores idênticos: '+row.id);
      vectors.set(key,row.y[0]);
      samples.push(row);
    }
  return {formatVersion:2,featureCount:18,origin:'curated-synthetic-policy',
    note:'Variações geradas de famílias, NÃO observações reais independentes; split por família.',
    samples};
}
function main(){
  const data=generate();
  const output=path.resolve(__dirname,'../training/contextual-features.json');
  fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');
  const sizes=Object.fromEntries(['train','validation','holdout'].map(split=>[
    split,data.samples.filter(row=>row.split===split).length]));
  console.log(JSON.stringify({total:data.samples.length,splits:sizes,families:FAMILIES.size,featureCount:18}));
}
if(require.main===module) main();
module.exports={PALETTES,STATES,SIZES,validatePolicies,makeRow,generate};
