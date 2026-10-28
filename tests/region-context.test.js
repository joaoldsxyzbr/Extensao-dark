'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {captureRegionGraph}=require('../content/region-graph.js');
const {buildRegionFeatures}=require('../content/region-features.js');
function entry(index,parent,background='opaque',luma=.9,extra={}){
  return {index,parent,background,ownLuma:background==='opaque'?luma:null,
    effectiveLuma:background==='complex'?null:luma,
    widthFraction:.5,heightFraction:.3,areaFraction:.15,
    kind:'region',hasDirectText:false,hasProtectedDescendants:false,
    focusWithin:false,nativeDark:false,hasPseudoPaint:false,inFrame:false,
    hasOcclusionRisk:false,hasComplexAncestorPaint:false,
    hasMotionRisk:false,...extra};
}
function graph(nodes){return {kind:'p15-region-graph-v1',status:'ready',scanned:nodes.length,nodes};}
test('P15: parent, children and siblings expose light islands but do not choose conversion',()=>{
  const rows=[
    entry(0,-1,'opaque',.08,{kind:'canvas'}),
    entry(1,0,'opaque',.91,{hasDirectText:true}),
    entry(2,0,'opaque',.87),
    entry(3,1,'opaque',.96)
  ];
  const result=buildRegionFeatures(graph(rows));
  assert.equal(result.status,'ready');
  assert.equal(result.regionCount,4);
  assert.equal(result.lightRegions,3);
  assert.equal(result.rows[1].parent,0);
  assert.equal(result.rows[1].directChildren,1);
  assert.equal(result.rows[1].siblings,1);
  assert.equal(result.rows[1].brightSiblings,1);
  assert.equal(result.rows[1].brightChildren,1);
  assert.equal(result.rows[1].ancestorBright,false);
  assert.equal(result.rows[3].ancestorBright,true);
  assert.equal(result.rows[1].hasDirectText,true);
  assert.equal(result.rows[1].confirmedLightIsland,true);
  assert.equal(result.rows[2].confirmedLightIsland,true);
  assert.equal(result.rows[3].confirmedLightIsland,false);
  assert.equal(result.promotionEligible,false);
  assert.equal(result.applied,false);
  assert.equal(JSON.stringify(result).includes('decision'),false);
});
test('P15: complex paint and interactive descendants remain uncertain',()=>{
  const rows=[entry(0,-1),entry(1,0,'complex',null),
    entry(2,0,'opaque',.95,{hasProtectedDescendants:true})];
  const result=buildRegionFeatures(graph(rows));
  assert.equal(result.uncertainRegions,2);
  assert.equal(result.rows[1].uncertain,true);
  assert.equal(result.rows[2].uncertain,true);
  assert.equal(result.promotionEligible,false);
});
test('P15: malformed/unbounded graph or injected user fields fail closed',()=>{
  assert.throws(()=>buildRegionFeatures(graph([entry(0,0)])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([entry(0,-1,'opaque',NaN)])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([entry(0,-1,'opaque',.9,{text:'secret'})])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([entry(0,-1,'opaque',.9,{url:'private'})])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph(Array.from({length:81},(_,i)=>entry(i,i-1)))),/P15:/);
  const missing=buildRegionFeatures({kind:'p15-region-graph-v1',status:'inconclusive',scanned:1201,nodes:[]});
  assert.equal(missing.status,'inconclusive');
  assert.equal(missing.regionCount,null);
  assert.equal(missing.promotionEligible,false);
});
test('P15: extractor never examines page content, URLs or form values',()=>{
  const code=captureRegionGraph.toString();
  assert.doesNotMatch(code,/\.textContent|\.innerText|\.innerHTML|\.outerHTML|\.href\b|\.value\b|document\.cookie|localStorage|sessionStorage|fetch\(|XMLHttpRequest/);
  assert.match(code,/getComputedStyle/);
  assert.match(code,/childNodes/);
});
function element(tag,background,{parent=null,hasText=false,protectedChild=false}={}){
  const x={tagName:tag,isConnected:true,parentElement:parent,
    childNodes:hasText?[{nodeType:3}]:[],
    _background:background,
    getBoundingClientRect:()=>({width:400,height:140,top:20,bottom:160,left:20,right:420}),
    closest:()=>null,
    querySelector:()=>protectedChild?{}:null,
    matches:()=>false};
  return x;
}
test('P15: DOM capture uses bounded browser computed style, no DOM handles in result',()=>{
  const body=element('BODY','rgb(30, 32, 36)');
  const parent=element('MAIN','rgb(240, 240, 240)',{parent:body,hasText:true});
  const card=element('SECTION','rgb(250, 250, 250)',{parent,hasText:true});
  const doc={body,documentElement:{},
    querySelectorAll:()=>[body,parent,card]};
  const context={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:el=>({backgroundColor:el._background,
      backgroundImage:'none',maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',content:'none'})};
  const result=vm.runInNewContext('('+captureRegionGraph.toString()+')()',context);
  assert.equal(result.status,'ready');
  assert.equal(result.nodes.length,3);
  assert.equal(result.nodes[2].parent,1);
  assert.equal(result.nodes[1].hasDirectText,true);
  assert.equal(JSON.stringify(result).includes('rgb('),false);
  assert.equal(buildRegionFeatures(JSON.parse(JSON.stringify(result))).status,'ready');
});

test('P15: transparent nested surface inherits known solid ancestor, gradients abstain',()=>{
  const body=element('BODY','rgb(28, 31, 36)');
  const layer=element('MAIN','rgba(0, 0, 0, 0)',{parent:body});
  const gradient=element('SECTION','rgb(245, 245, 245)',{parent:layer});
  gradient._gradient=true;
  const doc={body,documentElement:{},
    querySelectorAll:()=>[body,layer,gradient]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:el=>({backgroundColor:el._background,
      backgroundImage:el._gradient?'linear-gradient(red, blue)':'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light',content:'none'})};
  const captured=JSON.parse(JSON.stringify(
    vm.runInNewContext('('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(captured.status,'ready');
  assert.equal(captured.nodes[1].background,'transparent');
  assert.ok(captured.nodes[1].effectiveLuma<.04);
  assert.equal(captured.nodes[2].background,'complex');
  assert.equal(captured.nodes[2].effectiveLuma,null);
  const result=buildRegionFeatures(captured);
  assert.equal(result.uncertainRegions,2);
});
test('P15: reparented DOM produces a fresh graph, never stale region ancestry',()=>{
  const body=element('BODY','rgb(25, 25, 25)');
  const parent=element('MAIN','rgb(245, 245, 245)',{parent:body});
  const other=element('SECTION','rgb(243, 243, 243)',{parent:body});
  const card=element('SECTION','rgb(250, 250, 250)',{parent});
  const doc={body,querySelectorAll:()=>[body,parent,other,card]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:el=>({backgroundColor:el._background,
      backgroundImage:'none',maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',content:'none'})};
  const run=()=>JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(run().nodes[3].parent,1);
  card.parentElement=other;
  assert.equal(run().nodes[3].parent,2);
});
test('P15: region limits fail closed without leaking partial CSS observations',()=>{
  const body=element('BODY','rgb(25, 25, 25)');
  const sections=Array.from({length:80},()=>element('SECTION','rgb(250, 250, 250)',{parent:body}));
  const ctx={document:{body,querySelectorAll:()=>[body,...sections]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:el=>({backgroundColor:el._background,
      backgroundImage:'none',maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',content:'none'})};
  const result=vm.runInNewContext('('+captureRegionGraph.toString()+')()',ctx);
  assert.equal(result.status,'inconclusive');
  assert.equal(result.nodes.length,0);
  assert.equal(buildRegionFeatures(JSON.parse(JSON.stringify(result))).regionCount,null);
});

test('P15: pseudo-element generated paint makes the region uncertain',()=>{
  const body=element('BODY','rgb(30, 32, 36)');
  const surface=element('MAIN','rgb(249, 249, 249)',{parent:body});
  surface._pseudo=true;
  const context={document:{body,querySelectorAll:()=>[body,surface]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>{
      if(pseudo)return {content:el._pseudo&&pseudo==='::before'?'""':'none'};
      return {backgroundColor:el._background,backgroundImage:'none',
        maskImage:'none',webkitMaskImage:'none',
        opacity:'1',mixBlendMode:'normal',colorScheme:'light',content:'none'};
    }};
  const captured=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',context)));
  assert.equal(captured.status,'ready');
  assert.equal(captured.nodes[1].hasPseudoPaint,true);
  const features=buildRegionFeatures(captured);
  assert.equal(features.rows[1].uncertain,true);
  assert.equal(features.rows[1].hasPseudoPaint,true);
  assert.equal(features.rows[1].confirmedLightIsland,false);
  assert.equal(features.promotionEligible,false);
});
test('P15: selection, pressed, checked and focus controls are protected',()=>{
  const body=element('BODY','rgb(29, 29, 29)');
  const card=element('SECTION','rgb(248, 248, 248)',{parent:body});
  const selectors=[];
  card.querySelector=selector=>{selectors.push(selector);
    return /aria-pressed/.test(selector)?{}:null;};
  card.matches=selector=>selector===':focus-within';
  const context={document:{body,querySelectorAll:()=>[body,card]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(_el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:'rgb(242, 242, 242)',backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light',content:'none'
    }};
  const captured=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',context)));
  assert.equal(captured.status,'ready');
  assert.ok(selectors.some(s=>s.includes('aria-pressed')));
  assert.ok(selectors.some(s=>s.includes('aria-checked')));
  assert.equal(captured.nodes[1].hasProtectedDescendants,true);
  assert.equal(captured.nodes[1].focusWithin,true);
  const features=buildRegionFeatures(captured);
  assert.equal(features.rows[1].uncertain,true);
  assert.equal(features.rows[1].confirmedLightIsland,false);
});
test('P15: unknown pseudo style aborts measurement instead of claiming safety',()=>{
  const body=element('BODY','rgb(28, 28, 28)');
  const ctx={document:{body,querySelectorAll:()=>[body]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(_el,pseudo)=>pseudo?null:{
      backgroundColor:'rgb(28, 28, 28)',backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light',content:'none'
    }};
  const observed=vm.runInNewContext('('+captureRegionGraph.toString()+')()',ctx);
  assert.equal(observed.status,'inconclusive');
  assert.equal(observed.nodes.length,0);
  assert.equal(buildRegionFeatures(JSON.parse(JSON.stringify(observed))).regionCount,null);
});

test('P15: uncertain child or uncertain parent cannot be a confirmed light island',()=>{
  const root=entry(0,-1,'opaque',.08);
  const bright=entry(1,0,'opaque',.95,{hasPseudoPaint:true});
  const innocent=entry(2,1,'opaque',.96);
  const result=buildRegionFeatures(graph([root,bright,innocent]));
  assert.equal(result.rows[1].confirmedLightIsland,false);
  assert.equal(result.rows[2].confirmedLightIsland,false);
  const protectedChild=buildRegionFeatures(graph([
    root,entry(1,0,'opaque',.91,{hasProtectedDescendants:true})]));
  assert.equal(protectedChild.rows[1].confirmedLightIsland,false);
});

test('P15: captures open Shadow DOM hierarchy and direct text without exporting content',()=>{
  const body=element('BODY','rgb(27, 31, 36)');
  const host=element('DIV','rgb(27, 31, 36)',{parent:body});
  const inner=element('SECTION','rgb(247, 247, 247)',{hasText:true});
  const nested=element('ARTICLE','rgb(241, 241, 241)',{parent:inner});
  const root={mode:'open',host,querySelectorAll:()=>[inner,nested],
    querySelector:()=>null};
  host.shadowRoot=root;
  inner.getRootNode=()=>root;
  nested.getRootNode=()=>root;
  inner.childNodes=[{nodeType:3, data:'private text should not be read'}];
  const ctx={document:{body,querySelectorAll:()=>[body,host]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const row=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(row.status,'ready');
  assert.equal(row.nodes.length,4);
  assert.equal(row.nodes[2].parent,1); // cross shadow boundary to host
  assert.equal(row.nodes[3].parent,2); // native parent inside root
  assert.equal(row.nodes[2].hasDirectText,true);
  assert.equal(JSON.stringify(row).includes('private text'),false);
  const features=buildRegionFeatures(row);
  assert.equal(features.rows[2].confirmedLightIsland,true);
  assert.equal(features.applied,false);
});
test('P15: discovers shadow hosts outside region selector, including nested roots',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const host=element('SPAN','rgb(28, 30, 34)',{parent:body});
  const inner=element('SECTION','rgb(250, 250, 250)');
  const nestedHost=element('SPAN','rgb(29, 32, 36)',{parent:inner});
  const leaf=element('ARTICLE','rgb(238, 238, 238)');
  const root2={mode:'open',host:nestedHost,querySelectorAll:()=>[leaf]};
  const root1={mode:'open',host,querySelectorAll:selector=>selector==='*'?
    [inner,nestedHost]:[inner]};
  host.shadowRoot=root1;nestedHost.shadowRoot=root2;
  inner.getRootNode=()=>root1;nestedHost.getRootNode=()=>root1;
  leaf.getRootNode=()=>root2;
  const ctx={document:{body,querySelectorAll:selector=>selector==='*'?[body,host]:[body]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',maskImage:'none',
      webkitMaskImage:'none',opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'ready');
  assert.equal(result.nodes.length,3);
  assert.equal(result.nodes[1].parent,0);
  assert.equal(result.nodes[2].parent,1);
  assert.equal(JSON.stringify(result).includes('SPAN'),false);
});
test('P15: protects interactive ancestor across open Shadow DOM boundary',()=>{
  const body=element('BODY','rgb(30, 31, 32)');
  const host=element('DIV','rgb(35, 36, 38)',{parent:body});
  const inside=element('SECTION','rgb(248, 248, 248)');
  host.closest=selector=>selector.includes('role="button"')?host:null;
  const root={mode:'open',host,querySelectorAll:()=>[inside]};
  host.shadowRoot=root;inside.getRootNode=()=>root;
  const ctx={document:{body,querySelectorAll:()=>[body,host]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',maskImage:'none',
      webkitMaskImage:'none',opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'ready');
  assert.equal(result.nodes.length,1);
  assert.equal(result.nodes[0].kind,'canvas');
});
test('P15: excessive open roots fail closed with empty graph',()=>{
  const body=element('BODY','rgb(28, 31, 33)');
  const host=element('SPAN','rgb(28, 31, 33)',{parent:body});
  const roots=Array.from({length:25},()=>({
    mode:'open',host,querySelectorAll:()=>[]}));
  const shadows=Array.from({length:25},(_,i)=>({
    shadowRoot:roots[i],isConnected:true,closest:()=>null}));
  const doc={body,querySelectorAll:selector=>selector==='*'?
    [body,...shadows]:[body]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',maskImage:'none',
      webkitMaskImage:'none',opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
});

test('P15: same-origin iframe may be sampled, but never promotes a light island',()=>{
  const body=element('BODY','rgb(31, 34, 39)');
  const frame=element('IFRAME','rgb(31, 34, 39)',{parent:body});
  const frameBody=element('BODY','rgb(34, 35, 39)');
  const panel=element('MAIN','rgb(248, 248, 248)',{parent:frameBody,hasText:true});
  const child={body:frameBody,querySelectorAll:s=>s==='*'?
    [frameBody,panel]:[frameBody,panel]};
  frame.contentDocument=child;
  frameBody.getRootNode=()=>child;
  child.defaultView={frameElement:frame};
  panel.getRootNode=()=>child;
  const ctx={document:{body,querySelectorAll:s=>s==='*'?
    [body,frame]:[body]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const captured=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(captured.status,'ready');
  assert.equal(captured.nodes.length,3);
  assert.equal(captured.nodes[1].parent,0);
  assert.equal(captured.nodes[1].inFrame,true);
  assert.equal(captured.nodes[2].inFrame,true);
  const features=buildRegionFeatures(captured);
  assert.equal(features.rows[2].ownBright,true);
  assert.equal(features.rows[2].uncertain,true);
  assert.equal(features.rows[2].confirmedLightIsland,false);
  assert.equal(features.applied,false);
});
test('P15: inaccessible frame or invalid frame document fails closed',()=>{
  const body=element('BODY','rgb(31, 34, 39)');
  const frame=element('IFRAME','rgb(31, 34, 39)',{parent:body});
  const doc={body,querySelectorAll:s=>s==='*'?[body,frame]:[body]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const scan=()=>JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  frame.contentDocument=null;
  assert.equal(scan().status,'inconclusive');
  Object.defineProperty(frame,'contentDocument',{get(){throw Error('SecurityError');}});
  const unknown=scan();
  assert.equal(unknown.status,'inconclusive');
  assert.deepEqual(unknown.nodes,[]);
});
test('P15: malformed inFrame metadata is never silently accepted',()=>{
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{inFrame:'false'})
  ])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{inFrame:false,src:'private-url'})
  ])),/P15:/);
  const result=buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1),
    entry(1,0,'opaque',.9,{inFrame:true})
  ]));
  assert.equal(result.rows[1].confirmedLightIsland,false);
  assert.equal(result.rows[1].uncertain,true);
});

test('P15: overlapping unrelated element makes a light panel uncertain',()=>{
  const body=element('BODY','rgb(25, 30, 36)');
  const card=element('MAIN','rgb(249, 249, 249)',{parent:body});
  const overlay=element('DIV','rgb(40, 40, 40)',{parent:body});
  const doc={body,querySelectorAll:s=>s==='*'?
    [body,card,overlay]:[body,card,overlay],
    elementFromPoint:()=>overlay};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      position:'static',transform:'none',clipPath:'none'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[1].hasOcclusionRisk,true);
  const features=buildRegionFeatures(g);
  assert.equal(features.rows[1].uncertain,true);
  assert.equal(features.rows[1].confirmedLightIsland,false);
});
test('P15: a descendant hit inside region does not count as external occlusion',()=>{
  const body=element('BODY','rgb(25, 30, 36)');
  const card=element('MAIN','rgb(249, 249, 249)',{parent:body});
  const child=element('SPAN','rgb(249, 249, 249)',{parent:card});
  const doc={body,querySelectorAll:s=>s==='*'?
    [body,card,child]:[body,card],elementFromPoint:()=>child};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      position:'static',transform:'none',clipPath:'none'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[1].hasOcclusionRisk,false);
  assert.equal(buildRegionFeatures(g).rows[1].confirmedLightIsland,true);
});
test('P15: transformed element or complex ancestral paint blocks confirmation',()=>{
  const body=element('BODY','rgb(27, 30, 34)');
  const card=element('MAIN','rgb(247, 247, 247)',{parent:body});
  const doc={body,querySelectorAll:()=>[body,card]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      transform:el===card?'matrix(1,0,0,1,4,0)':'none',
      clipPath:'none',position:'static',
      filter:el===body?'blur(1px)':'none'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[1].hasComplexAncestorPaint,true);
  assert.equal(g.nodes[1].hasOcclusionRisk,true);
  const features=buildRegionFeatures(g);
  assert.equal(features.rows[1].confirmedLightIsland,false);
});
test('P15: new risk flags require booleans and forbid user content',()=>{
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{hasOcclusionRisk:'false'})
  ])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{hasComplexAncestorPaint:null})
  ])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{hasOcclusionRisk:true,rawSelector:'private'})
  ])),/P15:/);
});

