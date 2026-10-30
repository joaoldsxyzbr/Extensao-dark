'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {target,draft,merge,collect,EMPTY}=
 require('../scripts/p16-public-capture.js');
const make=(index,parent,light,kind='panel',flags={})=>({
 index,parent,background:'opaque',ownLuma:light,effectiveLuma:light,
 widthFraction:.4,heightFraction:.2,areaFraction:.08+index*.01,kind,
 hasDirectText:false,hasProtectedDescendants:false,focusWithin:false,
 nativeDark:false,hasPseudoPaint:false,inFrame:false,
 hasOcclusionRisk:false,hasComplexAncestorPaint:false,hasMotionRisk:false,
 ...flags});
const graph={kind:'p15-region-graph-v1',status:'ready',scanned:3,nodes:[
 make(0,-1,.04,'canvas'),make(1,0,.94,'panel',{hasDirectText:true}),
 make(2,0,.96,'form',{hasProtectedDescendants:true})]};
test('P16 capture protects reserved holdout and rejects arbitrary sites and case IDs',()=>{
 assert.equal(target('go.dev','case-go-sample').split,'train');
 assert.equal(target('astro.build','case-astro-001').split,'validation');
 for(const [d,id] of [['julialang.org','case-julia-001'],
  ['openstreetmap.org','case-openmap-001'],['localhost','case-local-001'],
  ['GO.DEV','case-go-sample'],['go.dev','https://go.dev'],
  ['go.dev','case-x'],['go.dev/foo','case-go-sample']])
  assert.throws(()=>target(d,id),/P16 public:/);
});
test('P16 creates pending reviews from CSS/geometry and does not approve training',()=>{
 const choice=target('go.dev','case-go-sample');
 const rows=draft(graph,choice);
 assert.equal(rows.length,3);
 assert.ok(rows.every(r=>r.features.length===20&&
   r.firstReview==='pending'&&r.secondReview==='pending'&&r.palette===null));
 const output=merge(EMPTY(),choice,rows);
 assert.equal(output.report.recordedRegions,3);
 assert.equal(output.report.verifiedIndependentReviews,0);
 assert.equal(output.report.trainingAuthorized,false);
 assert.equal(output.report.promotionEligible,false);
 assert.equal(JSON.stringify(rows).includes('textContent'),false);
});
test('P16 rejects partial graphs, private fields, duplicate cases and illegal splits',()=>{
 const choice=target('go.dev','case-go-sample');
 const rows=draft(graph,choice);
 assert.throws(()=>draft({...graph,status:'inconclusive',nodes:[]},choice),/P16 public:/);
 assert.throws(()=>draft({...graph,nodes:graph.nodes.map((x,i)=>
   i===1?{...x,textContent:'private'}:x)},choice),/P15:/);
 assert.throws(()=>merge({...EMPTY(),entries:rows},choice,rows),/P16 public:/);
 assert.throws(()=>merge(EMPTY(),choice,[{...rows[0],split:'holdout'}]),/P16 intake:/);
});
test('P16 discards redirected public sites and always destroys disposable profile',async()=>{
 let closed=0;
 const choice=target('go.dev','case-go-sample');
 const browser=(host)=>async()=>({
  page:{navigate:async()=>{},eval:async exp=>
   exp==='location.hostname'?host:graph},stop:async()=>{closed++}
 });
 await assert.rejects(collect(choice,{launch:browser('other.example')}),/redirect/);
 assert.equal(closed,1);
 assert.equal((await collect(choice,{launch:browser('go.dev')})).length,3);
 assert.equal(closed,2);
});
test('P16 capture never runs in CI automatically or reads page secrets',()=>{
 const s=fs.readFileSync(require('node:path').join(
   __dirname,'../scripts/p16-public-capture.js'),'utf8');
 assert.doesNotMatch(s,/\bdocument\.cookie|\binnerHTML\b|\btextContent\b|\blocalStorage\b/);
 assert.doesNotMatch(s,/\bfetch\s*\(|\bXMLHttpRequest\b|page\.screenshot\s*\(/);
 assert.ok(s.includes('getExplorationCandidates'));
 assert.ok(s.includes("flag:'wx'"));
});
