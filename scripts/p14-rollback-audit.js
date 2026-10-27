'use strict';
const assert=require('node:assert/strict');
// Verify EXACT sampled CSS and viewport-grid restoration, not just that
// the browser API accepted the rollback. Never claim full-page CSS parity.
function verifySampledRollback({rollback,beforeAudit,afterAudit,beforeGrid,afterGrid}){
  assert.equal(rollback?.ok,true,'P14: original inline CSS not restored');
  for(const audit of [beforeAudit,afterAudit]){
    assert.ok(audit&&Array.isArray(audit.rows)&&audit.rows.length>0&&
      audit.rows.length<=240&&audit.truncated===false,
      'P14: missing or truncated CSS audit');
  }
  for(const grid of [beforeGrid,afterGrid]){
    assert.ok(grid&&grid.gridPoints===96&&
      ['valid','dark','bright','unknown'].every(k=>
        Number.isInteger(grid[k])&&grid[k]>=0&&grid[k]<=96)&&
      grid.valid+grid.unknown===96,
      'P14: incomplete viewport grid sample');
  }
  assert.deepEqual(afterAudit,beforeAudit,
    'P14: computed text CSS changed after rollback');
  assert.deepEqual(afterGrid,beforeGrid,
    'P14: sampled viewport colors changed after rollback');
  return true;
}
module.exports=Object.freeze({verifySampledRollback});