test('P15: keyframes and transitions mark both region and descendants uncertain',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const region=element('MAIN','rgb(245, 245, 245)',{parent:body});
  const child=element('SECTION','rgb(248, 248, 248)',{parent:region});
  const ctx={document:{body,querySelectorAll:()=>[body,region,child]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      animationName:el===body?'none':'pulse',
      animationDuration:el===body?'0s':'0.7s',
      transitionProperty:'none',transitionDuration:'0s'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[0].hasMotionRisk,false);
  assert.equal(g.nodes[1].hasMotionRisk,true);
  assert.equal(g.nodes[2].hasMotionRisk,true);
  assert.equal(buildRegionFeatures(g).rows[1].confirmedLightIsland,false);
});
test('P15: nonzero CSS transitions on an ancestor block stable-paint claims',()=>{
  const body=element('BODY','rgb(24, 26, 30)');
  const panel=element('MAIN','rgb(247, 247, 247)',{parent:body});
  const ctx={document:{body,querySelectorAll:()=>[body,panel]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      animationName:'none',animationDuration:'0s',
      transitionProperty:el===body?'background-color':'none',
      transitionDuration:el===body?'150ms':'0s'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[1].hasMotionRisk,true);
  assert.equal(buildRegionFeatures(g).rows[1].confirmedLightIsland,false);
});
test('P15: malformed motion metadata is rejected and not silently accepted',()=>{
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{hasMotionRisk:'false'})
  ])),/P15:/);
  assert.throws(()=>buildRegionFeatures(graph([
    entry(0,-1,'opaque',.1,{hasMotionRisk:null})
  ])),/P15:/);
});

