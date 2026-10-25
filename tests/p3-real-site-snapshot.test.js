'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EXPRESSION,summarize}=require('../scripts/real-site-snapshot.js');
test('P3: coleta apenas cores e quantidades, nunca texto do DOM',()=>{
  assert.doesNotMatch(EXPRESSION,/\.textContent|\.innerText|\.value\b|localStorage|document\.cookie/);
  assert.match(EXPRESSION,/getComputedStyle/);
  const summary=summarize({landingUrl:'https://example.com/',totalElements:100,
    extensionActive:true,changedBackgrounds:12,
    sampled:[{fg:'rgb(20,20,20)',bg:'rgb(22,22,22)',font:'14px',weight:'400',
      privateText:'documento privado'}],masked:[
      {fg:'rgb(30,30,30)',bg:'rgb(22,22,22)',password:'não coletar'}]});
  assert.equal(summary.weakText,1);
  assert.equal(summary.weakIcons,1);
  assert.equal(summary.sampledText,1);
  assert.equal(summary.maskedIcons,1);
  assert.doesNotMatch(JSON.stringify(summary),/documento privado|não coletar/);
});
test('P3: texto grande e ícones claros aprovam contraste sem inventar medições',()=>{
  const summary=summarize({landingUrl:'https://example.com/',totalElements:7,
    extensionActive:true,changedBackgrounds:0,sampled:[
      {fg:'rgb(150,150,150)',bg:'rgb(20,20,20)',font:'26px',weight:'400'},
      {fg:'rgb(230,230,230)',bg:'rgb(20,20,20)',font:'15px',weight:'700'}],
    masked:[{fg:'rgb(240,240,240)',bg:'rgb(20,20,20)'}]});
  assert.equal(summary.weakText,0);
  assert.equal(summary.weakIcons,0);
  assert.throws(()=>summarize({}),/inválida/);
});

test('Auditoria: evidência de tema nativo é resumida sem capturar atributos privados',()=>{
  const r=summarize({landingUrl:'https://example.com/',totalElements:20,
    extensionActive:false,nativeDarkDetected:true,changedBackgrounds:0,
    sampled:[{fg:'rgb(200,200,200)',bg:'rgb(12,12,12)',font:'14px',weight:'400'}],masked:[]});
  assert.equal(r.nativeDarkDetected,true);
  assert.equal(r.extensionActive,false);
});
