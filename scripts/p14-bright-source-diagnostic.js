'use strict';
// Diagnostic ONLY on already-approved P3 public pages. No page contents, URLs,
// element identifiers, selectors, cookies, tokens or form values leave Chromium.
function captureBrightSources(){
  const result={gridPoints:96,bright:0,sourceDocument:0,sourceCustom:0,
    sourceStandard:0,largeSurface:0,fixedOrSticky:0,
    textDark:0,textLight:0,textOtherOrUnknown:0,inlineImportant:0};
  const rgb=s=>{
    const m=/^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/.exec(s);
    if(!m)return null;
    const out=m.slice(1).map(Number);
    return out.every(x=>x>=0&&x<=255)?out:null;
  };
  const luminance=arr=>{
    const channel=arr.map(v=>{
      const s=v/255;
      return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
    });
    return .2126*channel[0]+.7152*channel[1]+.0722*channel[2];
  };
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
    const el=document.elementFromPoint((x+.5)*innerWidth/12,
      (y+.5)*innerHeight/8);
    if(!el||el.closest('button,input,textarea,select,svg,img,video,canvas'))
      continue;
    let source=null,style=null,background=null;
    for(let cur=el,depth=0;cur&&depth<16;cur=cur.parentElement,depth++){
      const css=getComputedStyle(cur);
      if(css.backgroundImage!=='none'||css.opacity!=='1')break;
      const parsed=rgb(css.backgroundColor);
      if(parsed){source=cur;style=css;background=parsed;break;}
      if(!/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0(?:\.0+)?\s*\)$/.test(css.backgroundColor))
        break;
    }
    if(!source||!background)continue;
    const spread=Math.max(...background)-Math.min(...background);
    if(Math.min(...background)<182||spread>=60)continue;
    result.bright++;
    const tag=source.tagName;
    if(tag==='BODY'||tag==='HTML')result.sourceDocument++;
    else if(tag.includes('-'))result.sourceCustom++;
    else result.sourceStandard++;
    const r=source.getBoundingClientRect();
    if(r.width>=innerWidth*.65&&r.height>=innerHeight*.45)
      result.largeSurface++;
    if(style.position==='fixed'||style.position==='sticky')
      result.fixedOrSticky++;
    const fg=rgb(style.color);
    if(fg&&luminance(fg)<=.22)result.textDark++;
    else if(fg&&luminance(fg)>=.55)result.textLight++;
    else result.textOtherOrUnknown++;
    if(source.style.getPropertyPriority('background-color')==='important')
      result.inlineImportant++;
  }
  return result;
}
const COUNT_KEYS=['bright','sourceDocument','sourceCustom','sourceStandard',
  'largeSurface','fixedOrSticky','textDark','textLight',
  'textOtherOrUnknown','inlineImportant'];
function validateBrightSources(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    raw.gridPoints!==96||Object.keys(raw).length!==COUNT_KEYS.length+1||
    Object.keys(raw).some(key=>key!=='gridPoints'&&!COUNT_KEYS.includes(key))||
    COUNT_KEYS.some(key=>!Number.isSafeInteger(raw[key])||
      raw[key]<0||raw[key]>96)||
    raw.sourceDocument+raw.sourceCustom+raw.sourceStandard!==raw.bright||
    raw.textDark+raw.textLight+raw.textOtherOrUnknown!==raw.bright||
    ['largeSurface','fixedOrSticky','inlineImportant'].some(key=>raw[key]>raw.bright))
    throw Error('P14 known CSS source: malformed aggregate');
  return Object.freeze({
    kind:'p14-known-public-bright-css-sources',
    observations:'repeated-viewport-grid-points-not-unique-elements',
    ...raw,independentVisualReview:false,holdoutEvaluated:false,
    promotionEligible:false
  });
}
module.exports=Object.freeze({captureBrightSources,validateBrightSources});
