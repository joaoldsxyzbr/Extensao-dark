'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const {CAPTURE_SOURCE,EXPRESSION}=require('../scripts/p9-live-feature-snapshot.js');
const {analyze,validateSample,safeOutput}=require('../scripts/p9-real-site-shadow.js');
const root=path.resolve(__dirname,'..');

const sample=(reasons=[])=>({x:Array(57).fill(.2),reasons});
const converted=()=>({action:'convert',confidence:.99,
  background:'rgb(18, 22, 27)',color:'rgb(238, 241, 246)'});
const preserved=()=>({action:'preserve',confidence:.12});

test('P9: coletor examina apenas CSS, sem capturar texto, entrada, atributos ou URLs',()=>{
  assert.match(CAPTURE_SOURCE,/getComputedStyle|advancedContextFeatures|visualContext/);
  assert.doesNotMatch(CAPTURE_SOURCE,/\.textContent|\.innerText|\.innerHTML|\.value\b|document\.cookie|localStorage|sessionStorage|fetch\s*\(/);
  assert.doesNotMatch(CAPTURE_SOURCE,/\.href\b|\.outerHTML\b|\.dataset\b/);
  assert.match(EXPRESSION,/const module=\{exports:\{\}\}/);
  assert.equal(require('../manifest.json').content_scripts[0].js
    .some(name=>name.includes('p9-')),false);
});

test('P9: violacoes de seguranca incluem controle desabilitado, selecionado e grafismo',()=>{
  const cases=[sample(['selected']),sample(['disabled']),sample(['graphic','decorated']),sample([])];
  const r=analyze(cases,{p7:converted,p8:preserved});
  assert.equal(r.samples,4);
  assert.equal(r.protected,3);
  assert.equal(r.models.p7.protectedConversions,3);
  assert.equal(r.models.p8.protectedConversions,0);
  assert.equal(r.models.p7.protectedByReason.graphic,1);
  assert.equal(r.models.p7.protectedByReason.selected,1);
  assert.equal(r.models.p7.protectedByReason.disabled,1);
  assert.equal(r.models.p7.lowContrastConversions,0);
  assert.equal(r.disagreements,4);
});

test('P9: verifica contraste das propostas sem aplicar CSS a pagina',()=>{
  const r=analyze([sample([])],{p7:()=>({...converted(),color:'rgb(22, 22, 22)'}),p8:converted});
  assert.equal(r.models.p7.lowContrastConversions,1);
  assert.equal(r.models.p8.lowContrastConversions,0);
  assert.ok(colors.contrastRatio(colors.parseColor('rgb(18, 22, 27)'),
    colors.parseColor('rgb(22, 22, 22)'))<4.5);
});

test('P9: rejeita vetores malformados e saídas inválidas',()=>{
  assert.equal(validateSample(sample(['selected'])),true);
  assert.equal(validateSample(sample(['user-private-data'])),false);
  assert.equal(validateSample({x:[0],reasons:[]}),false);
  assert.throws(()=>analyze([sample(['untrusted-url'])],{p7:converted,p8:preserved}),/invalidos/);
  assert.throws(()=>analyze([sample()],{p7:()=>({action:'convert',confidence:1,
    background:'bad',color:'rgb(255, 255, 255)'}),p8:preserved}),/cores neurais/);
});

test('P9: guarda resultados somente em browser-results, nunca nos pesos distribuídos',()=>{
  assert.equal(safeOutput(path.join(root,'browser-results/p9-shadow')),
    path.join(root,'browser-results/p9-shadow'));
  assert.throws(()=>safeOutput(path.join(root,'data')),/isolada/);
  assert.throws(()=>safeOutput(path.join(root,'manifest.json')),/isolada/);
});
