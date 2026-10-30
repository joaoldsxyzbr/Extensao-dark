'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {EMPTY}=require('../scripts/p16-public-capture.js');
const {makeDataset}=require('../scripts/p16-build-demo.js');
const {MIN,near,auditTrainingReadiness,command}=
 require('../scripts/p16-training-readiness.js');
const TRAIN=['go.dev','nodejs.org','rust-lang.org','kotlinlang.org',
 'swift.org','php.net'];
const VALID=['astro.build','vite.dev'];
const P=[.06,.07,.08,.95,.96,.97];
function corpus(){
 const rows=makeDataset().samples.map((sample,index)=>{
  const isTrain=sample.split==='train',family=Math.floor(index/4);
  return {caseId:'case-synthetic-'+String(index).padStart(3,'0'),
   rootDomain:isTrain?TRAIN[family]:VALID[family-TRAIN.length],
   split:sample.split,regionIndex:0,features:[...sample.x],
   firstReview:sample.decision?'convert':'preserve',
   secondReview:sample.decision?'convert':'preserve',
   palette:sample.decision?[...P]:null};
 });
 return {...EMPTY(),entries:rows};
}
test('P16 empty template cannot authorize a trainer or fabricate review evidence',()=>{
 const result=auditTrainingReadiness(EMPTY());
 assert.equal(result.status,'blocked-unverified-supervision');
 assert.equal(result.train.regions,0);
 assert.equal(result.validation.regions,0);
 assert.equal(result.trainingAuthorized,false);
 assert.equal(result.modelTrained,false);
 assert.equal(result.promotionEligible,false);
 assert.equal(result.holdoutTouched,false);
 assert.ok(result.blockers.includes('human-review-provenance-not-verified'));
 assert.ok(result.blockers.includes('region-visual-evidence-not-verified'));
 assert.ok(result.blockers.includes('supervised-training-not-authorized'));
});
test('P16 declared synthetic consensus remains unverified even with both classes',()=>{
 const result=auditTrainingReadiness(corpus());
 assert.equal(result.train.regions,24);
 assert.equal(result.validation.regions,8);
 assert.equal(result.train.convert,6);
 assert.equal(result.train.preserve,18);
 assert.equal(result.trainingAuthorized,false);
 assert.equal(result.verifiedIndependentReviewers,0);
 assert.equal(result.promotionEligible,false);
 assert.ok(result.blockers.includes('insufficient-train-regions'));
 assert.ok(result.blockers.includes('insufficient-validation-domains'));
 assert.doesNotMatch(JSON.stringify(result),/go\.dev|astro\.build|case-synthetic|features|palette/);
});
test('P16 identifies near-duplicate vectors across frozen train/validation splits',()=>{
 const first=makeDataset().samples[0].x.slice();
 const duplicate=first.slice();duplicate[11]=Math.min(1,first[11]+.001);
 assert.equal(near(first,duplicate),true);
 duplicate[11]=Math.min(1,first[11]+.02);
 assert.equal(near(first,duplicate),false);
 const r=(split,caseId,rootDomain,x)=>({caseId,rootDomain,split,
  regionIndex:0,features:x,firstReview:'preserve',
  secondReview:'preserve',palette:null});
 const data={...EMPTY(),entries:[
  r('train','case-train-near1','go.dev',first),
  r('validation','case-val-near11','astro.build',
    first.map((v,i)=>i===11?v+.001:v))]};
 const result=auditTrainingReadiness(data);
 assert.equal(result.nearDuplicatePairsAcrossSplits,1);
 assert.ok(result.blockers.includes('near-duplicate-across-splits'));
 assert.equal(result.trainingAuthorized,false);
});
test('P16 rejects fake reviewer approval, extra private fields, holdout and split mismatch',()=>{
 const base=corpus();
 const variants=[
  {...base,independenceVerified:true},
  {...base,trainingAuthorized:true},
  {...base,entries:[{...base.entries[0],rootDomain:'julialang.org'},
    ...base.entries.slice(1)]},
  {...base,entries:[{...base.entries[0],split:'validation'},
    ...base.entries.slice(1)]},
  {...base,entries:[{...base.entries[0],url:'https://private.example'},
    ...base.entries.slice(1)]}
 ];
 for(const doc of variants)assert.throws(()=>auditTrainingReadiness(doc));
});
test('P16 audit CLI forbids train, model paths, arbitrary files and publication',()=>{
 assert.equal(command(['--template']),'--template');
 assert.equal(command(['--local']),'--local');
 for(const args of [[],['--train'],['--export'],['--model=foo.json'],
   ['--local','--output=public.json'],['--holdout']])
  assert.throws(()=>command(args),/P16 training gate:/);
 const source=fs.readFileSync(require('node:path').join(__dirname,
  '../scripts/p16-training-readiness.js'),'utf8');
 assert.doesNotMatch(source,/require\(['"](?:.*train_region_demo|node:child_process)/);
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|page\.navigate/);
 assert.ok(Object.isFrozen(MIN));
});
