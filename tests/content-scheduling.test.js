'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// All 1300 descendants are protected SCRIPT placeholders. This isolates the
// work-queue scheduler without emulating real CSS, neural weights or pages.
test('P14 initial paint: first eight bounded slices run promptly, later work idles',async()=>{
  const fast=[],idle=[],attrs={};
  const child=Array.from({length:1300},()=>({
    nodeType:1,tagName:'SCRIPT',isConnected:true,getAttribute:()=>null
  }));
  const root={
    nodeType:1,tagName:'HTML',isConnected:true,
    style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty(){},removeProperty(){}},
    getAttribute:key=>attrs[key]||null,
    setAttribute(key,value){attrs[key]=value;},
    removeAttribute(key){delete attrs[key];},
    hasAttribute:()=>false,appendChild(){},closest:()=>null
  };
  const document={
    documentElement:root,readyState:'complete',body:null,
    createElement:tag=>({tagName:tag.toUpperCase(),remove(){},textContent:''}),
    createTreeWalker:()=>{let i=0;return {nextNode:()=>child[i++]||null};},
    addEventListener(){}
  };
  const colors={
    isEnabledForFrame:()=>true,parseColor:()=>null,isNativeDarkSurface:()=>false,
    visualContext:()=>({action:'preserve'})
  };
  const sandbox={
    document,location:{protocol:'https:',hostname:'example.com'},
    chrome:{storage:{local:{get:async d=>d},onChanged:{addListener(){}}}},
    Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    MutationObserver:class{observe(){}disconnect(){}},
    getComputedStyle:()=>({backgroundColor:'rgba(0,0,0,0)',color:'rgb(30,30,30)'}),
    setTimeout:callback=>fast.push(callback),
    requestIdleCallback:callback=>idle.push(callback),
    DarkExtensionColors:colors
  };
  sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(
    path.join(__dirname,'../content/content.js'),'utf8'),sandbox);
  await Promise.resolve();await Promise.resolve();
  assert.equal(attrs['data-extensao-dark'],'on');
  assert.equal(fast.length,1,'startup must not wait for idle callback');
  for(let i=0;i<8;i++){
    const callback=fast.shift();
    assert.equal(typeof callback,'function','startup fast slice '+i);
    callback();
  }
  assert.equal(fast.length,0,'do not keep using rapid slices indefinitely');
  assert.equal(idle.length,1,'remaining work must yield to browser idle time');
  idle.shift()();
  assert.equal(idle.length,0,'last slice should drain remaining work');
});
