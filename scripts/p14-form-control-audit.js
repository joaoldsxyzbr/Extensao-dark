'use strict';
// P14: inspect only two authored controls in the offline form fixture.
// No labels, form values, URLs or DOM handles leave the disposable browser.
const colors=require('../content/colors.js');
function captureFormAppearance(){
  const elements=[document.querySelector('form.panel input'),
    document.querySelector('form.panel button')];
  if(elements.some(node=>!node))return {complete:false,rows:[]};
  const rows=[];
  for(const el of elements){
    const r=el.getBoundingClientRect(),css=getComputedStyle(el);
    if(r.width<3||r.height<3||r.bottom<=0||r.top>=innerHeight||
      css.display==='none'||css.visibility==='hidden')
      return {complete:false,rows:[]};
    rows.push({background:css.backgroundColor,foreground:css.color,
      border:css.borderTopColor});
  }
  return {complete:true,rows};
}
function assessFormAppearance(before,after,api=colors){
  const result={kind:'p14-authored-form-control-contrast',
    status:'inconclusive',reason:'missing-control-css',controlsSampled:0,
    controlsChanged:null,minimumContrastBefore:null,minimumContrastAfter:null,
    colorContrastThreshold:4.5,focusMeasured:false,visualReview:false,
    promotionEligible:false};
  const valid=s=>s&&typeof s==='object'&&!Array.isArray(s)&&
    Object.keys(s).length===2&&s.complete===true&&Array.isArray(s.rows)&&
    s.rows.length===2&&s.rows.every(row=>row&&
      typeof row==='object'&&!Array.isArray(row)&&
      Object.keys(row).length===3&&
      ['background','foreground','border'].every(k=>typeof row[k]==='string'&&
        row[k].length>0&&row[k].length<=100));
  if(!valid(before)||!valid(after))return result;
  let changed=0;
  const initial=[],final=[];
  for(let i=0;i<2;i++){
    const a=before.rows[i],b=after.rows[i];
    if(['background','foreground','border'].some(k=>a[k]!==b[k]))changed++;
    const pair=[a,b];
    for(let side=0;side<2;side++){
      const bg=api.parseColor(pair[side].background);
      const fg=api.parseColor(pair[side].foreground);
      if(!bg||!fg||bg.a!==1||fg.a!==1)return result;
      const ratio=api.contrastRatio(fg,bg);
      if(!Number.isFinite(ratio)||ratio<1||ratio>21)return result;
      (side===0?initial:final).push(ratio);
    }
  }
  result.controlsSampled=2;
  result.controlsChanged=changed;
  result.minimumContrastBefore=Number(Math.min(...initial).toFixed(2));
  result.minimumContrastAfter=Number(Math.min(...final).toFixed(2));
  if(initial.some(x=>x<4.5)){
    result.reason='original-controls-below-threshold';
  }else if(final.some(x=>x<4.5)){
    result.status='contrast-regression';
    result.reason='new-control-text-contrast-below-threshold';
  }else{
    result.status='legible-in-sample';
    result.reason='opaque-control-colors-above-threshold';
  }
  return result;
}
module.exports=Object.freeze({captureFormAppearance,assessFormAppearance});
