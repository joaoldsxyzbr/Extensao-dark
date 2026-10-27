'use strict';
// P13: multi-surface preview ONLY inside disposable Chromium. No MV3 runtime.
// Capture bounded CSS values; do not inspect text, link URLs or form values.
const colors=require('../content/colors.js');
function planIslands(samples,api=colors){
  if(!Array.isArray(samples)||samples.length>24)throw TypeError('P13: samples');
  const result=[];
  for(const row of samples){
    if(!row||!Number.isSafeInteger(row.index)||row.index<0||
      typeof row.background!=='string'||!Number.isFinite(row.width)||
      !Number.isFinite(row.height)||row.width<75||row.height<28)
      throw TypeError('P13: surface record');
    const bg=api.parseColor(row.background);
    if(!bg||bg.a<.999)throw TypeError('P13: opaque background required');
    const target=api.mapBackground(bg,'deep');
    const parsed=api.parseColor(target);
    if(!parsed||api.luminance(parsed)>.18)continue;
    result.push({index:row.index,source:row.background,target});
  }
  return result;
}
function suggestTextRepair(before,after,targets,api=colors){
  const valid=x=>x&&Array.isArray(x.rows)&&x.rows.length>0&&
    x.rows.length<=240&&x.truncated===false;
  if(!valid(before)||!valid(after)||before.rows.length!==after.rows.length)
    return {status:'inconclusive',reason:'unbounded-or-changing-text',repairs:[]};
  const colorsSet=new Set(targets.map(x=>x.target));
  const repairs=[];
  for(let i=0;i<before.rows.length;i++){
    const old=before.rows[i],now=after.rows[i];
    if(!old||!now||!Number.isFinite(old.size)||!Number.isFinite(old.weight)||
      !Number.isFinite(now.size)||!Number.isFinite(now.weight)||
      typeof now.fg!=='string'||typeof now.bg!=='string')
      return {status:'inconclusive',reason:'unknown-css',repairs:[]};
    const a=api.parseColor(old.fg),b=api.parseColor(old.bg),
      c=api.parseColor(now.fg),d=api.parseColor(now.bg);
    if(!a||!b||!c||!d||[a,b,c,d].some(x=>x.a<.999))
      return {status:'inconclusive',reason:'complex-background',repairs:[]};
    const limit=old.size>=24||(old.size>=18.66&&old.weight>=700)?3:4.5;
    const prev=api.contrastRatio(a,b),next=api.contrastRatio(c,d);
    if(next+.0001>=limit||next+.0001>=prev)continue;
    if(old.protected||now.protected)
      return {status:'blocked',reason:'protected-text-regression',repairs:[]};
    if(!colorsSet.has(now.bg))
      return {status:'blocked',reason:'non-target-background-regression',repairs:[]};
    if(repairs.length>=150)
      return {status:'inconclusive',reason:'repair-cap',repairs:[]};
    const color=api.ensureContrast(c,d,limit),adjusted=api.parseColor(color);
    if(!adjusted||api.contrastRatio(adjusted,d)+.0001<limit)
      return {status:'blocked',reason:'unrepairable-contrast',repairs:[]};
    repairs.push({index:i,background:now.bg,color});
  }
  return {status:'ready',repairs};
}
function evaluateIslandContrast(before,after,api=colors){
  if(!before||!after||before.truncated||after.truncated||
    !Array.isArray(before.rows)||!Array.isArray(after.rows)||
    before.rows.length===0||before.rows.length!==after.rows.length)
    return {status:'inconclusive',newWeak:0,reason:'incomplete-audit'};
  let newWeak=0,worsened=0;
  for(let i=0;i<before.rows.length;i++){
    const a=before.rows[i],b=after.rows[i];
    if(!a||!b||![a.fg,a.bg,b.fg,b.bg].every(v=>typeof v==='string'))
      return {status:'inconclusive',newWeak,reason:'missing-css'};
    const oldfg=api.parseColor(a.fg),oldbg=api.parseColor(a.bg),
      fg=api.parseColor(b.fg),bg=api.parseColor(b.bg);
    if(!oldfg||!oldbg||!fg||!bg||[oldfg,oldbg,fg,bg].some(x=>x.a<.999))
      return {status:'inconclusive',newWeak,reason:'unknown-background'};
    const limit=a.size>=24||(a.size>=18.66&&a.weight>=700)?3:4.5;
    const original=api.contrastRatio(oldfg,oldbg),now=api.contrastRatio(fg,bg);
    if(original+.0001>=limit&&now+.0001<limit)newWeak++;
    if(original+.0001<limit&&now+.2<original)worsened++;
  }
  return {status:newWeak||worsened?'blocked':'safe-in-sample',
    newWeak,worsened,audited:before.rows.length};
}
// Executed as a function string in ephemeral headless Chromium. The browser
// alone holds DOM handles, original inline CSS and computed color metadata.
function islandSession(action,operations=[]){
  const KEY='__darkP13Islands';
  const rgb=/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
  const css=el=>getComputedStyle(el);
  const selector='main,header,nav,aside,section,article,div,table,pre,blockquote';
  const textSelector='p,a,li,td,th,h1,h2,h3,h4,h5,h6,span,small,strong,em,code,label,button';
  const visible=el=>{
    const r=el.getBoundingClientRect();
    return r.width>=3&&r.height>=3&&r.bottom>0&&r.top<innerHeight&&
      r.right>0&&r.left<innerWidth;
  };
  if(action==='start'){
    if(globalThis[KEY])throw Error('P13: session already started');
    const surfaces=[];let scanned=0,truncated=false;
    for(const el of document.querySelectorAll(selector)){
      if(++scanned>8500){truncated=true;break;}
      if(!visible(el))continue;
      if(el.closest('button,input,textarea,select,svg,canvas,video,'+
        '[role="button"],[role="img"],[aria-selected="true"],[disabled]'))continue;
      const st=css(el),r=el.getBoundingClientRect();
      if(r.width<75||r.height<28||st.backgroundImage!=='none'||
        st.maskImage!=='none'||st.webkitMaskImage!=='none'||
        st.opacity!=='1'||st.mixBlendMode!=='normal')continue;
      const match=/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(st.backgroundColor);
      if(!match)continue;
      const ch=match.slice(1).map(Number);
      if(Math.min(...ch)<182||Math.max(...ch)-Math.min(...ch)>40)continue;
      if(surfaces.length>=24){truncated=true;break;}
      surfaces.push(el);
    }
    const auditNodes=[];let textScanned=0;
    if(!truncated)for(const el of document.querySelectorAll(textSelector)){
      if(++textScanned>8500){truncated=true;break;}
      if(!visible(el)||!surfaces.some(s=>s.contains(el)))continue;
      if(el.closest('svg,canvas,picture,video,script,style'))continue;
      const st=css(el);
      if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.95)continue;
      if(auditNodes.length>=240){truncated=true;break;}
      auditNodes.push(el);
    }
    if(truncated||surfaces.length===0||auditNodes.length===0)
      return {status:'inconclusive',reason:'empty-or-truncated-surface',
        surfaces:surfaces.length,visibleText:auditNodes.length};
    const samples=surfaces.map((el,index)=>{
      const rect=el.getBoundingClientRect(),st=css(el);
      return {index,background:st.backgroundColor,
        width:Math.round(rect.width),height:Math.round(rect.height)};
    });
    Object.defineProperty(globalThis,KEY,{configurable:true,
      value:{surfaces,auditNodes,samples,backup:new Map(),active:false}});
    return {status:'ready',samples};
  }
  const state=globalThis[KEY];
  if(!state)throw Error('P13: missing island session');
  const save=el=>{
    if(!state.backup.has(el))state.backup.set(el,el.getAttribute('style'));
  };
  if(action==='audit'){
    const rows=state.auditNodes.map(el=>{
      if(!el.isConnected||!visible(el))return null;
      const st=css(el);
      if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.95)return null;
      let bg=null,cur=el;
      for(let hops=0;cur&&hops<15;hops++,cur=cur.parentElement){
        const x=css(cur),color=x.backgroundColor;
        if(x.backgroundImage!=='none'||x.maskImage!=='none'||
          x.webkitMaskImage!=='none'||Number(x.opacity)<.99||
          x.mixBlendMode!=='normal')return null;
        if(/^rgb\(/.test(color)){bg=color;break;}
        const m=/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\s*\)$/.exec(color);
        if(!m||Number(m[1])>.001)return null;
      }
      const size=parseFloat(st.fontSize),weight=parseInt(st.fontWeight,10)||400;
      return bg&&rgb.test(st.color)&&Number.isFinite(size)?
        {fg:st.color,bg,size,weight,
          protected:!!el.closest('button,input,textarea,select,svg,canvas,'+
            '[role="button"],[role="img"],[aria-disabled="true"],'+
            '[aria-selected="true"],[disabled]')}:null;
    });
    return {rows,truncated:false};
  }
  if(action==='paint'){
    if(state.active||!Array.isArray(operations)||operations.length<1||
      operations.length>24)throw Error('P13: invalid paint phase');
    const ids=new Set();
    for(const patch of operations){
      if(!patch||!Number.isSafeInteger(patch.index)||ids.has(patch.index)||
        patch.index<0||patch.index>=state.samples.length||
        patch.source!==state.samples[patch.index].background||
        typeof patch.target!=='string'||!rgb.test(patch.target)||
        css(state.surfaces[patch.index]).backgroundColor!==patch.source)
        throw Error('P13: unsafe surface proposal');
      ids.add(patch.index);
    }
    for(const patch of operations){
      const el=state.surfaces[patch.index];
      save(el);el.style.setProperty('background-color',patch.target,'important');
    }
    state.active=true;
    return {painted:operations.length};
  }
  if(action==='recolor'){
    if(!state.active||!Array.isArray(operations)||operations.length>150)
      throw Error('P13: text phase invalid');
    const used=new Set(),snapshot=islandSession('audit');
    for(const patch of operations){
      if(!patch||!Number.isSafeInteger(patch.index)||
        patch.index<0||patch.index>=state.auditNodes.length||
        used.has(patch.index)||!rgb.test(patch.color)||
        snapshot.rows[patch.index]?.bg!==patch.background||
        snapshot.rows[patch.index]?.protected)
        throw Error('P13: unsafe text proposal');
      used.add(patch.index);
    }
    for(const patch of operations){
      const el=state.auditNodes[patch.index];
      save(el);el.style.setProperty('color',patch.color,'important');
    }
    return {recolored:operations.length};
  }
  if(action==='restore'){
    for(const [el,old] of state.backup){
      if(old===null)el.removeAttribute('style');else el.setAttribute('style',old);
    }
    const same=(newValue,old)=>newValue===old||(old===null&&newValue==='');
    const ok=[...state.backup].every(([el,old])=>
      same(el.getAttribute('style'),old));
    state.backup.clear();state.active=false;
    return {ok};
  }
  if(action==='close'){
    if(state.active||state.backup.size)throw Error('P13: open transaction');
    delete globalThis[KEY];return {closed:true};
  }
  throw Error('P13: action unsupported');
}
module.exports=Object.freeze({planIslands,suggestTextRepair,evaluateIslandContrast,islandSession});
