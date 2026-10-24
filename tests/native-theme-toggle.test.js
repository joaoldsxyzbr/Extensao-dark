'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const colors = require('../content/colors.js');
const neural = require('../content/neural.js');

function browserHarness(initialDark = false, initialSettings = {}) {
  const listeners = new Map();
  const timers = [];
  const observers = [];
  const styles = [];
  let storageChangeListener;
  function element(tag, bg, fg) {
    const attributes = new Map();
    const css = new Map();
    return {
      tagName: tag, nodeType: 1, isConnected: true, parentElement: null,
      sourceBackground: bg, sourceColor: fg, firstElementChild: null,
      style: {
        getPropertyValue: key => css.get(key)?.value || '',
        getPropertyPriority: key => css.get(key)?.priority || '',
        setProperty: (key, value, priority) => css.set(key, {value, priority}),
        removeProperty: key => css.delete(key)
      },
      setAttribute(key, value) {attributes.set(key, String(value));},
      removeAttribute(key) {attributes.delete(key);},
      hasAttribute: key => attributes.has(key),
      getAttribute: key => attributes.get(key) ?? null,
      appendChild(node) {styles.push(node);}, closest: () => null
    };
  }
  const root = element('HTML','rgb(250,250,250)','rgb(12,12,12)');
  const body = element('BODY','rgb(250,250,250)','rgb(12,12,12)');
  body.parentElement = root;
  if (initialDark) root.setAttribute('dark', '');
  root.firstElementChild = body;
  const doc={documentElement:root,body,readyState:'complete',
    addEventListener(name,cb) {listeners.set(name,cb);},
    createElement() {return {remove(){}};},
    createTreeWalker() {return {nextNode:()=>null};}
  };
  const world={document:doc,location:{hostname:'www.youtube.com',protocol:'https:'},
    DarkExtensionColors:colors,DarkExtensionNeural:neural,
    Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get:async defaults=>({...defaults,...initialSettings})},
      onChanged:{addListener(listener){storageChangeListener=listener;}}}},
    getComputedStyle: el=>({backgroundColor:el.style.getPropertyValue('background-color')||el.sourceBackground,
      color:el.style.getPropertyValue('color')||el.sourceColor,
      backgroundImage:'none',colorScheme:'light'}),
    MutationObserver:class {constructor(cb){this.cb=cb;this.active=false;observers.push(this);}
      observe() {this.active=true;} disconnect(){this.active=false;}},
    requestIdleCallback:cb=>timers.push(cb),setTimeout:cb=>timers.push(cb)
  };
  world.globalThis=world;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),world);
  async function settle() {for(let i=0;i<4;i++) await Promise.resolve();while(timers.length)timers.shift()();}
  async function updateAttribute(key, value) {
    if(value==null)root.removeAttribute(key);else root.setAttribute(key,value);
    for(const observer of observers.filter(o=>o.active)) observer.cb([{type:'attributes',target:root,attributeName:key,addedNodes:[]}]);
    await settle();
  }
  async function updateSettings(values) {
    storageChangeListener(Object.fromEntries(
      Object.entries(values).map(([key, newValue]) => [key, {newValue}])
    ), 'local');
    await settle();
  }
  return {root,body,styles,settle,updateAttribute,updateSettings};
}

test('YouTube em tema nativo escuro desde o início não recebe CSS da extensão', async () => {
  const page=browserHarness(true);await page.settle();
  assert.equal(page.root.hasAttribute('data-extensao-dark'),false);
  assert.equal(page.body.style.getPropertyValue('color'),'');
});

test('quando o YouTube muda para dark depois de carregar, restaura estilos; volta quando sai de dark', async () => {
  const page=browserHarness(false);await page.settle();
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true);
  await page.updateAttribute('dark','');
  assert.equal(page.root.hasAttribute('data-extensao-dark'),false,'restaura imediatamente ao ativar o tema nativo');
  assert.equal(page.body.style.getPropertyValue('color'),'');
  await page.updateAttribute('dark',null);
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true,'ativa novamente quando volta ao tema claro');
});

test('preferência global aplica o tema em sites com dark nativo', async () => {
  const page=browserHarness(true,{ignoreNativeDark:true}); await page.settle();
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true);
  assert.match(page.styles.at(-1).textContent,/html\[data-extensao-dark="on"\] body/);
  assert.match(page.styles.at(-1).textContent,/#17191c/);
});

test('ligar e desligar preferência global em site escuro funciona sem recarregar', async () => {
  const page=browserHarness(true);await page.settle();
  assert.equal(page.root.hasAttribute('data-extensao-dark'),false);
  await page.updateSettings({ignoreNativeDark:true});
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true);
  await page.updateSettings({ignoreNativeDark:false});
  assert.equal(page.root.hasAttribute('data-extensao-dark'),false);
});

test('alterar tema nativo não suspende a extensão ao ignorá-lo', async () => {
  const page=browserHarness(false,{ignoreNativeDark:true});await page.settle();
  await page.updateAttribute('dark','');
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true);
  await page.updateAttribute('dark',null);
  assert.equal(page.root.hasAttribute('data-extensao-dark'),true);
});

test('configuração global respeita exceção do site e a paleta selecionada', async () => {
  const blocked=browserHarness(true,{ignoreNativeDark:true,disabledHosts:['www.youtube.com']});
  await blocked.settle();
  assert.equal(blocked.root.hasAttribute('data-extensao-dark'),false);
  const active=browserHarness(true,{ignoreNativeDark:true,theme:'amoled'});
  await active.settle();
  assert.equal(active.root.hasAttribute('data-extensao-dark'),true);
  assert.match(active.styles.at(-1).textContent,/background-color: #000000 !important/);
});
