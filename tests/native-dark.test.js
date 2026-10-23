'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const colors = require('../content/colors.js');

test('identifica superfícies escuras com texto claro, mas não áreas claras', () => {
  assert.equal(colors.isNativeDarkSurface('rgb(35,35,35)', 'rgb(235,235,235)'), true);
  assert.equal(colors.isNativeDarkSurface('rgb(245,245,245)', 'rgb(25,25,25)'), false);
  assert.equal(colors.isNativeDarkSurface('rgba(0,0,0,0)', 'rgb(235,235,235)'), false);
  assert.equal(colors.isNativeDarkSurface('rgb(45,45,45)', 'rgb(20,20,20)'), false);
});

function simulatePage(dark) {
  const listeners = {};
  let writes = 0;
  const root = {
    nodeType:1,tagName:'HTML',isConnected:true,closest:()=>null,
    style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>writes++,removeProperty:()=>{}},
    appendChild:()=>writes++,setAttribute:()=>writes++,removeAttribute:()=>writes++
  };
  const body = {nodeType:1,tagName:'BODY',isConnected:true,closest:()=>null,
    style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>writes++,removeProperty:()=>{}},
    firstElementChild:null};
  const document = {
    documentElement:root,body,readyState:'complete',
    addEventListener:(event,callback)=>listeners[event]=callback,
    createElement:()=>({id:'',textContent:'',remove(){}}),
    createTreeWalker:()=>({nextNode:()=>null})
  };
  const runtime = {document,location:{protocol:'https:',hostname:'chat.example'},
    DarkExtensionColors:colors,Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    chrome:{storage:{local:{get:async obj=>obj},onChanged:{addListener(){}}}},
    getComputedStyle:(el)=>({backgroundColor: dark ? 'rgb(35,35,35)' : 'rgb(255,255,255)',color:dark?'rgb(235,235,235)':'rgb(20,20,20)'}),
    MutationObserver:class{observe(){} disconnect(){}},requestIdleCallback() {},setTimeout(){}};
  runtime.globalThis=runtime;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),runtime);
  return {get writes(){return writes;},root};
}

test('não altera páginas que já possuem contraste de tema escuro',async()=>{
  const page=simulatePage(true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(page.writes,0, 'uma página já escura deve ficar inteiramente intacta');
});

test('continua processando páginas claras',async()=>{
  const page=simulatePage(false);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(page.writes>0,'página clara deve receber estilização');
});
