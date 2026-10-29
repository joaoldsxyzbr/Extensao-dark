'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {cleanupBrowser}=require('../scripts/browser-e2e.js');
function profile(){
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'dark-profile-test-'));
  fs.mkdirSync(path.join(p,'Default'));
  return p;
}
class FakeBrowser extends EventEmitter{
  constructor(action){super();this.exitCode=null;this.signalCode=null;this.signals=[];this.action=action;}
  kill(signal){
    this.signals.push(signal);
    this.action?.(signal,this);
    return true;
  }
  close(signal){this.signalCode=signal;this.emit('close',0,signal);}
}
test('browser profile cleanup waits for a late Chrome write before removing profile',async()=>{
  const p=profile();
  const browser=new FakeBrowser((signal,self)=>setTimeout(()=>{
    // Simulates Chromium writing to Default during its last moments.
    fs.writeFileSync(path.join(p,'Default','last-write'),'done');
    self.close(signal);
  },15));
  try{
    await cleanupBrowser(browser,p,{timeoutMs:80});
    assert.deepEqual(browser.signals,['SIGTERM']);
    assert.equal(fs.existsSync(p),false);
  }finally{fs.rmSync(p,{recursive:true,force:true});}
});
test('browser profile cleanup escalates from SIGTERM to SIGKILL once, bounded',async()=>{
  const p=profile();
  const browser=new FakeBrowser((signal,self)=>{
    if(signal==='SIGKILL')setImmediate(()=>self.close(signal));
  });
  try{
    await cleanupBrowser(browser,p,{timeoutMs:20});
    assert.deepEqual(browser.signals,['SIGTERM','SIGKILL']);
    assert.equal(fs.existsSync(p),false);
  }finally{fs.rmSync(p,{recursive:true,force:true});}
});
test('browser profile cleanup of exited process never signals PID again',async()=>{
  const p=profile();
  const browser=new FakeBrowser();browser.exitCode=0;
  await cleanupBrowser(browser,p,{timeoutMs:20});
  assert.deepEqual(browser.signals,[]);
  assert.equal(fs.existsSync(p),false);
});
