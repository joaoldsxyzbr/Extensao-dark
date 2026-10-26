'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {buildPlan,renderVisualPage,outputFolder,command,reviewContrast,contrastSafety,selectSafeOperations}=require('../scripts/p9-visual-candidates.js');
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

test('P9 visual: aumento de textos sem contraste exige revisao e nunca vira aprovacao',()=>{
  const initial={sampledText:120,weakText:3};
  assert.equal(reviewContrast(initial,{sampledText:120,weakText:45}).status,'needs-review');
  assert.equal(reviewContrast(initial,{sampledText:120,weakText:4}).status,'observed-no-clear-regression');
  assert.equal(reviewContrast(initial,{sampledText:0,weakText:0}).status,'inconclusive');
  assert.equal(reviewContrast(initial,{sampledText:100,weakText:120}).status,'inconclusive');
});


test('P9 descendentes: rejeita qualquer novo texto/icone fraco apos fundo neural',()=>{
  const baseline={sampledText:136,weakText:6,maskedIcons:5,weakIcons:0};
  assert.deepEqual(contrastSafety(baseline,{...baseline,weakText:7}).safe,false);
  assert.deepEqual(contrastSafety(baseline,{...baseline,weakIcons:1}).safe,false);
  assert.deepEqual(contrastSafety(baseline,{...baseline,sampledText:130}).safe,false);
  assert.deepEqual(contrastSafety(baseline,{...baseline,maskedIcons:4}).safe,false);
  assert.deepEqual(contrastSafety(baseline,{...baseline,weakText:5}).safe,true);
  assert.deepEqual(contrastSafety(baseline,{...baseline}).safe,true);
  assert.deepEqual(contrastSafety(baseline,null).safe,false);
});

test('P9 descendentes: avalia cada operacao e rejeita conflito combinado',async()=>{
  const baseline={sampledText:10,weakText:0,maskedIcons:1,weakIcons:0};
  const operations=[{index:1},{index:2},{index:3}];
  const trials=[];
  const probe=async selected=>{
    trials.push(selected.map(o=>o.index).join(','));
    // O 2 por si so escurece o texto de seu descendente.
    if(selected.some(o=>o.index===2))return {...baseline,weakText:2};
    // 1 e 3 isolados funcionam; juntos produzem contraste insuficiente.
    if(selected.length===2)return {...baseline,weakText:1};
    return {...baseline};
  };
  const result=await selectSafeOperations(operations,baseline,probe);
  assert.deepEqual(trials,['1','2','3','1,3']);
  assert.deepEqual(result.operations,[]);
  assert.equal(result.descendantContrastRejected,1);
  assert.equal(result.combinedContrastRejected,2);
  assert.equal(result.safe,false);
});

test('P9 descendentes: aceita conversoes independentes e nao ignora erros de medicao',async()=>{
  const baseline={sampledText:12,weakText:0,maskedIcons:0,weakIcons:0};
  const operations=[{index:4},{index:5}];
  const result=await selectSafeOperations(operations,baseline,async()=>({...baseline}));
  assert.deepEqual(result.operations,operations);
  assert.equal(result.safe,true);
  await assert.rejects(()=>selectSafeOperations(operations,baseline,async()=>{
    throw Error('Falha de CDP ao medir contraste');
  }),/CDP/);
});


test('P10: render de superficie neural corrige descendente e restaura ambos exatamente',()=>{
  const {repairDescendantText}=require('../scripts/p10-descendant-color.js');
  const colors=require('../content/colors.js');
  const originalRead=globalThis.getComputedStyle;
  const parentStyle=styleFixture();
  const childStyle=styleFixture();
  childStyle.setProperty('background-color','');
  childStyle.setProperty('color','rgb(24, 24, 24)','');
  const root={tagName:'ARTICLE',style:parentStyle,isConnected:true,parentElement:null};
  const descendant={
    tagName:'P',style:childStyle,isConnected:true,parentElement:root,
    closest:()=>null,
    getBoundingClientRect:()=>({width:150,height:24}),
  };
  root.querySelectorAll=()=>[descendant];
  globalThis.getComputedStyle=el=>({
    display:'block',visibility:'visible',opacity:'1',backgroundImage:'none',
    maskImage:'none',webkitMaskImage:'none',fontSize:'16px',fontWeight:'400',
    backgroundColor:el.style.getPropertyValue('background-color')||
      (el===root?'rgb(255, 255, 255)':'rgba(0, 0, 0, 0)'),
    color:el.style.getPropertyValue('color')
  });
  globalThis.__extDarkP9VisualNodes=[root];
  try{
    const result=renderVisualPage('apply',[{index:0,repairDescendants:true,
      background:'rgb(24, 28, 34)',color:'rgb(239, 242, 245)'}],
      colors,repairDescendantText);
    assert.deepEqual(result,{applied:1,descendantRepairs:1});
    assert.ok(colors.contrastRatio(
      colors.parseColor(descendant.style.getPropertyValue('color')),
      colors.parseColor('rgb(24, 28, 34)'))>=4.5);
    assert.deepEqual(renderVisualPage('restore'),{restored:1,mismatch:0});
    assert.equal(root.style.getPropertyValue('background-color'),'rgb(250, 250, 250)');
    assert.equal(descendant.style.getPropertyValue('color'),'rgb(24, 24, 24)');
    assert.equal(descendant.style.getPropertyPriority('color'),'');
    assert.deepEqual(renderVisualPage('close'),{closed:true});
  }finally{
    globalThis.getComputedStyle=originalRead;
    delete globalThis.__extDarkP9SavedStyles;
    delete globalThis.__extDarkP9OperationCount;
    delete globalThis.__extDarkP9VisualNodes;
  }
});
