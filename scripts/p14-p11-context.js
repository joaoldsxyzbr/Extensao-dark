'use strict';
// P14 only: bounded browser-side P11 context for the already-selected P13 text
// nodes. Return boolean/unknown flags; no text, URL, selector or CSS values.
function captureP11TextContext(){
  const state=globalThis.__darkP13Islands;
  if(!state||!Array.isArray(state.auditNodes)||
    state.auditNodes.length<1||state.auditNodes.length>240)
    return {truncated:true,rows:[]};
  const rows=[];
  for(const el of state.auditNodes){
    if(!el||!el.isConnected)return {truncated:true,rows:[]};
    const current=getComputedStyle(el);
    const parent=el.parentElement;
    const parentColor=parent?getComputedStyle(parent).color:null;
    // A distinct computed color is proof of an own value; an inline color
    // declaration is also direct evidence even when equal to its parent.
    // Equal computed values with no inline declaration remain UNKNOWN:
    // stylesheets could declare the same value or the property may inherit.
    const hasInlineColor=el.style.getPropertyValue('color')!=='';
    const explicitColor=hasInlineColor||
      (parentColor!==null&&current.color!==parentColor)?true:null;
    rows.push({isLink:!!el.closest('a[href],[role="link"]'),explicitColor});
  }
  return {truncated:false,rows};
}
module.exports=Object.freeze({captureP11TextContext});
