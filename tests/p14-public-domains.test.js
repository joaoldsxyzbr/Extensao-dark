'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPublicDomains,validatePublicDomains,getExplorationCandidates,report}
  =require('../scripts/p14-public-domains.js');
const copy=()=>structuredClone(loadPublicDomains());

test('P14 public: reserve 30 distinct roots, with 10 untouched final holdout domains',()=>{
  const result=validatePublicDomains(copy());
  assert.deepEqual(result,{
    candidateDomains:30,trainDomains:15,validationDomains:5,
    reservedHoldoutDomains:10,reviewedDomains:0,
    verifiedPublicPages:0,verifiedPublicDomains:0,
    verifiedBlindHoldoutPages:0,verifiedBlindHoldoutDomains:0,
    holdoutNeverFetched:true,promotionEligible:false
  });
  const seen=getExplorationCandidates(copy());
  assert.equal(seen.length,20);
  assert.equal(seen.filter(x=>x.split==='train').length,15);
  assert.equal(seen.filter(x=>x.split==='validation').length,5);
  assert.ok(seen.every(x=>x.split!=='holdout'));
  const held=new Set(copy().domains.filter(x=>x.split==='holdout').map(x=>x.rootDomain));
  assert.ok(seen.every(x=>!held.has(x.rootDomain)));
});
test('P14 public: reject leaked data, personal URLs and false authorization claims',()=>{
  const failures=[
    x=>{x.domains[0].url='https://site.test/account?token=private';},
    x=>{x.domains[0].text='personal page content';},
    x=>{x.domains[0].cookie='secret';},
    x=>{x.domains[0].host='https://go.dev/learn';},
    x=>{x.domains[0].host='go.dev/private/path';},
    x=>{x.domains[0].review='permission-approved';},
    x=>{x.releaseEligible=true;},
    x=>{x.domains[0].host='docs.python.org';},
  ];
  for(const change of failures){
    const x=copy();change(x);
    assert.throws(()=>validatePublicDomains(x),/P14 public:/);
  }
});
test('P14 public: known diagnostics and related subdomains can never become blind',()=>{
  const a=copy();a.domains[20].rootDomain='github.com';
  a.domains[20].host='docs.github.com';
  assert.throws(()=>validatePublicDomains(a),/known diagnostic/);
  const b=copy();b.domains[21].rootDomain='python.org';
  b.domains[21].host='docs.python.org';
  assert.throws(()=>validatePublicDomains(b),/known diagnostic/);
  const c=copy();c.domains[2].rootDomain='go.dev';
  c.domains[2].host='www.go.dev';
  assert.throws(()=>validatePublicDomains(c),/duplicate/);
});
test('P14 public: split membership is immutable without explicit contract revision',()=>{
  const a=copy();a.domains[0].split='holdout';
  assert.throws(()=>validatePublicDomains(a),/frozen/);
  const b=copy();const train=b.domains[0].rootDomain;
  b.domains[0].rootDomain=b.domains[20].rootDomain;
  b.domains[0].host=b.domains[20].host;
  b.domains[20].rootDomain=train;b.domains[20].host=train;
  assert.throws(()=>validatePublicDomains(b),/frozen/);
  const c=copy();c.domains.pop();
  assert.throws(()=>validatePublicDomains(c),/frozen/);
});
test('P14 public: no network activity or fabricated evidence is claimed',()=>{
  const summary=report();
  assert.equal(summary.networkRequests,0);
  assert.equal(summary.accessPermissionsChecked,0);
  assert.equal(summary.readyToCollect,false);
  assert.equal(summary.holdoutEvaluationAllowed,false);
  assert.equal(summary.promotionEligible,false);
  assert.equal(summary.verifiedPublicDomains,0);
});
