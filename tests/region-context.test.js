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
    focusWithin:false,nativeDark:false,hasPseudoPaint:false,...extra};
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
  const root={mode:'open',host,querySelectorAll:()=>[inner,nested]};
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
  const root1={mode:'open',host,querySelectorAll:()=>[inner,nestedHost]};
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
    shadowRoot:roots[i],isConnected:true}));
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
