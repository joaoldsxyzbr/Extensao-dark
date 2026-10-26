'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {buildPlan,renderVisualPage,outputFolder,command}=require('../scripts/p9-visual-candidates.js');
const {EXPRESSION,VISUAL_EXPRESSION,CAPTURE_SOURCE}=require('../scripts/p9-live-feature-snapshot.js');
const root=path.resolve(__dirname,'..');
const example=(reasons=[])=>({x:Array(57).fill(.2),reasons});
const convert=()=>({action:'convert',confidence:.95,
  background:'rgb(24, 28, 34)',color:'rgb(239, 242, 245)'});

test('P9 visual: plano rejeita elementos protegidos e evita texto sem contraste',()=>{
  const samples=[example(['graphic']),example(['selected']),example(['disabled']),
    example(['translucent']),example([]),example([])];
  let calls=0;
  const plan=buildPlan(samples,()=>{calls++;return calls===6?
    {...convert(),background:'rgb(30, 30, 30)',color:'rgb(36, 36, 36)'}:convert();});
  assert.equal(plan.stats.sampled,6);
  assert.equal(plan.stats.protected,4);
  assert.equal(plan.stats.modelConversions,6);
  assert.equal(plan.stats.protectionRejected,4);
  assert.equal(plan.stats.lowContrastRejected,1);
  assert.equal(plan.stats.guarded,1);
  assert.deepEqual(plan.operations,[{index:4,background:convert().background,color:convert().color}]);
});

test('P9 visual: plano rejeita entrada neural/DOM adulterada',()=>{
  assert.throws(()=>buildPlan([example(['unknown'])],convert),/vetor/);
  assert.throws(()=>buildPlan([example([])],()=>({action:'convert',confidence:1,
    background:'url(https://example.com)',color:'rgb(255, 255, 255)'})),/cores RGB/);
  assert.throws(()=>buildPlan([example([])],()=>({action:'unexpected',confidence:.9})),/resposta neural/);
});

function styleFixture(){
  const props=new Map([['background-color',{value:'rgb(250, 250, 250)',priority:''}],
    ['color',{value:'rgb(11, 12, 13)',priority:'important'}]]);
  return {
    getPropertyValue:name=>props.get(name)?.value||'',
    getPropertyPriority:name=>props.get(name)?.priority||'',
    setProperty:(name,value,priority='')=>props.set(name,{value,priority}),
    removeProperty:name=>props.delete(name)
  };
}

test('P9 visual: mudanças só em aba descartável e restauração exata de prioridades',()=>{
  const style=styleFixture(),el={isConnected:true,style};
  globalThis.__extDarkP9VisualNodes=[el];
  try {
    assert.deepEqual(renderVisualPage('apply',[{index:0,background:'rgb(24, 28, 34)',
      color:'rgb(239, 242, 245)'}]),{applied:1});
    assert.equal(style.getPropertyPriority('background-color'),'important');
    assert.equal(style.getPropertyValue('background-color'),'rgb(24, 28, 34)');
    assert.throws(()=>renderVisualPage('apply',[]),/restaure/);
    assert.deepEqual(renderVisualPage('restore'),{restored:1,mismatch:0});
    assert.equal(style.getPropertyValue('background-color'),'rgb(250, 250, 250)');
    assert.equal(style.getPropertyPriority('background-color'),'');
    assert.equal(style.getPropertyValue('color'),'rgb(11, 12, 13)');
    assert.equal(style.getPropertyPriority('color'),'important');
    assert.deepEqual(renderVisualPage('close'),{closed:true});
  }finally{
    delete globalThis.__extDarkP9SavedStyles;
    delete globalThis.__extDarkP9VisualNodes;
  }
});

test('P9 visual: nao aceita indices repetidos, estilos arbitrarios ou modulo da extensao publicado',()=>{
  const style=styleFixture();
  globalThis.__extDarkP9VisualNodes=[{style,isConnected:true}];
  try {
    const op={index:0,background:'rgb(24, 28, 34)',color:'rgb(239, 242, 245)'};
    assert.throws(()=>renderVisualPage('apply',[op,op]),/invalida/);
    assert.throws(()=>renderVisualPage('apply',[{...op,background:'url(x)'}]),/invalida/);
    assert.equal(style.getPropertyValue('background-color'),'rgb(250, 250, 250)');
    assert.equal(style.getPropertyPriority('background-color'),'');
    assert.equal(command('apply',[]).includes('renderVisualPage'),true);
  }finally{
    delete globalThis.__extDarkP9SavedStyles;
    delete globalThis.__extDarkP9VisualNodes;
  }
});

test('P9 visual: apenas prova de laboratorio, sem alterar content scripts ou caminhos externos',()=>{
  assert.equal(VISUAL_EXPRESSION.includes('module.exports,true'),true);
  assert.equal(EXPRESSION.includes('module.exports,true'),false);
  assert.doesNotMatch(CAPTURE_SOURCE,/\.textContent|\.innerText|\.innerHTML|\.value\b|document\.cookie|localStorage|sessionStorage|fetch\s*\(/);
  assert.equal(require('../manifest.json').content_scripts[0].js.some(p=>p.includes('p9-')),false);
  assert.equal(outputFolder(path.join(root,'browser-results/p9-visual')),
    path.join(root,'browser-results/p9-visual'));
  assert.throws(()=>outputFolder(path.join(root,'data')),/bloqueadas/);
  assert.throws(()=>outputFolder(path.join(root,'manifest.json')),/bloqueadas/);
});
