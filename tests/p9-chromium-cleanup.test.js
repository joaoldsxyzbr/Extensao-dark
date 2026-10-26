'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {cleanupProfile}=require('../scripts/browser-e2e.js');

test('P9: encerramento do Chromium tolera criacao tardia de arquivos no perfil',()=>{
  let seen=null;
  cleanupProfile('/qa-profile',(folder,options)=>{seen={folder,options};});
  assert.equal(seen.folder,'/qa-profile');
  assert.equal(seen.options.recursive,true);
  assert.equal(seen.options.force,true);
  assert.ok(seen.options.maxRetries>=5,'limite de tentativas precisa tolerar ENOTEMPTY');
  assert.ok(seen.options.retryDelay>=50,'aguardar arquivos de subprocessos serem liberados');
});

test('P9: remove efetivamente um perfil temporario e os arquivos internos',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'qa-profile-cleanup-'));
  fs.mkdirSync(path.join(folder,'Default'));
  fs.writeFileSync(path.join(folder,'Default','Preferences'),'{}');
  cleanupProfile(folder);
  assert.equal(fs.existsSync(folder),false);
});
