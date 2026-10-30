'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// The test uses only protected SCRIPT placeholders; it isolates the traversal
// and mutation scheduler without touching page data, neural weights or CSS.
test('P14 mutation storms cannot rewind an active full-document styling scan',async()=>{
  const fast=[],idle=[],attrs={},walkers=[],monitors=[];
  const nodes=Array.from({length:900},()=>({
    nodeType:1,tagName:'SCRIPT',isConnected:true,getAttribute:()=>null
  }));
  const root={
    nodeType:1,tagName:'HTML',isConnected:true,
    style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty(){},removeProperty(){}},
    getAttribute:k=>attrs[k]||null,
    setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},
    hasAttribute:()=>false,appendChild(){},closest:()=>null
  };
  const document={
    documentElement:root,readyState:'complete',body:null,
    createElement:tag=>({tagName:tag.toUpperCase(),remove(){},textContent:''}),
    createTreeWalker:node=>{
      const walker={count:0,nextNode:()=>null};
      if(node===root){
        let i=0;
        walker.nextNode=()=>{walker.count++;return nodes[i++]||null;};
        walkers.push(walker);
      }
      return walker;
    },
    addEventListener(){}
  };
  const sandbox={
    document,location:{protocol:'https:',hostname:'example.com'},
    chrome:{storage:{local:{get:async defaults=>defaults},onChanged:{addListener(){}}}},
    Node:{ELEMENT_NODE:1},NodeFilter:{SHOW_ELEMENT:1},
    MutationObserver:class{
      constructor(callback){this.callback=callback;}
      observe(target,options){monitors.push({callback:this.callback,options});}
      disconnect(){}
    },
    getComputedStyle:()=>({backgroundColor:'rgba(0,0,0,0)',color:'rgb(30,30,30)'}),
    setTimeout:callback=>fast.push(callback),
    requestIdleCallback:(callback,options)=>idle.push({callback,options}),
    DarkExtensionColors:{
      isEnabledForFrame:()=>true,parseColor:()=>null,
      isNativeDarkSurface:()=>false,visualContext:()=>({action:'preserve'})
    }
  };
  sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(
    path.join(__dirname,'../content/content.js'),'utf8'),sandbox);
  await Promise.resolve();await Promise.resolve();
  assert.equal(attrs['data-extensao-dark'],'on');
  assert.equal(walkers.length,1);
  fast.shift()(); // First 160 elements, including the root.
  const initialProgress=walkers[0].count;
  assert.ok(initialProgress>100,'first slice should advance the walker');
  const styleObserver=monitors.find(entry=>entry.options.attributeFilter?.includes('href'));
  assert.ok(styleObserver,'style mutation observer should be active');
  // Force root re-evaluation while it is still being traversed.
  styleObserver.callback([{type:'attributes',target:root,attributeName:'class'}]);
  assert.equal(walkers.length,1,'attribute mutation must not rewind active walker');
  // Many new nodes used to overflow the root queue and restart everything.
  const additions=Array.from({length:45},()=>({
    nodeType:1,tagName:'SCRIPT',isConnected:true,getAttribute:()=>null
  }));
  styleObserver.callback([{type:'childList',target:root,removedNodes:[],addedNodes:additions}]);
  assert.equal(walkers.length,1,'queue overflow must preserve scan progress');
  for(let i=0;i<100&&(fast.length||idle.length);i++){
    if(fast.length)fast.shift()();
    else idle.shift().callback();
  }
  assert.equal(walkers[0].count,nodes.length+1,
    'the first scan must finish before a rescan is created');
  assert.equal(walkers.length,2,'overlapping mutations should coalesce to one rescan');
  assert.equal(walkers[1].count,nodes.length+1,'rescan must finish too');
  assert.equal(fast.length+idle.length,0,'queue must eventually become idle');
});
