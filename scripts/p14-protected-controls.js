'use strict';
// P14: audit a bounded sample of protected controls in AUTHOR-CREATED
// offline Chromium fixtures. No DOM serialization, text, URLs or form values.
// Executed by function source inside a disposable browser page.
function captureProtectedControls(){
  const selector='button,input,textarea,select,[role="button"],'+
    '[aria-selected="true"],[aria-disabled="true"]';
  const fields=['backgroundColor','color','borderTopColor','borderRightColor',
    'borderBottomColor','borderLeftColor','outlineColor','opacity',
    'visibility','display'];
  const rows=[];
  let scanned=0;
  for(const el of document.querySelectorAll(selector)){
    if(++scanned>2000)return {truncated:true,rows:[]};
    const rect=el.getBoundingClientRect();
    if(rect.width<3||rect.height<3||rect.bottom<=0||rect.top>=innerHeight||
      rect.right<=0||rect.left>=innerWidth)continue;
    if(rows.length>=64)return {truncated:true,rows:[]};
    const style=getComputedStyle(el);
    rows.push(fields.map(field=>style[field]));
  }
  return {truncated:false,rows};
}
// Null means absent/truncated/dynamic evidence: NEVER treat it as zero changes.
// CSS values never enter the persisted benchmark report.
function countProtectedControlChanges(before,after){
  const valid=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
    Object.keys(x).length===2&&
    Object.hasOwn(x,'rows')&&Object.hasOwn(x,'truncated')&&
    x.truncated===false&&Array.isArray(x.rows)&&x.rows.length<=64&&
    x.rows.every(row=>Array.isArray(row)&&row.length===10&&
      row.every(v=>typeof v==='string'&&v.length>0&&v.length<=160));
  if(!valid(before)||!valid(after)||before.rows.length!==after.rows.length)
    return null;
  let changed=0;
  for(let i=0;i<before.rows.length;i++){
    if(before.rows[i].some((value,j)=>value!==after.rows[i][j]))changed++;
  }
  return changed;
}
module.exports=Object.freeze({captureProtectedControls,countProtectedControlChanges});
