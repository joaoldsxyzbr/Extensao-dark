'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ratio,verify,PAGES}=require('../scripts/qa-site-browser.js');

test('P9: paginas de QA são locais, autorais e têm os contratos observados no Chromium',()=>{
  assert.deepEqual(PAGES,['commerce','workspace']);
  for(const id of PAGES){
    const html=fs.readFileSync(path.join(__dirname,'qa-pages',id+'.html'),'utf8');
    for(const fragment of ['id="qa-panel"','id="qa-accent"','id="qa-mask"','id="qa-image"',
      'window.qaMutate','window.qaNativeDark','window.__fixtureReady=true'])
      assert.ok(html.includes(fragment),id+': contrato ausente: '+fragment);
    assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/i,'QA não deve carregar recursos externos');
    assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  }
});

test('P9: teste de qualidade rejeita regressões e não confunde estado nativo com extensão ativa',()=>{
  const blue={background:'rgb(12, 108, 220)',color:'rgb(255, 255, 255)'};
  const mask={background:'rgb(240, 240, 240)',color:'rgb(0, 0, 0)'};
  const plain={
    initial:{active:false,panel:{background:'rgb(247, 247, 247)',color:'rgb(24, 24, 24)'},
      accent:blue,mask,imageSource:'data:image/svg+xml,x'},
    native:{panel:{background:'rgb(48, 50, 54)',color:'rgb(237, 237, 237)'}}
  };
  const ours={
    initial:{active:true,panel:{background:'rgb(24, 24, 24)',color:'rgb(238, 238, 238)'},
      accent:blue,mask,imageSource:'data:image/svg+xml,x'},
    dynamic:{live:{background:'rgb(24, 24, 24)',color:'rgb(238, 238, 238)'},selected:'true'},
    native:{active:false,panel:plain.native.panel}
  };
  assert.ok(ratio(ours.initial.panel)>4.5);
  assert.doesNotThrow(()=>verify('fixture',plain,ours));
  assert.throws(()=>verify('fixture',plain,{...ours,
    initial:{...ours.initial,accent:{...blue,background:'rgb(40, 40, 40)'}}}),/destaque saturado/);
  assert.throws(()=>verify('fixture',plain,{...ours,native:{...ours.native,active:true}}),/modo escuro nativo/);
  assert.throws(()=>verify('fixture',plain,{...ours,dynamic:{...ours.dynamic,
    live:{background:'rgb(255, 255, 255)',color:'rgb(255, 255, 255)'}}}),/contraste insuficiente/);
});
