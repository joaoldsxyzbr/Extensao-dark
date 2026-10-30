'use strict';
// P15 laboratory-only bounded DOM region capture. It never reads page text,
// URLs, form values, selectors, cookies, nor persists DOM handles.
function captureRegionGraph(onRegion=null){
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
    ':checked,:focus-visible,[contenteditable]:not([contenteditable="false"]),'+
    '[role="textbox"],[role="searchbox"],'+
    '[aria-live]:not([aria-live="off"]),'+
    'a[href],summary,[role="link"],[role="tab"],'+
    '[role="menuitem"],[role="combobox"],[role="listbox"]';
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
    const s=styleFor(el);
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
  let scanned=0,visited=0,frameCount=0,regionWalked=0;
  // Browser-native TreeWalker avoids allocating an unbounded querySelectorAll
  // NodeList before the count gates can stop scanning a huge page.
  // Legacy querySelectorAll is only a fallback for minimal test doubles.
  function* elements(root,onlyRegions){
    const doc=typeof root.createTreeWalker==='function'?
      root:root.ownerDocument;
    const walker=doc?.createTreeWalker?.(root,1);
    if(walker){
      for(let el=walker.nextNode();el;el=walker.nextNode()){
        if(onlyRegions&&++regionWalked>8000){yield null;return;}
        if(!onlyRegions||el.matches(selector))yield el;
      }
    }else{
      for(const el of root.querySelectorAll(onlyRegions?selector:'*')){
        if(onlyRegions&&++regionWalked>8000){yield null;return;}
        yield el;
      }
    }
  }
  // Traverse document and reachable OPEN shadow roots only. Hosts need not
  // match the region selector (e.g. a custom span). Each root is visited once.
  const scopes=[{root:document,depth:0,inFrame:false}],seen=new Set([document]);
  const styleFor=(el,pseudo)=>el.ownerDocument?.defaultView?.getComputedStyle?.(el,pseudo)||
    getComputedStyle(el,pseudo);
  const composedParent=el=>{
    if(el.parentElement)return el.parentElement;
    const root=el.getRootNode?.();
    return root?.host||root?.defaultView?.frameElement||null;
  };
  // Bounded computed-CSS warnings, not a rendered-pixel segmentation.
  const complexAncestor=el=>{
    let parent=composedParent(el);
    for(let n=0;parent&&n<12;n++,parent=composedParent(parent)){
      const s=styleFor(parent);
      if(paint(parent).background==='complex'||
        s.transform&&s.transform!=='none'||
        s.perspective&&s.perspective!=='none'||
        s.clipPath&&s.clipPath!=='none'||
        s.contain&&s.contain.split(' ').some(v=>v==='paint'||v==='strict'||v==='content')||
        s.isolation==='isolate'||
        s.willChange&&s.willChange.split(',').some(v=>
          ['transform','opacity','filter','perspective','clip-path']
            .includes(v.trim())))
        return true;
    }
    return !!parent; // ancestor chain too deep: never infer safety
  };
  const occlusionRisk=(el,rect,css)=>{
    if(['fixed','sticky','absolute'].includes(css.position)||
      css.transform&&css.transform!=='none'||
      css.perspective&&css.perspective!=='none'||
      css.clipPath&&css.clipPath!=='none'||
      css.isolation==='isolate')return true;
    // ElementFromPoint is only a bounded hit-test. Any unknown or unrelated
    // topmost element blocks "confirmed" status, not proof of visual coverage.
    const root=el.getRootNode?.();
    const scope=root?.elementFromPoint?root:el.ownerDocument||document;
    if(typeof scope.elementFromPoint!=='function')return false;
    const points=[[.5,.5],[.25,.25],[.75,.75]];
    for(const [fx,fy] of points){
      let hit;
      try{
        const w=scope.defaultView?.innerWidth??innerWidth;
        const h=scope.defaultView?.innerHeight??innerHeight;
        const x=Math.min(w-1,Math.max(0,rect.left+rect.width*fx));
        const y=Math.min(h-1,Math.max(0,rect.top+rect.height*fy));
        hit=scope.elementFromPoint(x,y);
      }catch{return true;}
      if(!hit)return true;
      let cursor=hit,inside=false;
      for(let i=0;cursor&&i<24;i++,cursor=composedParent(cursor)){
        if(cursor===el){inside=true;break;}
      }
      if(!inside)return true;
    }
    return false;
  };
  // Animation and transition configuration are risk indicators, not proof
  // of movement. Only scan a bounded composed-ancestor chain; never inspect
  // keyframes or animation targets/content.
  const motionRisk=el=>{
    const nonzero=value=>{
      if(typeof value!=='string'||!value.trim())return false;
      return value.split(',').some(unit=>{
        const s=unit.trim();
        if(!/^(?:\d+\.?\d*|\.\d+)(?:ms|s)$/.test(s))return true;
        return Number.parseFloat(s)>0;
      });
    };
    let node=el;
    for(let steps=0;node&&steps<12;steps++,node=composedParent(node)){
      const style=styleFor(node);
      if(!style)return true;
      if(style.animationName&&style.animationName!=='none'&&
        nonzero(style.animationDuration))return true;
      if(style.transitionProperty&&style.transitionProperty!=='none'&&
        nonzero(style.transitionDuration))return true;
      if(typeof node.getAnimations==='function'){
        try{
          if(node.getAnimations({subtree:false}).some(a=>
            a.playState==='running'||a.playState==='pending'))return true;
        }catch{return true;}
      }
    }
    return !!node; // deep chain: uncertain
  };
  // Search descendants in light DOM and accessible nested open shadow
  // roots. One shared node/scope budget prevents hidden controls from being
  // missed by querySelector() crossing no shadow boundary.
  const protectedDescendants=el=>{
    const pending=[el],seenRoots=new Set();
    let visited=0;
    while(pending.length){
      const root=pending.pop();
      if(seenRoots.has(root))continue;
      seenRoots.add(root);
      if(seenRoots.size>24)return true; // too many shadow scopes
      const walker=root.ownerDocument?.createTreeWalker?.(root,1);
      if(!walker){
        // Minimal non-browser test doubles only; no nested traversal possible.
        if(root.querySelector(protectedSelector))return true;
        if(root.shadowRoot?.mode==='open')pending.push(root.shadowRoot);
        continue;
      }
      if(root.shadowRoot?.mode==='open')pending.push(root.shadowRoot);
      for(let child=walker.nextNode();child;child=walker.nextNode()){
        if(++visited>512)return true; // one shared limit across scopes
        if(child.matches(protectedSelector))return true;
        if(child.shadowRoot?.mode==='open')pending.push(child.shadowRoot);
      }
    }
    return false;
  };
  const protectedAncestor=el=>{
    // closest() stops at shadow boundaries, so inspect each host explicitly.
    let cur=el;
    for(let depth=0;cur&&depth<10;depth++){
      if(cur.closest(protectedSelector))return true;
      const root=cur.getRootNode?.();
      const host=root?.host||root?.defaultView?.frameElement;
      if(!host)return false;
      cur=host;
    }
    return true; // unknown/deep chain: fail closed
  };
  try{
  for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
    const {root,depth,inFrame}=scopes[scopeIndex];
    for(const el of elements(root,true)){
      if(!el)return failed(scanned);
      if(++scanned>1600)return failed(scanned);
      if(!el.isConnected)return failed(scanned);
      if(protectedAncestor(el))continue;
    const rect=el.getBoundingClientRect();
    const viewport=el.ownerDocument?.defaultView;
    const vw=viewport?.innerWidth??innerWidth;
    const vh=viewport?.innerHeight??innerHeight;
    if(!Number.isFinite(vw)||vw<=0||!Number.isFinite(vh)||vh<=0)
      return failed(scanned);
    if(!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
      !Number.isFinite(rect.left)||!Number.isFinite(rect.top)||
      !Number.isFinite(rect.right)||!Number.isFinite(rect.bottom))
      return failed(scanned);
    if(rect.width<75||rect.height<28||rect.right<=0||
      rect.bottom<=0||rect.left>=vw||rect.top>=vh)
      continue;
    if(regions.length>=80)return failed(scanned);
    const style=styleFor(el);
    if(style.display==='none'||style.visibility==='hidden')continue;
    // Generated ::before / ::after may paint over a seemingly safe surface.
    // Record only a boolean. Never return generated CSS content strings.
    const before=styleFor(el,'::before');
    const after=styleFor(el,'::after');
    if(!before||typeof before.content!=='string'||
      !after||typeof after.content!=='string')return failed(scanned);
    const activePseudo=s=>s.content!=='none'&&
      s.content!=='normal'&&s.content!=='';
    const hasPseudoPaint=activePseudo(before)||activePseudo(after);
    const own=paint(el);
    const hasComplexAncestorPaint=complexAncestor(el);
    const hasOcclusionRisk=occlusionRisk(el,rect,style);
    const hasMotionRisk=motionRisk(el);
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
    // Inspect node TYPES only, never character data. A large/unusual
    // direct-child collection is not safe to classify from a partial scan.
    const childNodes=el.childNodes;
    if(!childNodes||!Number.isSafeInteger(childNodes.length)||
      childNodes.length>256)return failed(scanned);
    let hasDirectText=false;
    for(let i=0;i<childNodes.length;i++){
      if(childNodes[i]?.nodeType===3){hasDirectText=true;break;}
    }
    const node={index:regions.length,parent:parentIndex,
      background:own.background,ownLuma:own.ownLuma,effectiveLuma,
      widthFraction:Number(Math.min(1,rect.width/vw).toFixed(4)),
      heightFraction:Number(Math.min(1,rect.height/vh).toFixed(4)),
      areaFraction:Number(Math.min(1,rect.width*rect.height/
        (vw*vh)).toFixed(4)),
      kind:kind(el.tagName),hasDirectText,
      hasProtectedDescendants:protectedDescendants(el),
      focusWithin:!!el.matches(':focus-within'),
      // A multi-valued color-scheme declares native dark capability too.
      // Refuse automatic paint when dark is one of the tokens.
      nativeDark:typeof style.colorScheme==='string'&&
        style.colorScheme.split(/\s+/).includes('dark'),
      hasPseudoPaint,inFrame,
      hasOcclusionRisk,hasComplexAncestorPaint,hasMotionRisk};
      positions.set(el,node.index);
      regions.push(node);
      // Reviewer callback gets DOM handles only in ephemeral page memory.
      if(typeof onRegion==='function')onRegion(el,node.index,rect);
    }
    // Bounded host search includes non-region custom elements, which may own
    // a readable shadowRoot but no background or region role themselves.
    for(const host of elements(root,false)){
      if(!host)return failed(scanned);
      if(++visited>8000)return failed(scanned);
      const shadow=host.shadowRoot;
      if(shadow?.mode==='open'&&!seen.has(shadow)){
        if(protectedAncestor(host))continue;
        if(depth>=8||scopes.length>=24)return failed(scanned);
        seen.add(shadow);
        scopes.push({root:shadow,depth:depth+1,inFrame});
      }
      if(host.tagName!=='IFRAME')continue;
      if(protectedAncestor(host))continue;
      // Do not inspect src, navigation, URL or the parent iframe attributes.
      // Cross-origin/opaque/incomplete frames fail closed for the whole graph.
      let child;
      try{child=host.contentDocument;}catch{return failed(scanned);}
      if(!child||!child.body||typeof child.querySelectorAll!=='function')
        return failed(scanned);
      if(seen.has(child))continue;
      if(++frameCount>8||depth>=8||scopes.length>=24)return failed(scanned);
      seen.add(child);
      scopes.push({root:child,depth:depth+1,inFrame:true});
    }
  }
  if(!regions.length)return failed(scanned);
  return {kind:'p15-region-graph-v1',status:'ready',scanned,nodes:regions};
  }catch{
    // Detached DOM, changing shadow roots or CSSOM access failures must
    // discard the entire capture rather than expose a partial safe graph.
    return failed(scanned);
  }
}
module.exports=Object.freeze({captureRegionGraph});
