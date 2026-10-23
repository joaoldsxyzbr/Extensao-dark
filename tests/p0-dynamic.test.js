'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const colors = require('../content/colors.js');
const neural = require('../content/neural.js');

function makePage() {
  const callbacks = [];
  const scheduled = [];
  const activeObservers = [];
  const storageListeners = [];
  const document = {};
  let appliedWrites = 0;
  function dispatch(type, target, data={}) {
    const record = {type,target,addedNodes:[],removedNodes:[],...data};
    for (const entry of activeObservers) {
      if (!entry.enabled) continue;
      for (const observed of entry.targets) {
        const matches = target === observed.target || (observed.options.subtree && observed.target.contains(target));
        if (!matches) continue;
        if (type==='attributes' && (!observed.options.attributes || (observed.options.attributeFilter && !observed.options.attributeFilter.includes(record.attributeName)))) continue;
        if (type==='childList' && !observed.options.childList) continue;
        callbacks.push(()=>entry.cb([record]));
        break;
      }
    }
  }
  class FakeElement {
    constructor(tag,bg='rgb(250,250,250)',fg='rgb(10,10,10)') {
      this.nodeType=1; this.tagName=tag; this.parentElement=null;this.children=[];this.attributes=new Map();
      this.defaultBg=bg;this.defaultFg=fg;this.alternateBg=null;
      this.styleValues = new Map();
      this.style={
        getPropertyValue:k=>this.styleValues.get(k)?.value || '',
        getPropertyPriority:k=>this.styleValues.get(k)?.priority || '',
        setProperty:(k,v,p='')=>{this.styleValues.set(k,{value:String(v),priority:p}); appliedWrites++;dispatch('attributes',this,{attributeName:'style'});},
        removeProperty:k=>{this.styleValues.delete(k); appliedWrites++;dispatch('attributes',this,{attributeName:'style'});}
      };
    }
    get isConnected() {if(this===root)return true;let p=this.parentElement;while(p){if(p===root)return true;p=p.parentElement;}return false;}
    get firstElementChild(){return this.children[0] || null;}
    getAttribute(name){if(name==='style')return [...this.styleValues].map(([k,v])=>k+':'+v.value+(v.priority?' !'+v.priority:'')).join(';');return this.attributes.get(name)??null;}
    hasAttribute(name){return this.attributes.has(name);}
    setAttribute(name,value){this.attributes.set(name,String(value));dispatch('attributes',this,{attributeName:name});}
    removeAttribute(name){this.attributes.delete(name);dispatch('attributes',this,{attributeName:name});}
    contains(other){let p=other;while(p){if(p===this)return true;p=p.parentElement;}return false;}
    appendChild(node){node.parentElement=this;this.children.push(node);dispatch('childList',this,{addedNodes:[node]});return node;}
    removeChild(node){const idx=this.children.indexOf(node);if(idx<0)throw Error('missing child');this.children.splice(idx,1);node.parentElement=null;dispatch('childList',this,{removedNodes:[node]});return node;}
    remove(){if(this.parentElement)this.parentElement.removeChild(this);}
    closest(){return null;}
  }
  const root = new FakeElement('HTML');
  const body = new FakeElement('BODY');
  root.appendChild(body);
  document.documentElement=root;document.body=body;document.readyState='complete';
  document.createElement=()=>new FakeElement('STYLE','rgba(0,0,0,0)','rgb(230,230,230)');
  document.createTreeWalker=origin=>{
    const nodes=[];
    function visit(el){for (const child of el.children){nodes.push(child);visit(child);}}
    visit(origin);let index=0;
    return {nextNode:()=>nodes[index++]||null};
  };
  document.addEventListener=()=>{};
  const world={document,location:{hostname:'example.test',protocol:'https:'},DarkExtensionColors:colors,DarkExtensionNeural:neural,
    Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get:async defaults=>defaults},onChanged:{addListener(fn){storageListeners.push(fn);}}}},
    getComputedStyle(el){return {backgroundColor:el.style.getPropertyValue('background-color') || (el.alternateBg&&(el.hasAttribute('class')||el.hasAttribute('data-state'))?el.alternateBg:el.defaultBg),color:el.style.getPropertyValue('color')||el.defaultFg,backgroundImage:'none'};},
    MutationObserver:class {constructor(cb){this.cb=cb;this.enabled=true;this.targets=[];activeObservers.push(this);}observe(target,options){this.targets.push({target,options});this.enabled=true;}disconnect(){this.enabled=false;this.targets=[];}},
    requestIdleCallback:cb=>scheduled.push(cb),setTimeout:cb=>scheduled.push(cb)
  };world.globalThis=world;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),world);
  async function settle(limit=1000) {
    for(let i=0;i<10;i++)await Promise.resolve();
    let cycles=0;
    while(callbacks.length || scheduled.length) {
      if(++cycles > limit) throw new Error('possible mutation feedback loop');
      if(callbacks.length)callbacks.shift()();else scheduled.shift()();
    }
    return cycles;
  }
  async function settings(changes) {
    const normalized=Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,{newValue:value}]));
    for (const fn of storageListeners) fn(normalized,'local');
    await settle();
  }
  return {root,body,FakeElement,settle,settings,get writes(){return appliedWrites}};
}

