'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {FAMILIES,CONTEXTS,STATES,DECORATIONS,SIZES,TOTAL,scenarios,browserSample,renderFixture}
  = require('./visual-corpus/catalog.js');
const requiredFamilies = [
  'paragraph','muted-text','link','button','input','textarea','select',
  'checkbox','radio','tab','menu','badge','alert','card','table','dialog',
  'tooltip','progress','svg-icon','masked-icon','pseudo-icon','image',
  'canvas','video','gradient','translucent','shadow-dom','dynamic',
  'native-scheme','iframe'
];
test('P0 enumera 3240 combinações determinísticas de 30 famílias visuais',()=>{
  assert.deepEqual(FAMILIES.map(f=>f.id),requiredFamilies);
  assert.equal(CONTEXTS.length,4);
  assert.equal(STATES.length,3);
  assert.equal(DECORATIONS.length,3);
  assert.equal(SIZES.length,3);
  assert.equal(TOTAL,3240);
  const list=[...scenarios()];
  assert.equal(list.length,3240);
  assert.equal(new Set(list.map(s=>s.id)).size,3240);
  assert.equal(list[0].id,'paragraph--light--rest--flat--compact');
  assert.equal(list.at(-1).id,'iframe--accent--disabled--elevated--large');
  assert.deepEqual(list,[...scenarios()]);
});
test('P0 mantém intenção visual separada de rótulos de treinamento neural',()=>{
  const intents=new Set(FAMILIES.map(f=>f.intent));
  assert.deepEqual([...intents].sort(),['accent','control','graphic','surface','text']);
  for(const c of scenarios()){
    assert.ok(intents.has(c.intent));
    assert.ok(!Object.hasOwn(c,'label'));
    assert.match(c.id,/^[a-z0-9-]+(?:--[a-z0-9-]+){4}$/);
    assert.match(c.background,/^#[0-9a-f]{6}$/);
    assert.match(c.foreground,/^#[0-9a-f]{6}$/);
  }
});
test('a amostra de navegador é equilibrada entre famílias e contextos',()=>{
  const sample=browserSample();
  assert.equal(sample.length,120);
  assert.equal(new Set(sample.map(s=>s.id)).size,120);
  const known=new Set([...scenarios()].map(s=>s.id));
  for(const c of sample)assert.ok(known.has(c.id));
  for(const family of requiredFamilies){
    const rows=sample.filter(s=>s.family===family);
    assert.deepEqual(rows.map(s=>s.context),['light','native-dark','high-contrast','accent']);
    assert.equal(new Set(rows.map(s=>s.state)).size,3);
    assert.equal(new Set(rows.map(s=>s.decoration)).size,3);
    assert.equal(new Set(rows.map(s=>s.size)).size,3);
  }
});
test('HTML renderiza componentes avançados sem depender de rede externa',()=>{
  const html=renderFixture();
  for(const pattern of [
    /mask-image:/,/visual-pseudo::before/,/attachShadow/,/getContext\('2d'\)/,
    /window\.changeVisualCorpus/,/srcdoc=/,/sandbox=""/,/data:image\/svg\+xml/,
    /role="dialog"/,/aria-selected="true"/,/<video/,/<select/,/<table/,
    /window\.__fixtureReady=true/
  ]) assert.match(html,pattern);
  assert.equal((html.match(/class="visual-case"/g)||[]).length,120);
  assert.doesNotMatch(html,/(?:src|href)=["']https?:\/\//i);
  assert.doesNotMatch(html,/url\(https?:\/\//i);
  assert.doesNotMatch(html,/<script\s+src=/i);
});
test('o HTML escapa IDs e rejeita famílias não reconhecidas',()=>{
  assert.throws(()=>renderFixture([{family:'unknown',id:'x'}]),/inválida/);
  const c={...browserSample()[0],id:'" onmouseover="alert(1)'};
  const html=renderFixture([c]);
  assert.match(html,/&quot; onmouseover=&quot;alert\(1\)/);
  assert.doesNotMatch(html,/id="case-" onmouseover=/);
  assert.equal((html.match(/class="visual-case"/g)||[]).length,1);
});
