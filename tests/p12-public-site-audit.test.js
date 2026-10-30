'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const colors=require('../content/colors.js');
const {SITES,assess,makePalette,validateRows,OUTPUT_DIR,assessPublicCoverage}=require('../scripts/p12-public-site-audit.js');

const sample=(fg='rgb(25, 45, 71)',tag='P')=>({
  color:fg,background:'rgb(252, 252, 252)',tag,fontSize:16,fontWeight:400
});
test('P12 sites: domínios independentes dos seis usados no laboratório P9',()=>{
  const previouslyUsed=['example.com','en.wikipedia.org','developer.mozilla.org',
    'github.com','www.roblox.com','www.youtube.com'];
  assert.ok(SITES.length>=2);
  for(const site of SITES){
    assert.equal(new URL(site.url).protocol,'https:');
    assert.ok(!previouslyUsed.includes(new URL(site.url).hostname));
    assert.ok(/^[a-z0-9-]+$/.test(site.id));
  }
});
test('P12 sites: o relatório compara professor e rede sem assumir que gate aprovado é qualidade',()=>{
  const rows=[sample(),sample('rgb(30, 90, 170)','A'),sample('rgb(38, 43, 48)','H2')];
  const report=assess(rows,()=>({action:'reject',reason:'insufficient-neural-contrast'}),colors);
  assert.equal(report.samples,3);
  assert.equal(report.rejected,3);
  assert.equal(report.accepted,0);
  assert.equal(report.promotionEligible,false);
  assert.equal(report.needsReview,true);
  assert.equal(report.palettes.length,3);
  assert.ok(report.palettes.every(p=>p.teacher.startsWith('rgb(')));
  assert.equal(report.palettes.some(p=>'text' in p||'url' in p),false);
});
test('P12 sites: erro cromático e cores ilegíveis não são aprovação de promoção',()=>{
  const rows=[sample(),sample('rgb(30, 90, 170)','A')];
  const ok=assess(rows,()=>({action:'suggest',color:'rgb(242, 244, 247)'}),colors);
  assert.equal(ok.accepted,2);
  assert.ok(ok.meanRgbDifference>=0);
  assert.equal(ok.needsReview,true);
  assert.equal(ok.promotionEligible,false);
  assert.throws(()=>assess(rows,()=>({action:'suggest',color:'rgb(8, 8, 8)'}),colors),/unsafe|insegur/i);
});
test('P12 sites: amostras inválidas ou com campos privados são rejeitadas',()=>{
  assert.equal(validateRows([sample(),sample('rgb(45, 65, 81)')]),true);
  assert.throws(()=>validateRows([sample(),{...sample(),text:'segredo'}]),/campos|inesperado/i);
  assert.throws(()=>validateRows([{...sample(),color:'var(--private)'}]),/cor|color/i);
  assert.throws(()=>validateRows([{...sample(),tag:'INPUT'}]),/tag/i);
  assert.throws(()=>validateRows([]),/amostras/i);
  const sampler=fs.readFileSync(require('node:path').join(__dirname,'../scripts/p12-public-site-audit.js'),'utf8');
  const excerpt=sampler.slice(sampler.indexOf('function publicSnapshot'),sampler.indexOf('const SNAPSHOT_EXPR'));
  assert.doesNotMatch(excerpt,/\.textContent|\.innerText|\.innerHTML|\.value\b|document\.cookie|localStorage|sessionStorage|\.href\b|\.outerHTML/);
});
test('P12 sites: SVG contém apenas cores e rótulos sintéticos, sem texto do site',()=>{
  const result=assess([sample(),sample('rgb(30, 90, 170)','A')],()=>({action:'reject'}),colors);
  const svg=makePalette(result.palettes,'python-docs');
  assert.match(svg,/P12/);
  assert.match(svg,/Original/);
  assert.match(svg,/Rede P11/);
  assert.ok(!svg.includes('<script'));
  assert.ok(OUTPUT_DIR.endsWith('browser-results/p12-public-sites'));
});

test('P12 incomplete external connectivity cannot masquerade as public coverage',()=>{
  const results=SITES.map((s,i)=>({site:s.id,status:i<1?'observed':'inconclusive',
    ...(i<1?{samples:11}:{reason:'navigation-unavailable'})}));
  const poor=assessPublicCoverage(results);
  assert.equal(poor.evidenceSufficient,false);
  assert.equal(poor.status,'inconclusive-insufficient-public-coverage');
  assert.equal(poor.promotionEligible,false);
  const adequate=SITES.map((s,i)=>({site:s.id,status:i<2?'observed':'inconclusive',
    ...(i<2?{samples:12}:{reason:'not-enough-css'})}));
  assert.equal(assessPublicCoverage(adequate).evidenceSufficient,true);
  assert.equal(assessPublicCoverage(adequate).promotionEligible,false);
  assert.throws(()=>assessPublicCoverage(results.slice(1)),/P12:/);
  assert.throws(()=>assessPublicCoverage(results.map(x=>({...x,status:'approved'}))),/P12:/);
  assert.throws(()=>assessPublicCoverage(results.map((x,i)=>i?x:{...x,samples:3})),/P12:/);
});
