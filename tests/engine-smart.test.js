'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const colors = require('../content/colors.js');
const neural = require('../content/neural.js');

function mockElement(tag, baseBackground, baseText, backgroundImage='none') {
  const state=new Map();
  const node = {
    nodeType:1,tagName:tag,isConnected:true,parentElement:null, firstElementChild:null,
    sourceBackground:baseBackground,sourceText:baseText,backgroundImage,
    style: {
      getPropertyValue: key=>state.get(key)?.value??'',
      getPropertyPriority: key=>state.get(key)?.priority??'',
      setProperty: (key,value,priority)=>state.set(key,{value,priority}),
      removeProperty: key=>state.delete(key)
    },
    closest:()=>null,
    attributes:{},
    setAttribute(key,value){this.attributes[key]=value;},
    removeAttribute(key){delete this.attributes[key];},
    appendChild(child){this.child=child;},
    remove(){}
  };
  return node;
}
async function runPage({bg='rgb(255,255,255)',fg='rgb(10,10,10)',childBg='rgb(150,150,150)',childFg='rgb(12,12,12)',backgroundImage='none',smartEnabled=true}) {
  const root=mockElement('HTML',bg,fg),body=mockElement('BODY',bg,fg),child=mockElement('DIV',childBg,childFg,backgroundImage);
  body.parentElement=root;child.parentElement=body;root.firstElementChild=body;body.firstElementChild=child;
  const nodes=[root,body,child];
  const pending=[];
  const d={documentElement:root,body,readyState:'complete',createElement:()=>({textContent:'',remove(){}}),
    createTreeWalker:()=>{let i=0;return {nextNode:()=>nodes[++i]??null};},addEventListener(){}
  };
  const world={document:d, location:{protocol:'https:',hostname:'test.example'},
    DarkExtensionColors:colors,DarkExtensionNeural:neural, Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get: async defaults=>({...defaults,smartEnabled})},onChanged:{addListener(){}}}},
    getComputedStyle:node=>({
      backgroundColor:node.style?.getPropertyValue('background-color') || node.sourceBackground,
      color:node.style?.getPropertyValue('color') || node.sourceText,
      backgroundImage:node.backgroundImage||'none'
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
