'use strict';
// P15 experimental: aggregate bounded CSS/geometry-only region metadata.
// This stage suggests NO conversion, neural decision, or production style.
const NODE_KEYS=['index','parent','background','ownLuma','effectiveLuma',
  'widthFraction','heightFraction','areaFraction','kind',
  'hasDirectText','hasProtectedDescendants','focusWithin','nativeDark',
  'hasPseudoPaint','inFrame','hasOcclusionRisk','hasComplexAncestorPaint'];
const KINDS=new Set(['canvas','navigation','form','panel','table','region']);
const BACKGROUNDS=new Set(['opaque','transparent','complex']);
const within=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function buildRegionFeatures(graph){
  if(!graph||typeof graph!=='object'||Array.isArray(graph)||
    Object.keys(graph).length!==4||
    Object.keys(graph).some(k=>!['kind','status','scanned','nodes'].includes(k))||
    graph.kind!=='p15-region-graph-v1'||
    !['ready','inconclusive'].includes(graph.status)||
    !Number.isSafeInteger(graph.scanned)||graph.scanned<0||
    graph.scanned>1601||!Array.isArray(graph.nodes)||
    graph.nodes.length>80)
    throw TypeError('P15: invalid graph envelope');
  if(graph.status==='inconclusive'){
    if(graph.nodes.length!==0)throw TypeError('P15: partial graph cannot be measured');
    return {kind:'p15-region-context-v1',status:'inconclusive',
      regionCount:null,uncertainRegions:null,lightRegions:null,rows:[],
      applied:false,promotionEligible:false};
  }
  if(!graph.nodes.length||graph.scanned<graph.nodes.length||graph.scanned>1600)
    throw TypeError('P15: incomplete ready graph');
  graph.nodes.forEach((n,index)=>{
    if(!n||typeof n!=='object'||Array.isArray(n)||
      Object.keys(n).length!==NODE_KEYS.length||
      Object.keys(n).some(k=>!NODE_KEYS.includes(k))||
      n.index!==index||!Number.isSafeInteger(n.parent)||
      n.parent< -1||n.parent>=index||
      !BACKGROUNDS.has(n.background)||!KINDS.has(n.kind)||
      !within(n.widthFraction)||!within(n.heightFraction)||
      !within(n.areaFraction)||
      ['hasDirectText','hasProtectedDescendants','focusWithin','nativeDark','hasPseudoPaint','inFrame','hasOcclusionRisk','hasComplexAncestorPaint']
        .some(k=>typeof n[k]!=='boolean')||
      (n.background==='opaque'?
        !within(n.ownLuma)||n.effectiveLuma!==n.ownLuma:
        n.ownLuma!==null||
          (n.background==='complex'?
            n.effectiveLuma!==null:
            n.effectiveLuma!==null&&!within(n.effectiveLuma))))
      throw TypeError('P15: invalid regional CSS or hierarchy');
  });
  const bright=n=>n.background==='opaque'&&n.ownLuma>=.75;
  const rows=graph.nodes.map(n=>{
    const children=graph.nodes.filter(x=>x.parent===n.index);
    const siblings=graph.nodes.filter(x=>x.parent===n.parent&&x.index!==n.index);
    let parent=n.parent,ancestorBright=false,depth=0;
    while(parent!==-1){
      const p=graph.nodes[parent];
      if(bright(p))ancestorBright=true;
      depth++;
      if(depth>80)throw TypeError('P15: cyclic graph');
      parent=p.parent;
    }
    return {index:n.index,parent:n.parent,kind:n.kind,depth,
      areaFraction:n.areaFraction,ownBright:bright(n),
      ancestorBright,directChildren:children.length,siblings:siblings.length,
      brightChildren:children.filter(bright).length,
      brightSiblings:siblings.filter(bright).length,
      hasDirectText:n.hasDirectText,
      hasProtectedDescendants:n.hasProtectedDescendants,
      hasPseudoPaint:n.hasPseudoPaint,inFrame:n.inFrame,
      hasOcclusionRisk:n.hasOcclusionRisk,
      hasComplexAncestorPaint:n.hasComplexAncestorPaint,
      uncertain:n.background!=='opaque'||n.effectiveLuma===null||
        n.hasProtectedDescendants||n.focusWithin||n.nativeDark||n.hasPseudoPaint||n.inFrame||
        n.hasOcclusionRisk||n.hasComplexAncestorPaint};
  });
  // A light region is a confirmed inner island ONLY when both itself and
  // its dark immediate parent have enough CSS evidence to assess safely.
  // An uncertain pseudo/selection/gradient is never evidence of an island.
  for(const row of rows){
    const parent=row.parent>=0?rows[row.parent]:null;
    row.confirmedLightIsland=!!(parent&&row.ownBright&&!row.uncertain&&
      !parent.ownBright&&!parent.uncertain);
  }
  return {kind:'p15-region-context-v1',status:'ready',
    regionCount:rows.length,uncertainRegions:rows.filter(x=>x.uncertain).length,
    lightRegions:rows.filter(x=>x.ownBright).length,
    rows,applied:false,promotionEligible:false};
}
module.exports=Object.freeze({buildRegionFeatures});
