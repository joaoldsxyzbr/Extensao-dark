'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {FIXTURE,NODE_COUNT,LIMIT_MS,assess}=
  require('../scripts/p14-churn-browser.js');

test('P14 churn: synthetic fixture cannot access external or reserved sites',()=>{
  assert.equal(NODE_COUNT,1600);
  assert.equal(FIXTURE.split('<script type="application/json"></script>').length-1,NODE_COUNT);
  assert.match(FIXTURE,/p14-spa-churn/);
  assert.match(FIXTURE,/media-app id="shell"/);
  for(const forbidden of ['http://','https://','<iframe','XMLHttpRequest','fetch('])
    assert.equal(FIXTURE.includes(forbidden),false,forbidden);
});
test('P14 churn: recovery reports limits, never independent validation',()=>{
  const original={background:'rgb(255,255,255)',
    protectedBackground:'rgb(255,255,255)',protectedForeground:'rgb(12,12,12)'};
  const active={active:true,background:'rgb(25,27,30)',
    foreground:'rgb(245,245,245)',recoveryMs:900,
    protectedBackground:original.protectedBackground,
    protectedForeground:original.protectedForeground};
  const result=assess(original,active);
  assert.equal(result.recoveryMs,900);
  assert.equal(result.status,'safe-in-authored-sample');
  assert.equal(result.promotionEligible,false);
  assert.equal(result.holdoutEvaluated,false);
  assert.equal(result.pixelCoverageMeasured,false);
});
test('P14 churn: late, bright, unreadable or protected changes fail closed',()=>{
  const original={background:'rgb(255,255,255)',
    protectedBackground:'rgb(255,255,255)',protectedForeground:'rgb(12,12,12)'};
  const active={active:true,background:'rgb(25,27,30)',
    foreground:'rgb(245,245,245)',recoveryMs:900,
    protectedBackground:original.protectedBackground,
    protectedForeground:original.protectedForeground};
  for(const invalid of [
    {...active,recoveryMs:LIMIT_MS+1}, {...active,recoveryMs:NaN},
    {...active,background:'rgb(255,255,255)'},
    {...active,foreground:'rgb(20,20,20)'},
    {...active,protectedBackground:'rgb(30,30,30)'},
    {...active,protectedForeground:'rgb(200,200,200)'},
    {...active,active:false},null
  ])assert.throws(()=>assess(original,invalid),/P14 churn/);
});
