'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessPromotion}=require('../scripts/p4-release-gate.js');

const synthetic={
  candidate:'not-deployed',
  validation:{trained:{total:504,accuracy:.9841,precision:1,recall:.94,fp:0},
    baseline:{accuracy:.87,fp:27}},
  holdout:{trained:{total:504,accuracy:.9841,precision:1,recall:.9259,fp:0},
    baseline:{accuracy:.8393,fp:54}},
  legacySynthetic:{splits:{
    validation:{baseline:{total:18,right:18,fp:0},candidate:{total:18,right:18,fp:0}},
    holdout:{baseline:{total:32,right:32,fp:0},candidate:{total:32,right:32,fp:0}}
  }},
  releaseStatus:{candidatePassedSyntheticGates:true,deployed:false,readyForProduction:false}
};
const benchmark={formatVersion:1,baselineMedianUs:18,candidateMedianUs:32,
  ratio:1.78,candidateBytes:5400,inputs:{baseline:7,candidate:18},iterations:4000};
function real(ids,mode){
 return {completed:true,mode,candidateDeployed:false,results:ids.map(site=>({site,
  assessment:{status:'observed-no-regression'},
  baseline:{kind:'observed',capture:site+'-baseline.png'},
  candidate:{kind:'observed',capture:site+'-candidate.png'}}))};
}
const automatic=real(['example','wikipedia','github','mdn','roblox','youtube'],
  'automatic-native-detection');
const forced=real(['roblox','youtube','github'],'global-ignore-native-dark');
test('P4: bons números sintéticos, sem sites reais, não liberam pesos',()=>{
 const r=assessPromotion({synthetic,benchmark,automatic:null,forced:null});
 assert.equal(r.autoPromote,false);
 assert.equal(r.readyForReview,false);
 assert.ok(r.blockers.some(x=>x.includes('automático')));
 assert.ok(r.blockers.some(x=>x.includes('global')));
});
test('P4: qualquer site inconclusivo ou regressão cancela elegibilidade',()=>{
 for(const status of ['inconclusive','needs-review']){
  const degraded=structuredClone(automatic);
  degraded.results[4].assessment.status=status;
  const r=assessPromotion({synthetic,benchmark,automatic:degraded,forced});
  assert.equal(r.readyForReview,false);
  assert.equal(r.autoPromote,false);
 }
});
test('P4: evidência sem capturas, relatório parcial e carga excessiva bloqueiam',()=>{
 const missing=structuredClone(forced);
 missing.results[0].candidate.capture=null;
 assert.equal(assessPromotion({synthetic,benchmark,automatic,forced:missing}).readyForReview,false);
 assert.equal(assessPromotion({synthetic,benchmark,automatic,forced:{
    ...forced,results:forced.results.slice(1)
 }}).readyForReview,false);
 assert.equal(assessPromotion({synthetic,benchmark:{...benchmark,ratio:19},automatic,forced}).readyForReview,false);
 const regress=structuredClone(synthetic);
 regress.holdout.trained.fp=55;
 assert.equal(assessPromotion({synthetic:regress,benchmark,automatic,forced}).readyForReview,false);
});
test('P4: quando todos os gates observáveis passam, ainda exige aprovação humana',()=>{
 const r=assessPromotion({synthetic,benchmark,automatic,forced});
 assert.equal(r.blockers.length,0);
 assert.equal(r.readyForReview,true);
 assert.equal(r.autoPromote,false);
 assert.equal(r.status,'manual-review-required');
});
test('P4: nenhuma aprovação falsa permite publicação automática',()=>{
 const r=assessPromotion({synthetic,benchmark,automatic,forced,approved:true,
  screenshotReview:true,approval:'yes'});
 assert.equal(r.autoPromote,false);
});
