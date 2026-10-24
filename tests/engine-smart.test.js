'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const colors = require('../content/colors.js');
const neural = require('../content/neural.js');

function mockElement(tag, baseBackground, baseText, backgroundImage='none', maskImage='none', webkitMaskImage='none') {
  const state=new Map();
  const node = {
    nodeType:1,tagName:tag,isConnected:true,parentElement:null, firstElementChild:null,
    sourceBackground:baseBackground,sourceText:baseText,backgroundImage,maskImage,webkitMaskImage,
    style: {
      getPropertyValue: key=>state.get(key)?.value??'',
      getPropertyPriority: key=>state.get(key)?.priority??'',
      setProperty: (key,value,priority)=>state.set(key,{value,priority}),
      removeProperty: key=>state.delete(key)
    },
    closest:()=>null,
    attributes:{},
    getAttribute(key){return this.attributes[key] ?? null;},
    setAttribute(key,value){this.attributes[key]=value;},
    removeAttribute(key){delete this.attributes[key];},
    appendChild(child){this.child=child;},
    remove(){}
  };
  return node;
}
async function runPage({bg='rgb(255,255,255)',fg='rgb(10,10,10)',childBg='rgb(150,150,150)',childFg='rgb(12,12,12)',backgroundImage='none',smartEnabled=true,model=neural,childSelected=false,ignoreNativeDark=false,maskImage='none',webkitMaskImage='none',childRole=null,childClass=null,childWidth='300px',childHeight='120px',childHasSvg=false}) {
  const root=mockElement('HTML',bg,fg),body=mockElement('BODY',bg,fg),child=mockElement('DIV',childBg,childFg,backgroundImage,maskImage,webkitMaskImage);
  body.parentElement=root;child.parentElement=body;root.firstElementChild=body;body.firstElementChild=child;
  if (childSelected) child.attributes['aria-selected']='true';
  if (childRole) child.attributes.role=childRole;
  if (childClass) child.attributes.class=childClass;
  child.querySelector=selector=>childHasSvg&&selector.includes('svg')?{}:null;
  const nodes=[root,body,child];
  const pending=[];
  const d={documentElement:root,body,readyState:'complete',createElement:()=>({textContent:'',remove(){}}),
    createTreeWalker:()=>{let i=0;return {nextNode:()=>nodes[++i]??null};},addEventListener(){}
  };
  const world={document:d, location:{protocol:'https:',hostname:'test.example'},
    DarkExtensionColors:colors,DarkExtensionNeural:model, Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get: async defaults=>({...defaults,smartEnabled,ignoreNativeDark})},onChanged:{addListener(){}}}},
    getComputedStyle:node=>({
      backgroundColor:node.style?.getPropertyValue('background-color') || node.sourceBackground,
      color:node.style?.getPropertyValue('color') || node.sourceText,
      backgroundImage:node.backgroundImage||'none',
      maskImage:node.maskImage||'none',webkitMaskImage:node.webkitMaskImage||'none',
      width:node===child?childWidth:'800px',height:node===child?childHeight:'500px',
      clipPath:'none',webkitClipPath:'none'
    }),
    MutationObserver:class{observe(){}disconnect(){}},requestIdleCallback:callback=>pending.push(callback),setTimeout:callback=>pending.push(callback)
  };
  world.globalThis=world;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),world);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  for(let attempts=0;pending.length && attempts<10;attempts++)pending.shift()();
  return {root,body,child};
}

