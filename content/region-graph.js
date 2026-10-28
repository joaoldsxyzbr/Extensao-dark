'use strict';
// P15 laboratory-only bounded DOM region capture. It never reads page text,
// URLs, form values, selectors, cookies, nor persists DOM handles.
function captureRegionGraph(){
  const failed=scanned=>({kind:'p15-region-graph-v1',
    status:'inconclusive',scanned,nodes:[]});
  if(!document.body||!Number.isFinite(innerWidth)||innerWidth<=0||
    !Number.isFinite(innerHeight)||innerHeight<=0)return failed(0);
  const selector='body,main,header,nav,aside,section,article,div,table,'+
    'pre,blockquote,form,ul,footer';
  const protectedSelector='button,input,textarea,select,svg,img,video,'+
    'canvas,picture,[role="button"],[role="img"],[aria-selected="true"],'+
    '[aria-disabled="true"],[disabled]';
  const opaque=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const transparent=/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*0(?:\.0+)?\s*\)$/;
  const linear=x=>{
    const v=x/255;
    return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
  };
  const luma=match=>Number((.2126*linear(+match[1])+
    .7152*linear(+match[2])+.0722*linear(+match[3])).toFixed(4));
  const kind=tag=>({BODY:'canvas',MAIN:'canvas',NAV:'navigation',
    HEADER:'navigation',ASIDE:'navigation',FORM:'form',
    ARTICLE:'panel',SECTION:'panel',TABLE:'table'}[tag]||'region');
  const paint=el=>{
    const s=getComputedStyle(el);
    if(s.backgroundImage&&s.backgroundImage!=='none'||
      s.maskImage&&s.maskImage!=='none'||
      s.webkitMaskImage&&s.webkitMaskImage!=='none'||
      s.filter&&s.filter!=='none'||
      s.backdropFilter&&s.backdropFilter!=='none'||
      s.opacity&&s.opacity!=='1'||
      s.mixBlendMode&&s.mixBlendMode!=='normal')
      return {background:'complex',ownLuma:null};
    const m=opaque.exec(s.backgroundColor||'');
    if(m&&m.slice(1).every(v=>Number(v)<=255))
      return {background:'opaque',ownLuma:luma(m)};
    if(transparent.test(s.backgroundColor||''))
      return {background:'transparent',ownLuma:null};
    return {background:'complex',ownLuma:null};
  };
  const regions=[],positions=new Map();
  let scanned=0;
  for(const el of document.querySelectorAll(selector)){
    if(++scanned>1600)return failed(scanned);
    if(!el.isConnected)return failed(scanned);
    if(el.closest(protectedSelector))continue;
    const rect=el.getBoundingClientRect();
    if(!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
      !Number.isFinite(rect.left)||!Number.isFinite(rect.top)||
      !Number.isFinite(rect.right)||!Number.isFinite(rect.bottom))
      return failed(scanned);
    if(rect.width<75||rect.height<28||rect.right<=0||
      rect.bottom<=0||rect.left>=innerWidth||rect.top>=innerHeight)
      continue;
    if(regions.length>=80)return failed(scanned);
    const style=getComputedStyle(el);
    if(style.display==='none'||style.visibility==='hidden')continue;
    const own=paint(el);
    let effectiveLuma=own.ownLuma;
    if(own.background==='transparent'){
      let parent=el.parentElement,hops=0;
      while(parent&&hops++<12){
        const p=paint(parent);
        if(p.background==='opaque'){effectiveLuma=p.ownLuma;break;}
        if(p.background==='complex')break;
        parent=parent.parentElement;
      }
    }
    let parent=el.parentElement,parentIndex=-1;
    while(parent){
      if(positions.has(parent)){parentIndex=positions.get(parent);break;}
      parent=parent.parentElement;
    }
    const hasDirectText=Array.from(el.childNodes).some(n=>n.nodeType===3);
    const node={index:regions.length,parent:parentIndex,
      background:own.background,ownLuma:own.ownLuma,effectiveLuma,
      widthFraction:Number(Math.min(1,rect.width/innerWidth).toFixed(4)),
      heightFraction:Number(Math.min(1,rect.height/innerHeight).toFixed(4)),
      areaFraction:Number(Math.min(1,rect.width*rect.height/
        (innerWidth*innerHeight)).toFixed(4)),
      kind:kind(el.tagName),hasDirectText,
      hasProtectedDescendants:!!el.querySelector(protectedSelector),
      focusWithin:!!el.matches(':focus-within'),
      nativeDark:style.colorScheme==='dark'};
    positions.set(el,node.index);
    regions.push(node);
  }
  if(!regions.length)return failed(scanned);
  return {kind:'p15-region-graph-v1',status:'ready',scanned,nodes:regions};
}
module.exports=Object.freeze({captureRegionGraph});
