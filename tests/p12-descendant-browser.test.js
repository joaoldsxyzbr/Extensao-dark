'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PAGES,plans,contrastViolations,validOutput}=require('../scripts/p12-descendant-browser.js');
const root=path.resolve(__dirname,'..');
const sample={background:'rgb(249, 248, 246)',texts:[
  {id:'one',tag:'P',foreground:'rgb(34, 39, 47)',ownBackground:'rgba(0, 0, 0, 0)',size:16,weight:'400'},
  {id:'two',tag:'A',foreground:'rgb(25, 90, 165)',ownBackground:'rgba(0, 0, 0, 0)',size:16,weight:'400'},
  {id:'three',tag:'H1',foreground:'rgb(31, 32, 33)',ownBackground:'rgba(0, 0, 0, 0)',size:28,weight:'700'},
  {id:'four',tag:'P',foreground:'rgb(51, 48, 45)',ownBackground:'rgba(0, 0, 0, 0)',size:14,weight:'400'}]};
test('P12: templates novos sao locais sem recursos de rede, formularios ou dados de navegacao',()=>{
  assert.deepEqual(PAGES,['project-board','library-catalog']);
  for(const name of PAGES){
    const html=fs.readFileSync(path.join(root,'tests/p12-pages',name+'.html'),'utf8');
    assert.ok(html.includes('data-p12-text'));
    assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|fetch\(|XMLHttpRequest/i);
  }
});
test('P12: modelo inseguro nao altera estilos; professor assegura contraste',()=>{
  const r=plans(sample,()=>({action:'reject'}));
  assert.equal(r.stats.total,4);
  assert.equal(r.stats.neuralRejected,4);
  assert.equal(r.stats.neuralAccepted,0);
  assert.deepEqual(r.teacher,r.neural);
  const actual={background:'rgb(26, 32, 40)',
    texts:r.neural.map(el=>({id:el.id,foreground:el.color}))};
  assert.equal(contrastViolations(actual,sample),0);
});
test('P12: rede legivel e contabilizada separadamente do fallback',()=>{
  let counter=0;
  const r=plans(sample,()=>{
    counter++;
    if(counter===1)return {action:'suggest',color:'rgb(248, 249, 252)'};
    return {action:'reject',reason:'insufficient-neural-contrast'};
  });
  assert.equal(r.stats.neuralAccepted,1);
  assert.equal(r.stats.neuralRejected,3);
  assert.equal(contrastViolations({background:'rgb(26, 32, 40)',
    texts:r.neural.map(el=>({id:el.id,foreground:el.color}))},sample),0);
  assert.throws(()=>plans({...sample,texts:[...sample.texts.slice(0,3)]},()=>({action:'reject'})),/inválidos/);
  assert.throws(()=>plans(sample,()=>({action:'suggest',color:'rgb(3, 3, 3)'})),/insegura/);
});
test('P12: resultados confinados a relatorios descartaveis',()=>{
  assert.equal(validOutput(path.join(root,'browser-results/p12-test')),
    path.join(root,'browser-results/p12-test'));
  assert.throws(()=>validOutput(path.join(root,'data')),/protegido/);
  assert.throws(()=>validOutput(path.join(root,'manifest.json')),/protegido/);
});
