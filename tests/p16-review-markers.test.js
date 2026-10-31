'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {captureReviewFrame}=require('../scripts/p16-review-markers.js');
const {clearReviewMarkers,reviewSessionStable}=require('../scripts/p16-review-markers.js');
const {collect,target}=require('../scripts/p16-public-capture.js');
function fixture(){
 const elements=[];
 const doc={documentElement:{appendChild(x){elements.push(x)}},
  createElement(){return {style:{},attrs:{},children:[],
   setAttribute(k,v){this.attrs[k]=v},
   appendChild(v){this.children.push(v)},remove(){this.removed=true}}}};
 const refs=[0,1,2].map(index=>({ownerDocument:doc,index,isConnected:true}));
 const capture=hook=>{
  refs.forEach((element,index)=>hook(element,index,{
   top:index*40,left:20,width:250,height:36}));
  return {kind:'p15-region-graph-v1',status:'ready',scanned:3,
   nodes:refs.map(item=>({index:item.index}))};
 };
 return {elements,capture};
}
test('P16 labels bind to the exact captured region indices, not page text',()=>{
 const f=fixture(),r=captureReviewFrame(f.capture);
 assert.equal(r.markerCount,3);
 assert.deepEqual(f.elements.map(n=>n.attrs['data-p16-region-label']),['0','1','2']);
 assert.deepEqual(f.elements.map(n=>n.children[0].textContent),['R0','R1','R2']);
 assert.ok(f.elements.every(n=>n.attrs['aria-hidden']==='true'));
 assert.equal(r.verifiedHumanLabels,false);
 assert.equal(r.promotionEligible,false);
 assert.doesNotMatch(JSON.stringify(r),/ownerDocument|password|cookie|href/);
});
test('P16 visualization fails closed without consistent ready region graph',()=>{
 const f=fixture();
 assert.throws(()=>captureReviewFrame(()=>({
  kind:'p15-region-graph-v1',status:'inconclusive',nodes:[]})),/P16 visual:/);
 assert.throws(()=>captureReviewFrame(hook=>{
  const g=f.capture(hook);g.nodes[1].index=22;return g;
 }),/P16 visual:/);
 assert.equal(f.elements.length,0);
});
test('P16 session stability requires identical ready region evidence',()=>{
 const node=luma=>({index:0,parent:-1,background:'opaque',ownLuma:luma,
  effectiveLuma:luma,widthFraction:.4,heightFraction:.2,areaFraction:.08,
  kind:'panel',hasDirectText:false,hasProtectedDescendants:false,
  focusWithin:false,nativeDark:false,hasPseudoPaint:false,inFrame:false,
  hasOcclusionRisk:false,hasComplexAncestorPaint:false,hasMotionRisk:false});
 const graph=nodes=>({kind:'p15-region-graph-v1',status:'ready',
  scanned:nodes.length,nodes});
 const original=graph([node(.94),node(.96)]);
 assert.equal(reviewSessionStable(original,graph([node(.94),node(.96)])),true);
 for(const changed of [
  graph([node(.94)]),                                // region vanished
  graph([node(.94),node(.97)]),                      // CSS changed
  graph([node(.94),node(.96),node(.05)]),            // region appeared
  {...graph([node(.94),node(.96)]),status:'inconclusive',nodes:[]},
  {kind:'p15-region-graph-v1',status:'ready',scanned:2},
  null])
  assert.equal(reviewSessionStable(original,changed),false);
 assert.equal(typeof clearReviewMarkers,'function');
});
test('P16 revalidates evidence after inspection and rejects page churn',async()=>{
 const choice=target('go.dev','case-review-churn');
 const row=(index,parent,luma)=>({index,parent,background:'opaque',
  ownLuma:luma,effectiveLuma:luma,widthFraction:.4,heightFraction:.2,
  areaFraction:.08+index*.01,kind:'panel',hasDirectText:false,
  hasProtectedDescendants:false,focusWithin:false,nativeDark:false,
  hasPseudoPaint:false,inFrame:false,hasOcclusionRisk:false,
  hasComplexAncestorPaint:false,hasMotionRisk:false});
 const graph={kind:'p15-region-graph-v1',status:'ready',scanned:3,
  nodes:[row(0,-1,.05),row(1,0,.94),row(2,0,.96)]};
 const order=[];let closed=0;
 const launch=async(_,options)=>{
  return {page:{navigate:async()=>{},eval:async exp=>{
   if(exp.includes('location.protocol'))return true;
   if(exp.includes('captureReviewFrame')){order.push('markers');
    return {graph,markerCount:3,status:'local-visual-unverified',
     verifiedHumanLabels:false,trainingAuthorized:false,promotionEligible:false};}
   if(exp.includes('data-p16-region-label')){order.push('cleanup');return 3;}
   order.push('recapture');
   // Lazy SPA content landed while the operator was inspecting.
   return {kind:'p15-region-graph-v1',status:'ready',scanned:4,
    nodes:[...graph.nodes,row(3,0,.9)]};
  }},stop:async()=>{closed++}};
 };
 await assert.rejects(collect(choice,{launch,review:true,
  onInspect:async()=>{}}),/page changed during review; recapture/);
 assert.equal(closed,1);
 assert.deepEqual(order,['markers','cleanup','recapture']);
 // Same page, no churn: session closes and evidence is kept.
 const stable={kind:'p15-region-graph-v1',status:'ready',scanned:3,
  nodes:graph.nodes.map(n=>({...n}))};
 const quiet=async()=>({page:{navigate:async()=>{},eval:async exp=>{
  if(exp.includes('location.protocol'))return true;
  if(exp.includes('captureReviewFrame'))
   return {graph:stable,markerCount:3,status:'local-visual-unverified',
    verifiedHumanLabels:false,trainingAuthorized:false,promotionEligible:false};
  if(exp.includes('data-p16-region-label'))return 3;
  return {kind:'p15-region-graph-v1',status:'ready',scanned:3,
   nodes:stable.nodes.map(n=>({...n}))};
 }},stop:async()=>{closed++}});
 const data=await collect(choice,{launch:quiet,review:true,
  onInspect:async()=>{}});
 assert.equal(data.length,3);
 assert.equal(closed,2);
});
test('P16 explicit manual review launches headed Chrome and closes it',async()=>{
 const choice=target('go.dev','case-review-001');
 let closed=0,headed=false,inspected=0;
 const row=(index,parent,luma)=>({
  index,parent,background:'opaque',ownLuma:luma,effectiveLuma:luma,
  widthFraction:.4,heightFraction:.2,areaFraction:.08+index*.01,kind:'panel',
  hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
  nativeDark:false,hasPseudoPaint:false,inFrame:false,
  hasOcclusionRisk:false,hasComplexAncestorPaint:false,hasMotionRisk:false
 });
 const graph={kind:'p15-region-graph-v1',status:'ready',scanned:3,
  nodes:[row(0,-1,.05),row(1,0,.94),row(2,0,.96)]};
 const launch=async(_,options)=>{
  headed=options.headed===true;
  return {page:{navigate:async()=>{},
   eval:async expr=>expr.includes('location.protocol')?true:
    expr.includes('captureReviewFrame')?{graph,markerCount:3,
     status:'local-visual-unverified',verifiedHumanLabels:false,
     trainingAuthorized:false,promotionEligible:false}:graph},
   stop:async()=>{closed++}};
 };
 const data=await collect(choice,{launch,review:true,
  onInspect:async({markers,rows})=>{inspected++;assert.equal(markers,3);assert.equal(rows,3)}});
 assert.equal(data.length,3);
 assert.equal(headed,true);
 assert.equal(inspected,1);
 assert.equal(closed,1);
 await assert.rejects(collect(choice,{launch,review:true}),/P16 visual:/);
 assert.equal(closed,1);
 const normal=await collect(choice,{launch});
 assert.equal(headed,false);
 assert.equal(normal.length,3);
 assert.equal(closed,2);
});