test('P15: default zero-duration CSS transitions remain non-animated',()=>{
  const body=element('BODY','rgb(24, 26, 30)');
  const panel=element('MAIN','rgb(247, 247, 247)',{parent:body});
  const ctx={document:{body,querySelectorAll:()=>[body,panel]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light',
      animationName:'none',animationDuration:'0s',
      transitionProperty:'all',transitionDuration:'0s'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[1].hasMotionRisk,false);
  assert.equal(buildRegionFeatures(g).rows[1].confirmedLightIsland,true);
});

test('P15: tree walkers visit large DOM incrementally without selector-wide allocation',()=>{
  const body=element('BODY','rgb(28, 29, 31)');
  body.matches=selector=>selector.includes('body');
  const tiny={tagName:'SPAN',closest:()=>null,matches:()=>false};
  let visited=0,walkers=0;
  const doc={body,
    querySelectorAll:()=>{throw Error('unbounded selector materialization');},
    createTreeWalker:(root,show)=>{
      assert.equal(root,doc);
      assert.equal(show,1);
      walkers++;
      let n=0;
      return {nextNode:()=>{
        if(n>=8100)return null;
        n++;visited++;
        return n===1?body:tiny;
      }};
    }};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(_el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:'rgb(28, 29, 31)',backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.scanned,1);
  // Abort during the first bounded walk; do not allocate a huge NodeList
  // and do not start a second scan of the giant document.
  assert.equal(walkers,1);
  assert.equal(visited,8001);
});
test('P15: more than 1600 matching region nodes aborts without materializing results',()=>{
  const body=element('BODY','rgb(28, 29, 31)');
  body.matches=selector=>selector.includes('body');
  const tiny={tagName:'SECTION',closest:()=>null,
    matches:selector=>selector.includes('section'),
    isConnected:true,parentElement:body,
    getBoundingClientRect:()=>({width:1,height:1,top:0,bottom:1,left:0,right:1})};
  let inspected=0;
  const doc={body,
    querySelectorAll:()=>{throw Error('unbounded selector materialization');},
    createTreeWalker:()=>{let n=0;return {nextNode:()=>{
      inspected++;
      if(n++===0)return body;
      if(n<1800)return tiny;
      throw Error('must stop at region scan budget');
    }};}};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(_el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:'rgb(28, 29, 31)',backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.scanned,1601);
  assert.equal(inspected,1601);
});

test('P15: a mid-scan geometry exception fails closed without leaking partial regions',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const surface=element('MAIN','rgb(246, 247, 248)',{parent:body});
  surface.getBoundingClientRect=()=>{throw Error('layout detached');};
  const doc={body,querySelectorAll:()=>[body,surface]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',maskImage:'none',
      webkitMaskImage:'none',opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const scan=()=>JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  const result=scan();
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.scanned,2);
});
test('P15: shadow host DOM discovery errors cause bounded abstention',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const main=element('MAIN','rgb(246, 247, 248)',{parent:body});
  const doc={body,querySelectorAll:s=>{
    if(s==='*')throw Error('scope disconnected');
    return [body,main];
  }};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.scanned,2);
});
test('P15: editing surfaces and live announcements stay protected',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const main=element('MAIN','rgb(245, 246, 247)',{parent:body});
  const editor=element('DIV','rgb(247, 247, 249)',{parent:main});
  const announcement=element('SECTION','rgb(249, 249, 249)',{parent:main});
  const protects=s=>s.includes('contenteditable')&&s.includes('aria-live')&&
    s.includes('role="textbox"');
  editor.closest=s=>protects(s)?editor:null;
  announcement.closest=s=>protects(s)?announcement:null;
  main.querySelector=s=>protects(s)?editor:null;
  const ctx={document:{body,querySelectorAll:()=>[body,main,editor,announcement]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'ready');
  assert.equal(result.nodes.length,2);
  assert.equal(result.nodes[1].hasProtectedDescendants,true);
  assert.equal(buildRegionFeatures(result).rows[1].confirmedLightIsland,false);
  assert.doesNotMatch(JSON.stringify(result),/editable|textbox|aria-live/);
});

