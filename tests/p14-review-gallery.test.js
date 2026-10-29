'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {IDS,buildGallery,writeGallery}=require('../scripts/p14-review-gallery.js');
test('P14: offline gallery links exactly six authored fixtures, no holdout',()=>{
  const h=buildGallery();
  assert.equal(IDS.length,6);
  assert.match(h,/Content-Security-Policy/);
  assert.match(h,/default-src 'none'/);
  assert.doesNotMatch(h,/<script|https?:\/\/|<form|fetch\(/i);
  for(const id of IDS){
    assert.match(h,new RegExp(id+'-original\\.png'));
    assert.match(h,new RegExp(id+'-legacy-mv3\\.png'));
  }
  assert.doesNotMatch(h,/shadow-open-example|mixed-translucency|long-document-links/);
  assert.match(h,/NÃO comprova qualidade/);
});
test('P14: gallery requires complete screenshot pairs before writing',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p14-gallery-'));
  try{
    assert.throws(()=>writeGallery(dir),/screenshot missing/);
    assert.equal(fs.existsSync(path.join(dir,'review.html')),false);
    for(const id of IDS)for(const mode of ['original','legacy-mv3'])
      fs.writeFileSync(path.join(dir,id+'-'+mode+'.png'),'authored-fixture');
    assert.equal(writeGallery(dir),path.join(dir,'review.html'));
    assert.equal(fs.readFileSync(path.join(dir,'review.html'),'utf8').trim(),buildGallery());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
