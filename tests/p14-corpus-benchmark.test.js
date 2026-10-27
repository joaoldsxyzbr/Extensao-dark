'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateCorpus,summarize}=require('../scripts/p14-common-benchmark.js');
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,
  '../training/datasets/p14-baseline-v1.json'),'utf8'));
const copy=()=>structuredClone(corpus);
test('P14: known evaluated public domains cannot be called new blind holdout',()=>{
  const result=validateCorpus(corpus);
  assert.equal(result.knownDomains,12);
  assert.equal(result.examples,24);
  assert.equal(result.finalBlindCollected,0);
  assert.equal(corpus.finalBlind.status,'not-collected');
  assert.ok(corpus.knownPublicDiagnostics.some(x=>x.hostname==='docs.python.org'));
  assert.ok(corpus.knownPublicDiagnostics.some(x=>x.hostname==='www.rfc-editor.org'));
  const bad=copy();bad.finalBlind.pages.push('https://example.com/not-blind');
  assert.throws(()=>validateCorpus(bad),/blind/);
});
test('P14: no train/validation family overlap or reused CSS vectors',()=>{
  const malformed=copy();
  malformed.splits.validation.push('dashboard');
  assert.throws(()=>validateCorpus(malformed),/leakage/);
  const duplicated=copy();
  duplicated.scenarios[4].background=duplicated.scenarios[0].background;
  duplicated.scenarios[4].foreground=duplicated.scenarios[0].foreground;
  duplicated.scenarios[4].ancestor=duplicated.scenarios[0].ancestor;
  duplicated.scenarios[4].width=duplicated.scenarios[0].width;
  duplicated.scenarios[4].height=duplicated.scenarios[0].height;
  duplicated.scenarios[4].fontSize=duplicated.scenarios[0].fontSize;
  duplicated.scenarios[4].fontWeight=duplicated.scenarios[0].fontWeight;
  duplicated.scenarios[4].isLink=duplicated.scenarios[0].isLink;
  duplicated.scenarios[4].control=duplicated.scenarios[0].control;
  duplicated.scenarios[4].selected=duplicated.scenarios[0].selected;
  duplicated.scenarios[4].hasImage=duplicated.scenarios[0].hasImage;
  assert.throws(()=>validateCorpus(duplicated),/duplicate CSS vector/);
});
test('P14: reject private text, form values, navigation URLs and bad model inputs',()=>{
  const bad=copy();
  bad.scenarios[0].textContent='Confidential';
  assert.throws(()=>validateCorpus(bad),/private CSS/);
  const bad2=copy();bad2.scenarios[0].url='https://my-account.example';
  assert.throws(()=>validateCorpus(bad2),/private CSS/);
  const bad3=copy();bad3.scenarios[0].foreground='rgba(10, 10, 10, .3)';
  assert.throws(()=>validateCorpus(bad3),/non-opaque/);
  const bad4=copy();bad4.knownPublicDiagnostics[1].hostname='www.example.com';
  assert.throws(()=>validateCorpus(bad4),/duplicate known domain/);
});
test('P14: model functions are evaluated by their actual roles, not ranked blindly',()=>{
  const rows=[
    {split:'train',expectedAction:'convert',area:100,model7DConvert:false,p13Convert:true,p11Action:'reject',unsafeSample:false},
    {split:'train',expectedAction:'preserve',area:100,model7DConvert:false,p13Convert:false,p11Action:'not-applicable',unsafeSample:false},
    {split:'validation',expectedAction:'convert',area:200,model7DConvert:true,p13Convert:true,p11Action:'suggest',unsafeSample:false},
    {split:'diagnostic',expectedAction:'preserve',area:50,model7DConvert:true,p13Convert:false,p11Action:'not-applicable',unsafeSample:false}
  ];
  const m=summarize(rows);
  assert.equal(m.train.p13.eligibleSyntheticAreaFraction,'1.0000');
  assert.equal(m.train.model7D.missedEligible,1);
  assert.equal(m.train.p11.rejectedToFallback,1);
  assert.equal(m.diagnostic.model7D.falsePositives,1);
  assert.equal(m.validation.sampleWeak,0);
});
test('P14: benchmarks cannot modify published model or manifest',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../scripts/p14-common-benchmark.js'),'utf8');
  assert.doesNotMatch(src,/writeFileSync\s*\(\s*(?:.*(?:manifest\.json|neural-model\.json))/);
  assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|new WebSocket/);
  assert.equal(require('../manifest.json').content_scripts[0].js.some(x=>x.includes('p14')),false);
});