test('IA opcional escurece painel cinza de texto escuro, que a regra antiga não escurece',async()=>{
  const smart=await runPage({smartEnabled:true});
  const classic=await runPage({smartEnabled:false});
  assert.match(smart.child.style.getPropertyValue('background-color'),/^rgb\(/);
  assert.equal(classic.child.style.getPropertyValue('background-color'),'');
});

test('fundo com gradiente não é destruído pelo classificador',async()=>{
  const {child}=await runPage({backgroundImage:'linear-gradient(red, blue)'});
  assert.equal(child.style.getPropertyValue('background-color'),'');
  assert.equal(child.style.getPropertyValue('color'),'');
});

test('tema nativo escuro permanece intacto mesmo com rede neural habilitada',async()=>{
  const {root,body,child}=await runPage({bg:'rgb(29,29,29)',fg:'rgb(235,235,235)',childBg:'rgb(30,30,30)',childFg:'rgb(245,245,245)'});
  for(const node of [root,body,child]){
    assert.equal(node.style.getPropertyValue('background-color'),'');
    assert.equal(node.style.getPropertyValue('color'),'');
  }
});

// Neural-first: a decisão do modelo deve prevalecer sobre o mapeamento tradicional.
test('modo neural: modelo veta fundo claro mesmo que heurística o modificasse', async () => {
  const never = {probability:()=>0};
  const smart = await runPage({childBg:'rgb(250,250,250)', model:never,smartEnabled:true});
  const classic = await runPage({childBg:'rgb(250,250,250)',model:never,smartEnabled:false});
  assert.equal(smart.child.style.getPropertyValue('background-color'), '', 'decisão da rede deveria ser primária');
  assert.notEqual(classic.child.style.getPropertyValue('background-color'), '', 'modo tradicional continua disponível');
});

test('modo neural: modelo seleciona fundo cinza intermediário sem depender de limiar antigo', async () => {
  const always = {probability:()=>1};
  const page = await runPage({childBg:'rgb(125,125,125)', model:always,smartEnabled:true});
  assert.match(page.child.style.getPropertyValue('background-color'), /^rgb\(/);
});

test('rede não pode sobrescrever indicador saturado mesmo com alta confiança', async () => {
  const always = {probability:()=>1};
  const page = await runPage({childBg:'rgb(8,115,235)',childFg:'rgb(255,255,255)',model:always,smartEnabled:true});
  assert.equal(page.child.style.getPropertyValue('background-color'), '');
});

test('rede com confiança alta não escurece superfície já escura', async () => {
  const always = {probability:()=>1};
  const page = await runPage({childBg:'rgb(20,20,20)',childFg:'rgb(235,235,235)',model:always,smartEnabled:true});
  assert.equal(page.child.style.getPropertyValue('background-color'), '');
});


test('contexto semântico diferencia aba selecionada de botão normal com a mesma cor',async()=>{
  const model={probability(features){return features[6]===1 ? 0 : 1;}};
  const normal=await runPage({childBg:'rgb(190,190,190)',model,childSelected:false});
  const selected=await runPage({childBg:'rgb(190,190,190)',model,childSelected:true});
  assert.ok(normal.child.style.getPropertyValue('background-color'));
  assert.equal(selected.child.style.getPropertyValue('background-color'),'');
});

test('ícones com máscara CSS mantêm a cor original ao forçar modo escuro nativo', async () => {
  const always={probability:()=>1};
  for(const kind of ['maskImage','webkitMaskImage']){
    const page=await runPage({
      bg:'rgb(22,23,25)',fg:'rgb(235,235,235)',
      childBg:'rgb(240,240,240)',childFg:'rgb(12,12,12)',
      ignoreNativeDark:true,model:always,
      [kind]:'url("data:image/svg+xml,icon")'
    });
    assert.equal(page.root.attributes['data-extensao-dark'],'on');
    assert.equal(page.child.style.getPropertyValue('background-color'),'',
      `o ícone mascarado em ${kind} não pode receber um fundo escurecido`);
    assert.equal(page.child.style.getPropertyValue('color'),'',
      `o ícone mascarado em ${kind} não pode receber nova cor`);
  }
});

test('sem máscara CSS uma superfície clara continua sendo transformada', async () => {
  const page=await runPage({
    childBg:'rgb(240,240,240)',childFg:'rgb(12,12,12)',
    ignoreNativeDark:true,model:{probability:()=>1}
  });
  assert.match(page.child.style.getPropertyValue('background-color'),/^rgb\(/);
});


test('P1: motor protege ícones semanticamente sem bloquear cartões convencionais',async()=>{
  const neuralAlways={probability:()=>1};
  const base={model:neuralAlways,ignoreNativeDark:true,
    childBg:'rgb(245,245,245)',childFg:'rgb(10,10,10)'};
  const variants=[
    {childRole:'img'},
    {childClass:'sidebar-icon',childWidth:'24px',childHeight:'24px'},
    {childHasSvg:true,childWidth:'28px',childHeight:'28px'}
  ];
  for(const variant of variants){
    const {child}=await runPage({...base,...variant});
    assert.equal(child.style.getPropertyValue('background-color'),'',
      'ícone não pode receber preenchimento escuro');
    assert.equal(child.style.getPropertyValue('color'),'',
      'ícone não pode receber cor alterada');
  }
  const {child:card}=await runPage(base);
  assert.match(card.style.getPropertyValue('background-color'),/^rgb\(/,
    'cartão claro comum continua elegível para conversão');
});

test('P1: proteções semânticas continuam ativas com rede neural desligada',async()=>{
  const {child}=await runPage({smartEnabled:false,ignoreNativeDark:true,
    childRole:'img',childBg:'rgb(245,245,245)',childFg:'rgb(10,10,10)'});
  assert.equal(child.style.getPropertyValue('background-color'),'');
});

test('P4: confiança de 0.85 só permite conversão no modelo legado',async()=>{
  const base={childBg:'rgb(200,200,200)',childFg:'rgb(12,12,12)'};
  const legacy={MODEL:{input:7},probability:()=>.85};
  const candidate={MODEL:{input:18},probability:()=>.85};
  const oldPage=await runPage({...base,model:legacy});
  const newPage=await runPage({...base,model:candidate});
  assert.match(oldPage.child.style.getPropertyValue('background-color'),/^rgb\(/);
  assert.equal(newPage.child.style.getPropertyValue('background-color'),'');
  const strong=await runPage({...base,model:{MODEL:{input:18},probability:()=>.96}});
  assert.match(strong.child.style.getPropertyValue('background-color'),/^rgb\(/);
});

test('P4: candidato não modifica estados selecionados de controles',async()=>{
  const candidate={MODEL:{input:18},probability:()=>1};
  const page=await runPage({childBg:'rgb(220,220,220)',childFg:'rgb(12,12,12)',
    childRole:'tab',childSelected:true,model:candidate});
  assert.equal(page.child.style.getPropertyValue('background-color'),'');
});
