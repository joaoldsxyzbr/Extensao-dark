'use strict';
// P16 experimental inference boundary; reads P15 CSS/geometry features only.
// Never mounted in MV3, never paints, trains, records or promotes models.
const {buildRegionFeatures}=require('./region-features.js');
const FEATURE_COUNT=20;
const KIND='p16-region-ai-candidate-v1';
const VERSION=1;
const KINDS=['canvas','navigation','form','panel','table','region'];
const allowedModels=new WeakSet();
const exact=(object,keys)=>!!object&&typeof object==='object'&&
  !Array.isArray(object)&&Object.keys(object).length===keys.length&&
  Object.keys(object).every(key=>keys.includes(key));
const norm=n=>Math.min(1,n/80);
const bool=x=>x?1:0;
function vectorize(graph){
  const context=buildRegionFeatures(graph); // rejects private fields and malformed P15 data
  const empty={kind:'p16-region-vectors-v1',status:'inconclusive',rows:[],
    applied:false,promotionEligible:false};
  if(context.status!=='ready')return empty;
  return {kind:empty.kind,status:'ready',rows:context.rows.map(row=>{
    const features=[
      bool(row.ownBright),bool(row.ancestorBright),
      bool(row.confirmedLightIsland),bool(row.hasDirectText),
      bool(row.hasProtectedDescendants),bool(row.hasPseudoPaint),
      bool(row.inFrame),bool(row.hasOcclusionRisk),
      bool(row.hasComplexAncestorPaint),bool(row.hasMotionRisk),
      bool(row.uncertain),row.areaFraction,
      norm(row.depth),norm(row.directChildren),norm(row.brightChildren),
      norm(row.siblings),norm(row.brightSiblings),
      bool(row.kind==='canvas'),bool(row.kind==='navigation'),
      bool(row.kind==='form'||row.kind==='table')
    ];
    if(features.length!==FEATURE_COUNT||features.some(v=>
      typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
      throw TypeError('P16: unsafe regional feature');
    return {index:row.index,features,
      eligible:row.confirmedLightIsland&&!row.uncertain};
  }),applied:false,promotionEligible:false};
}
function loadCandidate(core,candidate){
  if(!core||typeof core.loadModel!=='function'||
     typeof core.predict!=='function'||typeof core.describeModel!=='function'||
     !exact(candidate,['kind','formatVersion','featuresVersion','source','heads'])||
     candidate.kind!==KIND||candidate.formatVersion!==1||
     candidate.featuresVersion!==VERSION||
     candidate.source!=='synthetic-experimental-no-release'||
     !exact(candidate.heads,['decision','palette']))
    throw TypeError('P16: invalid or unapproved experimental model envelope');
  const decision=core.loadModel(candidate.heads.decision);
  const palette=core.loadModel(candidate.heads.palette);
  const dimensions=(model,size)=>{
    const description=core.describeModel(model);
    return description.inputSize===FEATURE_COUNT&&
      description.outputSize===size&&description.layerCount<=3&&
      description.parameterCount<=4096&&
      description.layers.at(-1)?.activation==='sigmoid';
  };
  if(!dimensions(decision,1)||!dimensions(palette,6))
    throw TypeError('P16: invalid head dimensions or resource budget');
  const loaded=Object.freeze({decision,palette});
  allowedModels.add(loaded);
  return loaded;
}
function luminance(rgb){
  const linear=v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
  return .2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
}
function safePalette(values){
  if(!values||values.length!==6)return null;
  const channels=Array.from(values);
  if(channels.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    return null;
  const bg=channels.slice(0,3).map(x=>Math.round(x*255));
  const fg=channels.slice(3).map(x=>Math.round(x*255));
  const lb=luminance(bg),lf=luminance(fg);
  if(lb>=.16||lf<.7||(lf+.05)/(lb+.05)<7)return null;
  return {background:bg,foreground:fg};
}
function infer(graph,core,loaded=null){
  const v=vectorize(graph);
  if(loaded!==null&&(!allowedModels.has(loaded)||!core||
      typeof core.predict!=='function'))
    throw TypeError('P16: model not loaded through validated boundary');
  if(v.status!=='ready')return {kind:'p16-region-inference-lab-v1',
    status:'inconclusive',rows:[],applied:false,promotionEligible:false};
  const rows=v.rows.map(row=>{
    const output={index:row.index,action:'abstain',reason:'no-model'};
    if(!row.eligible)return {...output,reason:'unsafe-region'};
    if(!loaded)return output;
    const p=core.predict(loaded.decision,row.features);
    if(!p||p.length!==1||typeof p[0]!=='number'||!Number.isFinite(p[0])||
       p[0]<0||p[0]>1)return {...output,reason:'invalid-decision'};
    if(p[0]<.98)return {...output,reason:'insufficient-confidence'};
    const proposed=safePalette(core.predict(loaded.palette,row.features));
    if(!proposed)return {...output,reason:'unsafe-palette'};
    return {index:row.index,action:'propose',reason:'experimental-only',
      confidence:Number(p[0].toFixed(6)),palette:proposed};
  });
  return {kind:'p16-region-inference-lab-v1',status:'exploratory',rows,
    applied:false,promotionEligible:false};
}
module.exports=Object.freeze({KIND,FEATURE_COUNT,VERSION,vectorize,
  loadCandidate,infer,safePalette});
