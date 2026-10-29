'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {captureBrightSources,validateBrightSources}=
  require('../scripts/p14-bright-source-diagnostic.js');
function base(){return {
  gridPoints:96,bright:30,sourceDocument:22,sourceCustom:5,sourceStandard:3,
  largeSurface:24,fixedOrSticky:2,textDark:20,textLight:8,
  textOtherOrUnknown:2,inlineImportant:0
};}
test('P14 bright sources: only fixed numeric CSS aggregates persist',()=>{
  const result=validateBrightSources(base());
  assert.equal(result.bright,30);
  assert.equal(result.largeSurface,24);
  assert.equal(result.holdoutEvaluated,false);
  assert.equal(result.independentVisualReview,false);
  assert.equal(result.promotionEligible,false);
  assert.doesNotMatch(captureBrightSources.toString(),/\.textContent|\.innerHTML|\.value\b|location\.|\.href\b|localStorage|cookie\b/i);
});
test('P14 bright sources: reject partial, malformed or sensitive records',()=>{
  for(const value of [
    null,{}, {...base(),bright:-1},{...base(),bright:97},
    {...base(),textLight:99},{...base(),sourceDocument:21},
    {...base(),textDark:19},{...base(),largeSurface:31},
    {...base(),host:'secret.example'}, {...base(),gridPoints:95},
    {...base(),textLight:8.5}
  ])assert.throws(()=>validateBrightSources(value),/malformed aggregate/);
});
