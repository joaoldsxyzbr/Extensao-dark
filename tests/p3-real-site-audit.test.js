'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SITES,chooseSites,isAllowedLanding,checkSnapshot,assessPair,promotionGate}
  =require('../scripts/real-site-audit.js');
const example=SITES[0];
function snapshot(overrides={}){
  return {landingUrl:example.url,extensionActive:true,totalElements:250,
    sampledText:100,maskedIcons:20,weakText:5,weakIcons:1,
    changedBackgrounds:18,...overrides};
}
test('P3: permite apenas endereços públicos estáticos selecionados da lista',()=>{
  assert.deepEqual(chooseSites().map(x=>x.id),['example','wikipedia','github']);
  assert.equal(chooseSites('roblox,mdn')[1].id,'mdn');
  for(const value of ['','example,example','example,local','http://localhost',
    'example,github,wikipedia,mdn,roblox,youtube,extra','example,https://evil.test']){
    assert.throws(()=>chooseSites(value));
  }
  assert.ok(SITES.every(s=>s.url.startsWith('https://')));
});
test('P3: redirect externo, tela de bloqueio e dados ruins não passam por sucesso',()=>{
  assert.ok(isAllowedLanding(example,'https://www.example.com/'));
  assert.ok(!isAllowedLanding(example,'http://example.com/'));
  assert.ok(!isAllowedLanding(example,'https://example.com.attacker.test/'));
  assert.ok(!checkSnapshot(snapshot({sampledText:0}),example));
  assert.ok(!checkSnapshot(snapshot({landingUrl:'https://evil.test/'}),example));
  assert.ok(!checkSnapshot(snapshot({weakIcons:50}),example));
  assert.equal(assessPair(example,snapshot(),snapshot({sampledText:0})).status,'inconclusive');
  assert.equal(assessPair(example,snapshot(),snapshot({extensionActive:false})).status,'inconclusive');
});
test('P3: aumento substancial de problemas de ícones e texto requer revisão',()=>{
  const baseline=snapshot();
  const iconProblem=assessPair(example,baseline,snapshot({weakIcons:9}));
  assert.equal(iconProblem.status,'needs-review');
  assert.match(iconProblem.notes.join(' '),/ícones/);
  const textProblem=assessPair(example,baseline,snapshot({weakText:25}));
  assert.equal(textProblem.status,'needs-review');
  assert.match(textProblem.notes.join(' '),/texto/);
  assert.equal(assessPair(example,baseline,snapshot()).status,'observed-no-regression');
});
test('P3: resultados bons não autorizam promoção automática de pesos',()=>{
  const result=promotionGate([{assessment:assessPair(example,snapshot(),snapshot())}]);
  assert.equal(result.ready,false);
  assert.equal(result.observed,1);
  assert.match(result.reason,/Revisão visual manual/);
});
test('P3: relatórios são agregados e não incluem conteúdo ou credenciais',()=>{
  const report=assessPair(example,snapshot({sensitive:"token-super-secreto"}),
    snapshot({sensitive:"dados de usuário"}));
  assert.doesNotMatch(JSON.stringify(report),/token-super-secreto|dados de usuário/);
  assert.equal(Object.hasOwn(report.baseline,'landingUrl'),false);
});
