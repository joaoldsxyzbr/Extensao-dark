'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const {featuresFor}=require('../training/p11-descendant-runtime.js');
const {compareP11TextRepairs,assertP11Diagnostic}=
  require('../scripts/p14-p11-shadow.js');
const before={truncated:false,rows:[{
  fg:'rgb(20, 20, 20)',bg:'rgb(245, 245, 245)',size:16,
  weight:400,protected:false
}]};
const after={truncated:false,rows:[{
  fg:'rgb(20, 20, 20)',bg:'rgb(26, 32, 40)',size:16,
  weight:400,protected:false
}]};
const repairs=[{index:0,background:after.rows[0].bg,color:'rgb(235, 235, 235)'}];
const context={truncated:false,rows:[{isLink:true,explicitColor:true}]};
const fake=(answer='rgb(240, 240, 240)')=>({
  colors,core:{},model:{},featuresFor,
  predictText:(_core,_model,x)=>{
    assert.equal(x.length,12);
    assert.equal(x[9],1); // link confirmed by DOM metadata
    assert.equal(x[10],0);
    assert.equal(x[11],1); // own color proven, never assumed
    return {action:'suggest',color:answer};
  }
});
test('P14 P11: proposals use P13 painted CSS, without changing the teacher repairs',()=>{
  const original=structuredClone(repairs),old=structuredClone(before);
  const item=compareP11TextRepairs(before,after,repairs,fake(),context);
  assert.equal(item.kind,'p14-p11-text-css-shadow-only');
  assert.equal(item.status,'measured');
  assert.equal(item.candidates,1);
  assert.equal(item.suggested,1);
  assert.equal(item.rejected,0);
  assert.equal(item.differentFromP13,1);
  assert.equal(item.applied,false);
  assert.equal(item.promotionEligible,false);
  assert.equal(item.fullEngineComparisonAvailable,false);
  assert.equal(assertP11Diagnostic(item),true);
  assert.deepEqual(repairs,original);
  assert.deepEqual(before,old);
  assert.doesNotMatch(JSON.stringify(item),/rgb[(]|background|foreground|url|textContent/);
});
test('P14 P11: unsafe suggestions cannot be treated as a measured safe proposal',()=>{
  const item=compareP11TextRepairs(before,after,repairs,fake('rgb(31, 31, 31)'),context);
  assert.equal(item.status,'inconclusive');
  assert.equal(item.suggested,null);
  const rejected=compareP11TextRepairs(before,after,repairs,{
    ...fake(),predictText:()=>({action:'reject',reason:'insufficient-neural-contrast'})
  },context);
  assert.equal(rejected.status,'measured');
  assert.equal(rejected.rejected,1);
  assert.equal(rejected.suggested,0);
});
test('P14 P11: missing CSS, protected targets and changed repair background block evidence',()=>{
  const opts=fake();
  const absent=compareP11TextRepairs(before,{...after,rows:[]},repairs,opts,context);
  assert.equal(absent.status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,{
    ...after,rows:[{...after.rows[0],protected:true}]},repairs,opts,context).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,[
    {...repairs[0],background:'rgb(60, 60, 60)'}],opts,context).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,[repairs[0],repairs[0]],opts,context).status,'inconclusive');
  const none=compareP11TextRepairs(before,after,[],opts,context);
  assert.equal(none.status,'no-repair-opportunity');
  assert.equal(none.candidates,0);
  assert.throws(()=>assertP11Diagnostic({...none,cookie:'secret'}),/P14:/);
  assert.throws(()=>assertP11Diagnostic({...none,applied:true}),/P14:/);
});

test('P14 P11: missing declaration evidence never becomes an explicit-color guess',()=>{
  let called=0;
  const inputs={...fake(),predictText:()=>{called++;throw Error('must not infer');}};
  assert.equal(compareP11TextRepairs(before,after,repairs,inputs).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,repairs,inputs,{
    truncated:false,rows:[{isLink:false,explicitColor:null}]
  }).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,repairs,inputs,{
    truncated:true,rows:[{isLink:true,explicitColor:true}]
  }).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,repairs,inputs,{
    truncated:false,rows:[{isLink:true,explicitColor:false}]
  }).status,'inconclusive');
  assert.equal(compareP11TextRepairs(before,after,repairs,inputs,{
    truncated:false,rows:[{isLink:'true',explicitColor:true}]
  }).status,'inconclusive');
  assert.equal(called,0);
});
