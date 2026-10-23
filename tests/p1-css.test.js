'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const colors = require('../content/colors.js');
const neural = require('../content/neural.js');

function page() {
  const callbacks=[], idle=[], observations=[], onSettings=[];
  let root;
  class Fragment {
    constructor(host) {this.host=host; this.nodeType=11;this.children=[];this.parentElement=null;}
    get isConnected(){return this.host.isConnected;}
    appendChild(node) {node.parentElement=this;this.children.push(node);emit('childList',this,{addedNodes:[node]});return node;}
    contains(el) {while(el){if(el===this)return true;el=el.parentElement;}return false;}
  }
  class El {
    constructor(tag='DIV', bg='rgba(0,0,0,0)',fg='rgb(15,15,15)'){
      this.nodeType=1;this.tagName=tag;this.defaultBg=bg;this.defaultFg=fg;
      this.children=[];this.parentElement=null;this.attributes=new Map();this.styles=new Map();
      this.shadowRoot=null;this.border=null;this.gradient=false;
      this.style={
        getPropertyValue:k=>this.styles.get(k)?.value || '',
        getPropertyPriority:k=>this.styles.get(k)?.priority || '',
        setProperty:(k,value,priority='')=>{this.styles.set(k,{value:String(value),priority});emit('attributes',this,{attributeName:'style'});},
        removeProperty:k=>{this.styles.delete(k);emit('attributes',this,{attributeName:'style'});}
      };
    }
    get isConnected(){if(this===root)return true;let p=this.parentElement;while(p){if(p===root)return true;p=p instanceof Fragment?p.host:p.parentElement;}return false;}
    get firstElementChild(){return this.children[0]||null;}
    getAttribute(k){return k==='style'?[...this.styles].map(([key,{value,priority}])=>`${key}:${value}${priority?' !'+priority:''}`).join(';'):(this.attributes.get(k)??null);}
    hasAttribute(k){return this.attributes.has(k);}
    setAttribute(k,v){this.attributes.set(k,String(v));emit('attributes',this,{attributeName:k});}
    removeAttribute(k){this.attributes.delete(k);emit('attributes',this,{attributeName:k});}
    appendChild(node){node.parentElement=this;this.children.push(node);emit('childList',this,{addedNodes:[node]});return node;}
    removeChild(node){this.children.splice(this.children.indexOf(node),1);node.parentElement=null;emit('childList',this,{removedNodes:[node]});}
    contains(el){while(el){if(el===this)return true;el=el.parentElement;}return false;}
    getRootNode(){let node=this;while(node.parentElement)node=node.parentElement;return node instanceof Fragment?node:{documentElement:root};}
    attachShadow({mode}){if(mode==='open')this.shadowRoot=new Fragment(this);else this.closedRoot=new Fragment(this);return this.shadowRoot||this.closedRoot;}
    closest(){return null;}
    remove(){this.parentElement?.removeChild(this);}
  }
  function emit(type,target,extra={}) {
    const record={type,target,addedNodes:[],removedNodes:[],...extra};
    for(const item of observations){if(!item.active)continue;
      for(const sub of item.targets){if(target!==sub.target && (!sub.opts.subtree||!sub.target.contains(target)))continue;
        if(type==='attributes' && (!sub.opts.attributes || (sub.opts.attributeFilter&&!sub.opts.attributeFilter.includes(extra.attributeName))))continue;
        if(type==='childList'&&!sub.opts.childList)continue;
        if(type==='characterData'&&!sub.opts.characterData)continue;
        callbacks.push(()=>item.callback([record]));break;
      }
    }
  }
  root=new El('HTML','rgb(250,250,250)');const body=root.appendChild(new El('BODY','rgb(250,250,250)'));
  const styleTag=body.appendChild(new El('STYLE'));
  let cssTokens={'--surface':'rgb(245,245,245)'};
  function resolveCss(el,value){const match=/^var\((--[\w-]+)\)$/.exec(value);if(!match)return value;
    let node=el;
    while(node){const val=node.style?.getPropertyValue(match[1]);if(val)return val;node=node.parentElement instanceof Fragment?node.parentElement.host:node.parentElement;}
    return cssTokens[match[1]]||'rgba(0,0,0,0)';
  }
  const doc={documentElement:root,body,readyState:'complete',createElement:tag=>new El(tag.toUpperCase()),addEventListener(){},
    createTreeWalker:parent=>{const nodes=[];function visit(el){for(const child of el.children||[]){if(child.nodeType===1)nodes.push(child);visit(child);}}visit(parent);let i=0;return {nextNode:()=>nodes[i++]??null};}
  };
  const world={document:doc,location:{protocol:'https:',hostname:'p1.test'},DarkExtensionColors:colors,DarkExtensionNeural:neural,
    Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get:async defaults=>defaults},onChanged:{addListener:fn=>onSettings.push(fn)}}},
    getComputedStyle:el=>{
      const s={ backgroundColor:resolveCss(el,el.style.getPropertyValue('background-color')||el.defaultBg),
        color:resolveCss(el,el.style.getPropertyValue('color')||el.defaultFg),
        backgroundImage:el.gradient?'linear-gradient(red,blue)':'none' };
      for(const side of ['Top','Right','Bottom','Left']){
        s[`border${side}Style`]=el.border?.style||'none';
        s[`border${side}Width`]=el.border?.width||'0px';
        s[`border${side}Color`]=resolveCss(el,el.style.getPropertyValue(`border-${side.toLowerCase()}-color`)||el.border?.color||'rgb(0,0,0)');
      }
      return s;
    },
    MutationObserver:class {constructor(callback){this.callback=callback;this.active=true;this.targets=[];observations.push(this);}
      observe(target,opts){this.active=true;this.targets.push({target,opts});}
      disconnect(){this.active=false;this.targets=[];}
    },requestIdleCallback:fn=>idle.push(fn),setTimeout:fn=>idle.push(fn)
  };world.globalThis=world;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),world);
  async function settle(){for(let i=0;i<8;i++)await Promise.resolve();for(let step=0;(callbacks.length||idle.length)&&step<1000;step++){
    if(callbacks.length)callbacks.shift()();else idle.shift()();
    if(step===999)throw Error('mutation loop');
  }}
  async function updateSettings(settings){for(const fn of onSettings){fn(Object.fromEntries(Object.entries(settings).map(([k,v])=>[k,{newValue:v}])), 'local');}await settle();}
  return {root,body,styleTag,El,settle,updateSettings,cssTokens,emit};
}