test('reavalia classe de um elemento e restaura estilo obsoleto, preservando nova cor acentuada',async()=>{
  const p=makePage();const element=p.body.appendChild(new p.FakeElement('DIV'));
  element.alternateBg='rgb(8,115,235)';
  await p.settle();
  assert.notEqual(element.style.getPropertyValue('background-color'),'');
  element.setAttribute('class','selected');
  await p.settle();
  assert.equal(element.style.getPropertyValue('background-color'),'','seleção azul nativa não deve ficar escurecida');
  element.removeAttribute('class');
  await p.settle();
  assert.notEqual(element.style.getPropertyValue('background-color'),'','ao sair da seleção o fundo claro volta a escurecer');
});

test('mudança inline do site prevalece e é preservada ao desligar extensão',async()=>{
  const p=makePage();const el=p.body.appendChild(new p.FakeElement('DIV'));
  await p.settle();
  el.style.setProperty('background-color','rgb(245,245,245)');
  await p.settle();
  assert.notEqual(el.style.getPropertyValue('background-color'),'rgb(245,245,245)','o site alterou a cor; deve haver recalculo');
  el.style.setProperty('background-color','rgb(8,115,235)');
  await p.settle();
  assert.equal(el.style.getPropertyValue('background-color'),'rgb(8,115,235)','destaque azul do site não deve ser substituído');
  await p.settings({enabled:false});
  assert.equal(el.style.getPropertyValue('background-color'),'rgb(8,115,235)','desativar extensão preserva estilo recente do site');
});

test('50 subárvores adicionadas na mesma atualização não são perdidas na fila',async()=>{
  const p=makePage();await p.settle();
  const list=[];
  for(let i=0;i<50;i++)list.push(p.body.appendChild(new p.FakeElement('DIV')));
  await p.settle();
  assert.notEqual(list.at(-1).style.getPropertyValue('background-color'),'','o último elemento foi descartado');
  assert.ok(list.every(node=>node.style.getPropertyValue('background-color')));
});

test('elementos removidos são restaurados e podem ser reinseridos sem estilo antigo',async()=>{
  const p=makePage();const el=p.body.appendChild(new p.FakeElement('DIV'));
  await p.settle();
  assert.notEqual(el.style.getPropertyValue('background-color'),'');
  p.body.removeChild(el);await p.settle();
  assert.equal(el.style.getPropertyValue('background-color'),'','deve liberar modificações de elementos removidos');
  el.alternateBg='rgb(8,115,235)';el.setAttribute('class','highlight');
  p.body.appendChild(el);await p.settle();
  assert.equal(el.style.getPropertyValue('background-color'),'');
});

test('mutação de estilo causada pelo motor não cria loop infinito',async()=>{
  const p=makePage();p.body.appendChild(new p.FakeElement('DIV'));
  const cycles=await p.settle(250);
  assert.ok(cycles<120,'processamento em loop ('+cycles+' ciclos)');
});


test('atualiza estados declarativos (data-state) sem mudança de classe',async()=>{
  const p=makePage();const el=p.body.appendChild(new p.FakeElement('DIV'));
  el.alternateBg='rgb(8,115,235)';
  await p.settle();
  assert.notEqual(el.style.getPropertyValue('background-color'),'');
  el.setAttribute('data-state','selected');
  await p.settle();
  assert.equal(el.style.getPropertyValue('background-color'),'');
});


test('reativar não perde nós novos por callback ocioso de geração anterior',async()=>{
  const p=makePage(); await p.settle();
  const el=p.body.appendChild(new p.FakeElement('DIV'));
  // Ainda existe uma tarefa ociosa pendente da geração anterior.
  p.root.setAttribute('data-extensao-dark','on');
  await p.settings({enabled:false});
  await p.settings({enabled:true});
  assert.notEqual(el.style.getPropertyValue('background-color'),'');
});
