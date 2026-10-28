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
    '[aria-disabled="true"],[disabled],[aria-pressed="true"],'+
    '[aria-checked="true"],[role="checkbox"],[role="switch"],'+
    ':checked,:focus-visible';
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
  let scanned=0,visited=0;
  // Traverse document and reachable OPEN shadow roots only. Hosts need not
  // match the region selector (e.g. a custom span). Each root is visited once.
  const scopes=[{root:document,depth:0}],seen=new Set([document]);
  const composedParent=el=>{
    if(el.parentElement)return el.parentElement;
    const root=el.getRootNode?.();
    return root?.host||null;
  };
  const protectedAncestor=el=>{
    // closest() stops at shadow boundaries, so inspect each host explicitly.
    let cur=el;
    for(let depth=0;cur&&depth<10;depth++){
      if(cur.closest(protectedSelector))return true;
      const root=cur.getRootNode?.();
      if(!root?.host)return false;
      cur=root.host;
    }
    return true; // unknown/deep chain: fail closed
  };
  for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
    const {root,depth}=scopes[scopeIndex];
    for(const el of root.querySelectorAll(selector)){
      if(++scanned>1600)return failed(scanned);
      if(!el.isConnected)return failed(scanned);
      if(protectedAncestor(el))continue;
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
    // Generated ::before / ::after may paint over a seemingly safe surface.
    // Record only a boolean. Never return generated CSS content strings.
    const before=getComputedStyle(el,'::before');
    const after=getComputedStyle(el,'::after');
    if(!before||typeof before.content!=='string'||
      !after||typeof after.content!=='string')return failed(scanned);
    const activePseudo=s=>s.content!=='none'&&
      s.content!=='normal'&&s.content!=='';
    const hasPseudoPaint=activePseudo(before)||activePseudo(after);
    const own=paint(el);
    let effectiveLuma=own.ownLuma;
    if(own.background==='transparent'){
      let parent=composedParent(el),hops=0;
      while(parent&&hops++<12){
        const p=paint(parent);
        if(p.background==='opaque'){effectiveLuma=p.ownLuma;break;}
        if(p.background==='complex')break;
        parent=composedParent(parent);
      }
    }
    let parent=composedParent(el),parentIndex=-1;
    for(let hops=0;parent&&hops<24;hops++){
      if(positions.has(parent)){parentIndex=positions.get(parent);break;}
      parent=composedParent(parent);
    }
    const hasDirectText=Array.from(el.childNodes).some(n=>n.nodeType===3);
    const node={index:regions.length,parent:parentIndex,
      background:own.background,ownLuma:own.ownLuma,effectiveLuma,
      widthFraction:Number(Math.min(1,rect.width/innerWidth).toFixed(4)),
      heightFraction:Number(Math.min(1,rect.height/innerHeight).toFixed(4)),
      areaFraction:Number(Math.min(1,rect.width*rect.height/
        (innerWidth*innerHeight)).toFixed(4)),
      kind:kind(el.tagName),hasDirectText,
      hasProtectedDescendants:!!el.querySelector(protectedSelector)||
        !!el.shadowRoot?.querySelector(protectedSelector),
      focusWithin:!!el.matches(':focus-within'),
      nativeDark:style.colorScheme==='dark',hasPseudoPaint};
      positions.set(el,node.index);
      regions.push(node);
    }
    // Bounded host search includes non-region custom elements, which may own
    // a readable shadowRoot but no background or region role themselves.
    for(const host of root.querySelectorAll('*')){
      if(++visited>8000)return failed(scanned);
      const child=host.shadowRoot;
      if(!child||child.mode!=='open'||seen.has(child))continue;
      if(protectedAncestor(host))continue;
      if(depth>=8||scopes.length>=24)return failed(scanned);
      seen.add(child);
      scopes.push({root:child,depth:depth+1});
    }
  }
  if(!regions.length)return failed(scanned);
  return {kind:'p15-region-graph-v1',status:'ready',scanned,nodes:regions};
}
module.exports=Object.freeze({captureRegionGraph});
