'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('botão global salva a preferência mesmo numa aba sem domínio HTTP', async () => {
  const html = fs.readFileSync(path.join(__dirname,'../popup/index.html'),'utf8');
  assert.match(html,/id="ignore-native-dark"/);
  const elements=new Map(),saved=[];
  function element(id) {
    if(!elements.has(id))elements.set(id,{
      id,checked:false,disabled:false,textContent:'',dataset:{},listeners:new Map(),
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(event,handler){this.listeners.set(event,handler);},
      setAttribute(){}
    });
    return elements.get(id);
  }
  const world={
    document:{getElementById:element,querySelectorAll:()=>[]},
    chrome:{
      storage:{local:{get:async defaults=>defaults,set:async data=>saved.push(data)},onChanged:{addListener(){}}},
      tabs:{query:async()=>[{url:'chrome://extensions'}]},
      runtime:{getManifest:()=>({version:'0.6.0'})}
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8'),world);
  for(let i=0;i<5;i++)await Promise.resolve();
  const toggle=element('ignore-native-dark');
  assert.equal(toggle.checked,false);
  assert.equal(toggle.disabled,false);
  assert.equal(element('extension-version').textContent,' · v0.6.0');
  toggle.checked=true;
  toggle.listeners.get('change')();
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)),[{ignoreNativeDark:true}]);
  assert.equal(toggle.checked,true);
});
