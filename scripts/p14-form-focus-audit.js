'use strict';
// P14: focus-outline inspection of two authored controls in a disposable browser.
// DOM and raw CSS stay in memory. No form values, labels, text or page URLs.
const colors=require('../content/colors.js');
function captureFormFocus(){
  const elements=[document.querySelector('form.panel input'),
    document.querySelector('form.panel button')];
  if(elements.some(el=>!el))return {complete:false,rows:[]};
  const rows=[];
  for(const el of elements){
    el.focus({preventScroll:true});
    if(document.activeElement!==el)return {complete:false,rows:[]};
    const r=el.getBoundingClientRect();
    if(r.width<3||r.height<3||r.bottom<=0||r.top>=innerHeight||
      r.right<=0||r.left>=innerWidth)return {complete:false,rows:[]};
    const css=getComputedStyle(el),parent=getComputedStyle(el.parentElement);
    rows.push({focused:true,outlineWidth:css.outlineWidth,
      outlineStyle:css.outlineStyle,outlineColor:css.outlineColor,
      adjacentBackground:parent.backgroundColor});
  }
  return {complete:true,rows};
}
function assessFormFocus(before,after,api=colors){
  const result={kind:'p14-authored-form-focus-outline',status:'inconclusive',
    reason:'insufficient-focus-evidence',controlsMeasured:0,
    minimumContrastBefore:null,minimumContrastAfter:null,
    outlineThreshold:3,focusApplied:false,keyboardNavigationMeasured:false,
    visualReview:false,promotionEligible:false};
  const keys=['focused','outlineWidth','outlineStyle','outlineColor','adjacentBackground'];
  const valid=s=>s&&typeof s==='object'&&!Array.isArray(s)&&
    Object.keys(s).length===2&&s.complete===true&&Array.isArray(s.rows)&&
    s.rows.length===2&&s.rows.every(row=>row&&typeof row==='object'&&
      !Array.isArray(row)&&Object.keys(row).length===keys.length&&
      Object.keys(row).every(k=>keys.includes(k))&&row.focused===true&&
      keys.slice(1).every(k=>typeof row[k]==='string'&&row[k].length<=100));
  if(!valid(before)||!valid(after))return result;
  const ratios=[[],[]],widths=[[],[]],styles=[[],[]];
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
    const row=(j===0?before:after).rows[i];
    const color=api.parseColor(row.outlineColor),bg=api.parseColor(row.adjacentBackground);
    const width=Number.parseFloat(row.outlineWidth);
    if(!color||!bg||color.a!==1||bg.a!==1||
      !Number.isFinite(width)||width<0||width>50)return result;
    const ratio=api.contrastRatio(color,bg);
    if(!Number.isFinite(ratio)||ratio<1||ratio>21)return result;
    ratios[j].push(ratio);widths[j].push(width);styles[j].push(row.outlineStyle);
  }
  result.controlsMeasured=2;result.focusApplied=true;
  result.minimumContrastBefore=Number(Math.min(...ratios[0]).toFixed(2));
  result.minimumContrastAfter=Number(Math.min(...ratios[1]).toFixed(2));
  if(styles[1].some(s=>s==='none'||s==='hidden')||widths[1].some(w=>w<2)){
    result.status='needs-review';result.reason='focus-indicator-missing';
  }else if(ratios[1].some((r,i)=>r<3||r+.05<ratios[0][i])){
    result.status='needs-review';result.reason='focus-indicator-contrast-risk';
  }else{
    result.status='visible-in-sample';result.reason='focus-outline-meets-threshold';
  }
  return result;
}
module.exports=Object.freeze({captureFormFocus,assessFormFocus});
