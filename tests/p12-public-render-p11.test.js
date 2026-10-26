'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const colors=require('../content/colors.js');
const {CASES,BG,allowedOutput,checkCapture,plans,checkPaint,pageExperiment,assessSurfaceContrast}
  =require('../scripts/p12-public-render-p11.js');

const capture={status:'ready',sourceBackground:'rgb(250, 250, 250)',rows:[
  {tag:'P',color:'rgb(30, 31, 32)',size:16,weight:400},
  {tag:'A',color:'rgb(28, 82, 155)',size:16,weight:400},
  {tag:'H2',color:'rgb(35, 40, 45)',size:25,weight:700},
  {tag:'SPAN',color:'rgb(45, 48, 55)',size:14,weight:400},
  {tag:'LI',color:'rgb(40, 43, 50)',size:16,weight:400},
  {tag:'CODE',color:'rgb(30, 65, 101)',size:15,weight:400},
  {tag:'P',color:'rgb(35, 45, 55)',size:17,weight:400},
  {tag:'STRONG',color:'rgb(45, 52, 60)',size:16,weight:700}
]};
test('P12 render: paginas diagnosticas sem criar uma rede de navegacao arbitraria',()=>{
  assert.deepEqual(CASES.map(s=>s.id),['python-docs','rfc-editor','iana-reserved']);
  assert.ok(CASES.every(s=>new URL(s.url).protocol==='https:'));
  assert.equal(BG,'rgb(26, 32, 40)');
});
test('P12 render: protege esquema CSS minimo e rejeita extracao de dados privados',()=>{
  assert.equal(checkCapture(capture),true);
  assert.throws(()=>checkCapture({...capture,rows:[{...capture.rows[0],text:'segredo'},...capture.rows.slice(1)]}),/private/);
  assert.throws(()=>checkCapture({...capture,sourceBackground:'rgba(0,0,0,.4)'}),/background/);
  assert.throws(()=>checkCapture({...capture,rows:capture.rows.slice(0,2)}),/incomplete/);
  const pageCode=pageExperiment.toString();
  assert.doesNotMatch(pageCode,/\.innerText|\.innerHTML|\.textContent|\.value\b|document\.cookie|localStorage|sessionStorage|\.href\b|\.outerHTML/);
});
test('P12 render: modelo rejeitado usa fallback, nunca altera pesos publicados',()=>{
  const result=plans(capture,()=>({action:'reject',reason:'insufficient-neural-contrast'}));
  assert.equal(result.stats.total,8);
  assert.equal(result.stats.rejected,8);
  assert.deepEqual(result.neural,result.teacher);
  assert.equal(result.stats.coverage,0);
  assert.equal(checkPaint(capture,{background:BG,colors:result.neural},true).weak,0);
});
test('P12 render: rede segura consegue colorir a pagina e medicao encontra texto ilegivel',()=>{
  const result=plans(capture,()=>({action:'suggest',color:'rgb(242, 244, 247)'}));
  assert.equal(result.stats.accepted,8);
  assert.equal(result.stats.rejected,0);
  assert.equal(checkPaint(capture,{background:BG,colors:result.neural},true).weak,0);
  assert.equal(checkPaint(capture,{background:BG,colors:Array(8).fill('rgb(12, 13, 14)')},true).weak,8);
  assert.throws(()=>plans(capture,()=>({action:'suggest',color:'rgb(1, 1, 1)'})),/unsafe/);
});
test('P12 render: salvos apenas relatorios no sandbox do workflow',()=>{
  const root=path.resolve(__dirname,'..');
  assert.equal(allowedOutput(path.join(root,'browser-results/p12-public-rendered')),
    path.join(root,'browser-results/p12-public-rendered'));
  assert.throws(()=>allowedOutput(path.join(root,'data')),/disposable/);
  assert.equal(require('../manifest.json').content_scripts[0].js.some(p=>p.includes('p12')),false);
});


test('P12 whole-surface: untouched descendant going dark-on-dark blocks candidate',()=>{
  const before={rows:[
    {fg:'rgb(30, 33, 38)',bg:'rgb(250, 250, 250)',size:16,weight:400},
    {fg:'rgb(25, 76, 145)',bg:'rgb(248, 248, 248)',size:16,weight:400},
    {fg:'rgb(20, 20, 20)',bg:'rgb(255, 255, 255)',size:16,weight:400}
  ],truncated:false};
  const after={rows:[
    {fg:'rgb(245, 246, 248)',bg:'rgb(26, 32, 40)',size:16,weight:400},
    {fg:'rgb(240, 242, 245)',bg:'rgb(26, 32, 40)',size:16,weight:400},
    {fg:'rgb(20, 20, 20)',bg:'rgb(26, 32, 40)',size:16,weight:400}
  ],truncated:false};
  const result=assessSurfaceContrast(before,after,colors);
  assert.equal(result.status,'blocked');
  assert.equal(result.newWeak,1);
  assert.equal(result.audited,3);
});
test('P12 whole-surface: preserves independent painted child and allows safe palette',()=>{
  const before={rows:[
    {fg:'rgb(25, 25, 25)',bg:'rgb(255, 255, 255)',size:16,weight:400},
    {fg:'rgb(22, 25, 33)',bg:'rgb(239, 246, 250)',size:18,weight:700}
  ],truncated:false};
  const after={rows:[
    {fg:'rgb(240, 242, 245)',bg:'rgb(26, 32, 40)',size:16,weight:400},
    {fg:'rgb(22, 25, 33)',bg:'rgb(239, 246, 250)',size:18,weight:700}
  ],truncated:false};
  const result=assessSurfaceContrast(before,after,colors);
  assert.equal(result.newWeak,0);
  assert.equal(result.status,'safe-in-sample');
});
test('P12 whole-surface: truncation, unknown backgrounds and DOM instability never pass',()=>{
  const stable={rows:[
    {fg:'rgb(240, 240, 240)',bg:'rgb(26, 32, 40)',size:16,weight:400}
  ],truncated:false};
  assert.equal(assessSurfaceContrast(stable,{...stable,truncated:true},colors).status,'inconclusive');
  assert.equal(assessSurfaceContrast(stable,{rows:[null],truncated:false},colors).status,'inconclusive');
  assert.equal(assessSurfaceContrast(stable,{rows:[],truncated:false},colors).status,'inconclusive');
  assert.equal(assessSurfaceContrast({...stable,rows:[null]},stable,colors).status,'inconclusive');
  assert.equal(assessSurfaceContrast(stable,{rows:[{...stable.rows[0],fg:'rgb(2, 2, 2)'}],
    truncated:false},colors).status,'blocked');
});
