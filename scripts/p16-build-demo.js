#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {vectorize}=require('../content/region-ai.js');
const FAMILIES=[
 ['canvas','train','canvas','hasMotionRisk'],
 ['navigation','train','navigation','hasPseudoPaint'],
 ['form','train','form','hasProtectedDescendants'],
 ['cards','train','panel','hasOcclusionRisk'],
 ['table','train','table','focusWithin'],
 ['nested','train','region','inFrame'],
 ['notice','validation','panel','hasComplexAncestorPaint'],
 ['shell','validation','canvas','nativeDark']
];
const FLAGS=['hasDirectText','hasProtectedDescendants','focusWithin',
 'nativeDark','hasPseudoPaint','inFrame','hasOcclusionRisk',
 'hasComplexAncestorPaint','hasMotionRisk'];
function makeDataset(){
 const samples=[];
 FAMILIES.forEach(([family,split,kind,risk],familyIndex)=>{
  const node=(index,parent,luma,k,flags={})=>({
   index,parent,background:'opaque',ownLuma:luma,effectiveLuma:luma,
   widthFraction:.2+familyIndex*.04,heightFraction:.25,
   // Distinct geometry removes accidental duplicate 20D vectors.
   areaFraction:Number((.1+.01*familyIndex+.001*index).toFixed(3)),
   kind:k,...Object.fromEntries(FLAGS.map(x=>[x,false])),...flags
  });
  const graph={kind:'p15-region-graph-v1',status:'ready',scanned:4,nodes:[
   node(0,-1,.04,'canvas'),node(1,0,.94,kind,{hasDirectText:true}),
   node(2,0,.96,'panel',{[risk]:true}),node(3,0,.12,'panel')
  ]};
  const result=vectorize(graph);
  if(result.status!=='ready'||result.rows.length!==4||
     !result.rows[1].eligible||result.rows[2].eligible||result.rows[3].eligible)
   throw Error('P16: invalid synthetic region safety');
  for(const r of result.rows)samples.push({id:'demo-'+family+'-'+r.index,
   split,family,x:r.features,decision:r.index===1?1:0,
   palette:r.index===1?[.06,.07,.08,.95,.96,.97]:null});
 });
 return {formatVersion:1,kind:'p16-synthetic-smoke-v1',
  origin:'authored-not-independent-human-labels',featureCount:20,samples};
}
if(require.main===module){
 if(process.argv.length!==2)throw Error('P16: no paths/options allowed');
 const data=makeDataset();
 fs.writeFileSync(path.join(__dirname,'../data/p16-demo-ci-data.json'),
  JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({samples:data.samples.length,
  holdoutInspected:false,promotionEligible:false}));
}
module.exports=Object.freeze({makeDataset,FAMILIES});
