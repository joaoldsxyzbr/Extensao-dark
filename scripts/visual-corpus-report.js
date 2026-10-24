#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {FAMILIES,CONTEXTS,TOTAL,scenarios,browserSample}
  = require('../tests/visual-corpus/catalog.js');
const target=path.resolve(__dirname,'../data/visual-corpus-summary.json');
const rows=[...scenarios()];
const report={
  formatVersion:1,
  status:'synthetic-combinatorial-unlabelled',
  trainingCases:0,
  totalScenarios:TOTAL,
  browserSampleCount:browserSample().length,
  componentFamilies:FAMILIES.length,
  contexts:CONTEXTS.map(c=>c.id),
  intents:Object.fromEntries([...new Set(FAMILIES.map(f=>f.intent))].sort().map(intent=>[
    intent,FAMILIES.filter(f=>f.intent===intent).length
  ])),
  familyIds:FAMILIES.map(f=>f.id),
  scenarioIdsSha256:crypto.createHash('sha256').update(rows.map(r=>r.id).join('\n')).digest('hex')
};
const serialized=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--check')){
  assert.equal(fs.readFileSync(target,'utf8'),serialized,
    'Catálogo mudou: regenere com node scripts/visual-corpus-report.js');
  console.log('P0: catálogo visual e resumo sincronizados.');
}else{
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,serialized);
  console.log('P0:',TOTAL,'cenários combinatórios; amostra de navegador:',report.browserSampleCount);
}
