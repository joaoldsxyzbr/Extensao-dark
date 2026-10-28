'use strict';
// Pixel checks for authored, isolated Chromium fixtures ONLY. Do not call
// with user pages, authenticated screenshots, navigation or sealed holdout.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

function validateLandmarks(points){
  if(!Array.isArray(points)||points.length<1||points.length>8)
    throw TypeError('P15: invalid screenshot landmark count');
  const seen=new Set();
  return points.map(p=>{
    if(!p||typeof p!=='object'||Array.isArray(p)||
      Object.keys(p).length!==3||
      Object.keys(p).some(k=>!['x','y','expected'].includes(k))||
      !Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||
      p.x<0||p.y<0||p.x>=8192||p.y>=8192||
      !['bright','dark'].includes(p.expected))
      throw TypeError('P15: invalid screenshot landmark');
    const coordinate=p.x+','+p.y;
    if(seen.has(coordinate))
      throw TypeError('P15: repeated screenshot landmark');
    seen.add(coordinate);
    return {x:p.x,y:p.y,expected:p.expected};
  });
}

async function compareAuthoredScreenshot(browser,points){
  const checked=validateLandmarks(points);
  if(!browser?.page?.screenshot||!browser?.page?.eval)
    throw TypeError('P15: isolated Chromium page required');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'p15-authored-pixels-'));
  try{
    const file=path.join(temp,'authored-only.png');
    await browser.page.screenshot(file);
    const png=fs.readFileSync(file);
    if(png.length>4*1024*1024||png.length<100)
      throw TypeError('P15: screenshot size outside laboratory limits');
    const encoded=png.toString('base64');
    // Decode the browser's OWN PNG in an offscreen canvas, to check actual
    // rendered pixels (not getComputedStyle). Never return pixel RGB, image,
    // screenshot data, selectors, content, or positions to the report.
    const expression='(async()=>{'+
      'const img=new Image();'+
      'img.src='+JSON.stringify('data:image/png;base64,'+encoded)+';'+
      'await img.decode();'+
      'const cv=document.createElement("canvas");'+
      'cv.width=img.naturalWidth;cv.height=img.naturalHeight;'+
      'const c=cv.getContext("2d",{willReadFrequently:true});'+
      'if(!c)throw Error("P15: no screenshot pixel context");'+
      'c.drawImage(img,0,0);'+
      'const landmarks='+JSON.stringify(checked)+';'+
      'let dark=0,bright=0,matched=0;'+
      'for(const p of landmarks){'+
      'if(p.x>=cv.width||p.y>=cv.height)'+
      'throw Error("P15: landmark outside screenshot");'+
      'const d=c.getImageData(p.x,p.y,1,1).data;'+
      'const isDark=Math.max(d[0],d[1],d[2])<=112;'+
      'const isBright=Math.min(d[0],d[1],d[2])>=198;'+
      'const ok=p.expected==="dark"?isDark:isBright;'+
      'if(ok){matched++;if(isDark)dark++;if(isBright)bright++}'+
      '}return {matched,dark,bright,checks:landmarks.length};})()';
    const result=await browser.page.eval(expression);
    if(!result||!Number.isSafeInteger(result.matched)||
      result.checks!==checked.length||result.matched<0||
      result.matched>checked.length)
      throw TypeError('P15: invalid screenshot probe result');
    return {kind:'p15-authored-screenshot-landmarks-v1',
      status:result.matched===checked.length?'matched':'mismatch',
      checks:checked.length,matched:result.matched,
      mismatches:checked.length-result.matched,
      imageExported:false,independentVisualReview:false,
      applied:false,trained:false,promotionEligible:false};
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
module.exports=Object.freeze({validateLandmarks,compareAuthoredScreenshot});