test('interpreta CSS var resolvido e reavalia quando stylesheet muda',async()=>{
  const p=page();const card=p.body.appendChild(new p.El('DIV','var(--surface)'));
  await p.settle();
  assert.notEqual(card.style.getPropertyValue('background-color'),'');
  p.cssTokens['--surface']='rgb(20,20,20)';
  p.emit('characterData', {parentElement:p.styleTag},{}) ;
  await p.settle();
  assert.equal(card.style.getPropertyValue('background-color'),'','CSS variable alterada por folha de estilo precisa atualizar o cartão');
});

test('converte borda clara somente se visível e preserva cor acentuada',async()=>{
  const p=page();const card=p.body.appendChild(new p.El('DIV','rgb(245,245,245)'));
  card.border={style:'solid',width:'1px',color:'rgb(220,220,220)'};
  const accent=p.body.appendChild(new p.El('DIV','rgb(245,245,245)'));
  accent.border={style:'solid',width:'1px',color:'rgb(8,115,235)'};
  const invisible=p.body.appendChild(new p.El('DIV','rgb(245,245,245)'));
  invisible.border={style:'none',width:'0px',color:'rgb(220,220,220)'};
  await p.settle();
  assert.match(card.style.getPropertyValue('border-top-color'),/^rgb\(/);
  assert.equal(accent.style.getPropertyValue('border-top-color'),'');
  assert.equal(invisible.style.getPropertyValue('border-top-color'),'');
  await p.updateSettings({enabled:false});
  assert.equal(card.style.getPropertyValue('border-top-color'),'');
});

test('processa um Shadow DOM aberto e preserva a herança de fundo do host',async()=>{
  const p=page();const host=new p.El('SECTION','rgb(245,245,245)');
  const shadow=host.attachShadow({mode:'open'});
  const child=shadow.appendChild(new p.El('SPAN','rgba(0,0,0,0)','rgb(5,5,5)'));
  p.body.appendChild(host);await p.settle();
  assert.notEqual(host.style.getPropertyValue('background-color'),'');
  assert.match(child.style.getPropertyValue('color'),/^rgb\(/,'texto herdado deve ficar legível no host escurecido');
  await p.updateSettings({enabled:false});
  assert.equal(child.style.getPropertyValue('color'),'');
});

test('observa mudanças dentro do Shadow DOM e remove estilos de nós retirados',async()=>{
  const p=page();const host=new p.El('SECTION','rgb(245,245,245)');
  const shadow=host.attachShadow({mode:'open'});
  p.body.appendChild(host);await p.settle();
  const card=shadow.appendChild(new p.El('DIV','rgb(245,245,245)'));
  await p.settle();
  assert.notEqual(card.style.getPropertyValue('background-color'),'','nó inserido depois precisa ser processado');
  shadow.children.splice(shadow.children.indexOf(card),1);card.parentElement=null;
  p.emit('childList',shadow,{removedNodes:[card]});await p.settle();
  assert.equal(card.style.getPropertyValue('background-color'),'','estilos devem ser restaurados ao sair do DOM');
});

test('raízes fechadas permanecem intocadas',async()=>{
  const p=page();const host=new p.El('SECTION','rgb(245,245,245)');
  const closed=host.attachShadow({mode:'closed'});
  const child=closed.appendChild(new p.El('DIV','rgb(245,245,245)'));
  p.body.appendChild(host);await p.settle();
  assert.equal(child.style.getPropertyValue('background-color'),'');
});

test('muda variável CSS no host sem sobrescrever a propriedade customizada',async()=>{
  const p=page();
  const card=p.body.appendChild(new p.El('DIV','var(--surface)'));
  p.root.style.setProperty('--surface','rgb(240,240,240)');
  await p.settle();
  assert.notEqual(card.style.getPropertyValue('background-color'),'');
  p.root.style.setProperty('--surface','rgb(24,24,24)');
  await p.settle();
  assert.equal(card.style.getPropertyValue('background-color'),'');
  assert.equal(p.root.style.getPropertyValue('--surface'),'rgb(24,24,24)');
});

test('mudança de CSS dentro de Shadow DOM aberto reavalia os elementos internos',async()=>{
  const p=page(); const host=new p.El('SECTION','rgb(245,245,245)');
  const shadow=host.attachShadow({mode:'open'});
  const style=shadow.appendChild(new p.El('STYLE'));
  const child=shadow.appendChild(new p.El('DIV','var(--surface)'));
  p.body.appendChild(host);await p.settle();
  assert.notEqual(child.style.getPropertyValue('background-color'),'');
  p.cssTokens['--surface']='rgb(22,22,22)';
  p.emit('characterData',{parentElement:style},{});
  await p.settle();
  assert.equal(child.style.getPropertyValue('background-color'),'');
});

test('remover um host limpa estilos aplicados dentro do Shadow DOM',async()=>{
  const p=page();const host=new p.El('SECTION','rgb(245,245,245)');
  const shadow=host.attachShadow({mode:'open'});
  const child=shadow.appendChild(new p.El('DIV','rgb(245,245,245)'));
  p.body.appendChild(host);await p.settle();
  assert.notEqual(child.style.getPropertyValue('background-color'),'');
  p.body.removeChild(host);await p.settle();
  assert.equal(child.style.getPropertyValue('background-color'),'');
});
