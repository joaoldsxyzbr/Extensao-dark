'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const {planIslands,suggestTextRepair,evaluateIslandContrast,islandSession}
 =require('../scripts/p13-islands.js');
const light={index:0,background:'rgb(245, 246, 248)',width:400,height:160};
const base={rows:[
  {fg:'rgb(35, 40, 45)',bg:'rgb(245, 246, 248)',size:16,weight:400,protected:false},
  {fg:'rgb(29, 80, 160)',bg:'rgb(245, 246, 248)',size:16,weight:400,protected:false}
],truncated:false};
test('P13: light independent opaque card is converted, dark block skipped',()=>{
  const plan=planIslands([light,{...light,index:1,background:'rgb(25, 32, 41)'}]);
  assert.equal(plan.length,1);
  assert.equal(plan[0].index,0);
  assert.ok(colors.luminance(colors.parseColor(plan[0].target))<.18);
  assert.throws(()=>planIslands([{...light,background:'rgba(245,246,248,.6)'}]),/opaque/);
});
test('P13: text over newly dark region is repaired with genuine contrast',()=>{
  const selected=planIslands([light]);
  const after={...base,rows:base.rows.map(x=>({...x,bg:selected[0].target}))};
  const result=suggestTextRepair(base,after,selected);
  assert.equal(result.status,'ready');
  assert.equal(result.repairs.length,2);
  const proposed={rows:after.rows.map((r,i)=>({...r,fg:result.repairs[i].color})),truncated:false};
  assert.equal(evaluateIslandContrast(base,proposed).status,'safe-in-sample');
  assert.equal(evaluateIslandContrast(base,after).status,'blocked');
});
test('P13: controls, unknown paints and incomplete samples block unsafe recoloring',()=>{
  const target=planIslands([light])[0];
  const changed={rows:[{...base.rows[0],protected:true,bg:target.target},
    {...base.rows[1],bg:target.target}],truncated:false};
  assert.equal(suggestTextRepair(base,changed,[target]).status,'blocked');
  assert.equal(suggestTextRepair(base,{...changed,truncated:true},[target]).status,'inconclusive');
  assert.equal(suggestTextRepair(base,{rows:[],truncated:false},[target]).status,'inconclusive');
  assert.equal(suggestTextRepair(base,{rows:[{...base.rows[0],bg:'rgb(50, 50, 50)'},changed.rows[1]],
    truncated:false},[target]).status,'blocked');
});
test('P13: DOM preview never collects text, links or form values',()=>{
  const code=islandSession.toString();
  assert.doesNotMatch(code,/\.textContent|\.innerHTML|\.innerText|document\.cookie|localStorage|sessionStorage|\.value\b|\.href\b|\.outerHTML/);
  const manifest=require('../manifest.json');
  assert.equal(manifest.content_scripts[0].js.some(f=>f.includes('p13')),false);
  const source=fs.readFileSync(path.join(__dirname,'../scripts/p13-islands.js'),'utf8');
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|new WebSocket/);
});

test('P13: leaf panel containing direct text gets a readable own foreground',()=>{
  const panel={...light,leaf:true,foreground:'rgb(34, 44, 55)'};
  const patch=planIslands([panel])[0];
  assert.ok(patch.targetForeground);
  assert.ok(colors.contrastRatio(colors.parseColor(patch.targetForeground),
    colors.parseColor(patch.target))>=4.5);
  assert.equal(planIslands([{...panel,leaf:false}])[0].targetForeground,null);
});
