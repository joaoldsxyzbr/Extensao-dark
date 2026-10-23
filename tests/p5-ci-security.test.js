'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pins={checkout:'11d5960a326750d5838078e36cf38b85af677262','setup-node':'49933ea5288caeca8642d1e84afbd3f7d6820020','upload-artifact':'ea165f8d65b6e75b540449e92b4886f43607fa02'};
test('CI usa apenas Actions oficiais com SHA completo, sem credenciais persistidas',()=>{
 for(const f of ['model-ci.yml','browser-e2e.yml']){
  const y=fs.readFileSync(path.join(__dirname,'../.github/workflows',f),'utf8');
  const used=[...y.matchAll(/\buses:\s*(\S+)/g)].map(m=>m[1]);
  assert.ok(used.length>0);
  for(const item of used){
    const found=/^actions\/(checkout|setup-node|upload-artifact)@([0-9a-f]{40})$/.exec(item);
    assert.ok(found,f+': '+item);
    assert.equal(found[2],pins[found[1]]);
  }
  assert.match(y,/permissions:\s*\n\s*contents:\s*read/);
  assert.match(y,/persist-credentials:\s*false/);
  assert.doesNotMatch(y,/pull_request_target|workflow_run\s*:/);
 }
});
