'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateLandmarks}=require('../scripts/p15-authored-pixel-oracle.js');

test('P15 screenshot landmark validation accepts only bounded static pixel checks',()=>{
  const points=[{x:80,y:80,expected:'dark'},{x:445,y:100,expected:'bright'}];
  assert.deepEqual(validateLandmarks(points),points);
  assert.notEqual(validateLandmarks(points),points);
});
test('P15 screenshot landmark inputs reject URLs, text, and unbounded coordinates',()=>{
  for(const points of [
    [],Array.from({length:9},(_,x)=>({x,y:1,expected:'dark'})),
    [{x:-1,y:1,expected:'dark'}],
    [{x:1,y:1.2,expected:'bright'}],
    [{x:8192,y:1,expected:'dark'}],
    [{x:1,y:1,expected:'white'}],
    [{x:1,y:1,expected:'dark',url:'private'}],
    [{x:1,y:1,expected:'dark',text:'private'}]
  ])assert.throws(()=>validateLandmarks(points),/P15:/);
});

test('P15: duplicate coordinates cannot inflate visual evidence',()=>{
  assert.throws(()=>validateLandmarks([
    {x:80,y:80,expected:'dark'},
    {x:80,y:80,expected:'bright'}
  ]),/P15:/);
  assert.throws(()=>validateLandmarks([
    {x:25,y:35,expected:'dark'},
    {x:25,y:35,expected:'dark'}
  ]),/P15:/);
});
test('P15: different pixel coordinates remain independent checks',()=>{
  const checks=validateLandmarks([
    {x:80,y:80,expected:'dark'},
    {x:81,y:80,expected:'dark'}
  ]);
  assert.equal(checks.length,2);
  assert.notEqual(checks[0],checks[1]);
});
