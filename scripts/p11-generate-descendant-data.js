#!/usr/bin/env node
'use strict';
// P11: alvos sintéticos de pares superfície/texto, nunca oriundos de páginas reais.
// A regra de contraste atua somente como professor offline para treinar o aluno neural.
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');

const THEMES=Object.freeze(['soft','deep','amoled']);
const GROUPS=Object.freeze({
  train:['cards','tables','dialog','form','menus'],
  validation:['feed','notes'],
  holdout:['reading','settings']
});
const SOURCE_COLORS=Object.freeze([
  [21,23,29],[48,52,61],[112,113,122],[223,226,230],
  [32,94,166],[20,114,95],[156,61,104],[188,131,45]
]);
const FAMILY_BG=Object.freeze({
  cards:[20,25,31],tables:[32,38,49],dialog:[41,35,45],
  form:[24,39,47],menus:[36,38,43],feed:[26,33,40],
  notes:[48,44,53],reading:[30,35,43],settings:[27,46,54]
});
const clamp=v=>Math.min(255,Math.max(0,Math.round(v)));
const fmt=a=>'rgb('+a.map(clamp).join(', ')+')';
function familyExamples(family,split){
  const basis=FAMILY_BG[family];if(!basis)throw Error('Familia desconhecida');
  const rows=[];
  for(const theme of THEMES)for(const n of [0,1,2])for(const fg of SOURCE_COLORS)
    for(const isLink of [0,1])for(const isLarge of [0,1]){
      // Perturbações locais determinísticas, sem tokens de sites reais.
      const bg=basis.map((v,i)=>clamp(v+(n-1)*7+(theme==='amoled'?-12:theme==='soft'?10:0)+i));
      const srcBg=[243-n*11,245-n*9,248-n*8];
      const initial=fg.map((v,i)=>clamp(v+(isLink?[0,3,12][i]:0)));
      const original=colors.parseColor(fmt(initial));
      const background=colors.parseColor(fmt(bg));
      const threshold=isLarge?3:4.5;
      const correction=colors.ensureContrast(original,background,threshold);
      const target=correction ? colors.parseColor(correction):original;
      if(!target||colors.contrastRatio(target,background)<threshold)
        throw Error('Professora de contraste falhou');
      // 12 entradas: fundo proposto + cor original + fundo original + contexto.
      const x=[...bg,...initial,...srcBg].map(v=>v/255)
        .concat([isLink,isLarge,1]);
      const y=[target.r,target.g,target.b].map(v=>v/255);
      rows.push({id:family+'-'+theme+'-'+n+'-'+SOURCE_COLORS.indexOf(fg)+'-'+isLink+'-'+isLarge,
        family,split,x,y});
    }
  return rows;
}
function generate(){
  const rows=[];
  for(const [split,groups] of Object.entries(GROUPS))
    for(const group of groups)rows.push(...familyExamples(group,split));
  return {formatVersion:1,origin:'p11-synthetic-descendant-contrast-teacher-not-websites',
    inputCount:12,outputCount:3,
    note:'Gerado apenas por regras locais e paletas autorais. Não é avaliação visual independente nem dado observado em sites.',
    samples:rows};
}
function validate(doc){
  if(!doc||doc.formatVersion!==1||
    doc.origin!=='p11-synthetic-descendant-contrast-teacher-not-websites'||
    doc.inputCount!==12||doc.outputCount!==3||!Array.isArray(doc.samples))
    throw Error('Contrato P11 inválido');
  const ids=new Set(),splitFamilies={train:new Set(),validation:new Set(),holdout:new Set()};
  for(const row of doc.samples){
    if(!row||typeof row.id!=='string'||ids.has(row.id)||
      !Object.hasOwn(splitFamilies,row.split)||!row.family||
      !Array.isArray(row.x)||row.x.length!==12||
      !Array.isArray(row.y)||row.y.length!==3||
      [...row.x,...row.y].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
      throw Error('Amostra P11 inválida/duplicada');
    ids.add(row.id);splitFamilies[row.split].add(row.family);
  }
  for(const [split,families] of Object.entries(splitFamilies)){
    if(JSON.stringify([...families].sort())!==JSON.stringify([...GROUPS[split]].sort()))
      throw Error('Famílias de treino/validação/holdout alteradas');
  }
  const keys=Object.values(splitFamilies);
  if(keys.some((set,i)=>keys.some((other,j)=>i!==j&&[...set].some(f=>other.has(f)))))
    throw Error('Vazamento P11 entre splits');
  if(ids.size!==9*3*3*8*2*2)throw Error('Contagem P11 alterada');
  return {total:ids.size,train:doc.samples.filter(s=>s.split==='train').length,
    validation:doc.samples.filter(s=>s.split==='validation').length,
    holdout:doc.samples.filter(s=>s.split==='holdout').length};
}
function main(){
  const filename=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||
    path.join(__dirname,'../training/p11-descendant-features.json');
  const dest=path.resolve(filename);
  if(!dest.startsWith(path.resolve(__dirname,'..','training')+path.sep)||
    !dest.endsWith('.json'))throw Error('Destino P11 não permitido');
  const doc=generate(),counts=validate(doc);
  fs.writeFileSync(dest,JSON.stringify(doc)+'\n');
  console.log(JSON.stringify({file:dest,...counts,origin:doc.origin}));
}
if(require.main===module)main();
module.exports=Object.freeze({generate,validate,familyExamples,GROUPS});