test('P15: childNodes scan is bounded and never materializes unbounded lists',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const section=element('SECTION','rgb(249, 249, 249)',{parent:body});
  const children=Array.from({length:257},()=>({nodeType:1}));
  children[256]={nodeType:3,data:'private content'};
  section.childNodes=children;
  const doc={body,querySelectorAll:s=>s==='*'?[body,section]:[body,section]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'inconclusive');
  assert.deepEqual(result.nodes,[]);
  assert.doesNotMatch(JSON.stringify(result),/private content/);
});
test('P15: direct-text detection is structural, ignoring the private text value',()=>{
  const body=element('BODY','rgb(25, 28, 32)');
  const panel=element('MAIN','rgb(248, 248, 248)',{parent:body});
  panel.childNodes=[{nodeType:1},{nodeType:3,data:'never export me'}];
  const doc={body,querySelectorAll:s=>s==='*'?[body,panel]:[body,panel]};
  const ctx={document:doc,innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',
      opacity:'1',mixBlendMode:'normal',colorScheme:'light'}};
  const result=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(result.status,'ready');
  assert.equal(result.nodes[1].hasDirectText,true);
  assert.doesNotMatch(JSON.stringify(result),/never export me/);
});

test('P15: ancestor compositor/clip flags never certify a bright descendant',()=>{
  const conditions=[
    {transform:'matrix(1, 0, 0, 1, 12, 0)'},
    {clipPath:'inset(5px)'},
    {perspective:'650px'},
    {contain:'paint'},
    {isolation:'isolate'},
    {willChange:'transform'}
  ];
  for(const extra of conditions){
    const body=element('BODY','rgb(27, 30, 34)');
    const layer=element('DIV','rgb(28, 32, 36)',{parent:body});
    const panel=element('SECTION','rgb(248, 248, 248)',{parent:layer});
    const doc={body,querySelectorAll:()=>[body,layer,panel]};
    const ctx={document:doc,innerWidth:1200,innerHeight:800,
      getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
        backgroundColor:el._background,backgroundImage:'none',
        maskImage:'none',webkitMaskImage:'none',opacity:'1',
        mixBlendMode:'normal',colorScheme:'light',
        ...(el===layer?extra:{})}};
    const g=JSON.parse(JSON.stringify(vm.runInNewContext(
      '('+captureRegionGraph.toString()+')()',ctx)));
    assert.equal(g.status,'ready');
    assert.equal(g.nodes[2].hasComplexAncestorPaint,true,
      'ancestor compositor rule must block: '+Object.keys(extra)[0]);
    const rows=buildRegionFeatures(g).rows;
    assert.equal(rows[2].uncertain,true);
    assert.equal(rows[2].confirmedLightIsland,false);
    assert.equal(g.nodes[2].hasDirectText,false);
  }
});
test('P15: safe opaque untransformed ancestor keeps eligible light island',()=>{
  const body=element('BODY','rgb(27, 30, 34)');
  const layer=element('DIV','rgb(29, 32, 37)',{parent:body});
  const panel=element('SECTION','rgb(248, 248, 248)',{parent:layer});
  const ctx={document:{body,querySelectorAll:()=>[body,layer,panel]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light',transform:'none',
      clipPath:'none',perspective:'none',contain:'none',
      isolation:'auto',willChange:'auto'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.status,'ready');
  assert.equal(g.nodes[2].hasComplexAncestorPaint,false);
  assert.equal(buildRegionFeatures(g).rows[2].confirmedLightIsland,true);
});

test('P15: native dark-capable color-scheme tokens abstain, light-only remains observable',()=>{
  for(const declared of ['dark','light dark','dark light','only dark']){
    const body=element('BODY','rgb(27, 30, 34)');
    const panel=element('MAIN','rgb(248, 248, 248)',{parent:body});
    const ctx={document:{body,querySelectorAll:()=>[body,panel]},
      innerWidth:1200,innerHeight:800,
      getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
        backgroundColor:el._background,backgroundImage:'none',
        maskImage:'none',webkitMaskImage:'none',
        opacity:'1',mixBlendMode:'normal',
        colorScheme:el===panel?declared:'light'}};
    const graph=JSON.parse(JSON.stringify(vm.runInNewContext(
      '('+captureRegionGraph.toString()+')()',ctx)));
    assert.equal(graph.status,'ready');
    assert.equal(graph.nodes[1].nativeDark,true,declared);
    assert.equal(buildRegionFeatures(graph).rows[1].confirmedLightIsland,false);
  }
  const safe=element('BODY','rgb(28, 30, 33)');
  const panel=element('MAIN','rgb(249, 249, 249)',{parent:safe});
  const ctx={document:{body:safe,querySelectorAll:()=>[safe,panel]},
    innerWidth:1200,innerHeight:800,
    getComputedStyle:(el,pseudo)=>pseudo?{content:'none'}:{
      backgroundColor:el._background,backgroundImage:'none',
      maskImage:'none',webkitMaskImage:'none',opacity:'1',
      mixBlendMode:'normal',colorScheme:'light'}};
  const g=JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+captureRegionGraph.toString()+')()',ctx)));
  assert.equal(g.nodes[1].nativeDark,false);
  assert.equal(buildRegionFeatures(g).rows[1].confirmedLightIsland,true);
});
