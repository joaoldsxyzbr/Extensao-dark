'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseDevToolsActivePort}=require('../scripts/browser-e2e.js');
const uuid='28a08a36-7129-481a-b3ac-b16cd270a4b9';
test('browser CDP: accept only fully written localhost DevToolsActivePort',()=>{
  const expected={port:41237,socketPath:'/devtools/browser/'+uuid};
  assert.deepEqual(parseDevToolsActivePort('41237\n/devtools/browser/'+uuid+'\n'),expected);
  assert.deepEqual(parseDevToolsActivePort('41237\r\n/devtools/browser/'+uuid+'\r\n'),expected);
});
test('browser CDP: partial startup and invalid endpoints remain unready',()=>{
  for(const raw of [
    '',null,'41237','41237\n','41237\n/devtools/browser/',
    '0\n/devtools/browser/'+uuid,'65536\n/devtools/browser/'+uuid,
    'http://example.com\n/devtools/browser/'+uuid,
    '41237\n/other/browser/'+uuid,'41237\n/devtools/browser/../evil',
    '41237\n/devtools/browser/'+uuid+'\nextra',
    '41237\n/devtools/browser/'+uuid+'?token=secret',
    '41237\n/devtools/browser/'+uuid+'\n'.repeat(300)
  ])assert.equal(parseDevToolsActivePort(raw),null,String(raw).slice(0,64));
});
