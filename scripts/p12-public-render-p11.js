#!/usr/bin/env node
'use strict';
// P12: render P11 against public, already-known diagnostic pages in a disposable
// Chromium profile. This is NOT an extension integration or a blind holdout.
// No text, values, cookies, HTML, URLs or selectors are transferred from pages.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const colors=require('../content/colors.js');
const core=require('../vendor/neural_core/neural-core.js');
const {launch,sleep,ROOT}=require('./browser-e2e.js');
const {SITES}=require('./p12-public-site-audit.js');
const {loadCandidate,featuresFor,predictText}=require('../training/p11-descendant-runtime.js');

const CASES=Object.freeze(SITES.filter(s=>
  ['python-docs','rfc-editor','iana-reserved'].includes(s.id)));
const BG='rgb(26, 32, 40)';
const FOLDER=path.join(ROOT,'browser-results/p12-public-rendered');
const EXPRESSION=(fn,...args)=>'('+fn.toString()+')('+args.map(JSON.stringify).join(',')+')';
const ID='__p12PublicColorSession';

// Executed exclusively through CDP in anonymous public pages.
function pageExperiment(action, operations=[]){
  const key='__p12PublicColorSession';
  const rgb=/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/;
  const css=el=>getComputedStyle(el);
  const eligible='p,a,li,td,th,h1,h2,h3,small,strong,em,code,span';
  if(action==='start'){
    if(globalThis[key])throw Error('P12: session already active');
    // Some public sites render a decorative <main> or an empty article
    // before their actual content. Inspect candidate regions conservatively
    // and use body only if every narrower region lacks eight usable texts.
    const candidates=[...document.querySelectorAll(
      'main,article,#content,#main,.document,.content'
    ),document.body].filter(Boolean);
    let selected=null;
    for(const surface of candidates){
      const nodes=[],rows=[];
      for(const el of surface.querySelectorAll(eligible)){
      if(nodes.length>=80)break;
      if(el.closest('button,input,textarea,select,svg,canvas,video,script,'+
        '[role="img"],[aria-disabled="true"],[disabled],[aria-selected="true"]'))continue;
      const style=css(el),rect=el.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<.99||
        rect.width<16||rect.height<8||rect.bottom<=0||rect.top>=innerHeight||
        rect.right<=0||rect.left>=innerWidth||style.backgroundImage!=='none'||
        style.maskImage!=='none'||style.webkitMaskImage!=='none')continue;
      // No intervening painted surfaces or translucent overlays. This subset is
      // necessary to know the background after recoloring the parent.
      let safe=true,current=el;
      while(current&&current!==surface){
        const s=css(current),bg=s.backgroundColor;
        if(s.backgroundImage!=='none'||s.maskImage!=='none'||
          s.webkitMaskImage!=='none'||!/^rgba?\(/.test(bg)){safe=false;break;}
        if(bg.startsWith('rgb(')){safe=false;break;}
        const match=bg.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        if(!match||Number(match[1])>.001){safe=false;break;}
        current=current.parentElement;
      }
      if(!safe||current!==surface||!/^rgb\(/.test(style.color))continue;
      const size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight,10)||400;
      if(!Number.isFinite(size)||size<5||size>120)continue;
      nodes.push(el);
      rows.push({color:style.color,tag:el.tagName,size,weight});
      }
      if(rows.length>=8){selected={surface,nodes,rows};break;}
    }
    if(!selected)return {status:'inconclusive',
      reason:'insufficient-safe-visible-text',samples:0};
    const {surface,nodes,rows}=selected;
    // Resolve effective original paint behind transparent content region.
    let sourceBackground=null,node=surface;
    while(node){
      const s=css(node),bg=s.backgroundColor;
      if(s.backgroundImage!=='none')break;
      if(bg.startsWith('rgb(')){sourceBackground=bg;break;}
      const rgba=bg.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
      if(rgba&&Number(rgba[1])>=.999){sourceBackground=bg;break;}
      if(rgba&&Number(rgba[1])>.001)break;
      node=node.parentElement;
    }
    if(!sourceBackground||rows.length<8)return {status:'inconclusive',
      reason:!sourceBackground?'complex-background':'insufficient-safe-visible-text',
      samples:rows.length};
    // Separate, bounded safety cohort. Includes text that P11 does NOT modify.
    // Stable element handles stay inside the disposable browser session only.
    const auditNodes=[];
    let inspected=0,auditTruncated=false;
    for(const el of surface.querySelectorAll(
      'p,a,li,td,th,label,small,strong,em,code,span,h1,h2,h3,h4,h5,h6,button'
    )){
      if(++inspected>12000){auditTruncated=true;break;}
      if(el.closest('svg,canvas,picture,script,style,video'))continue;
      // Skip off-screen boxes before expensive computed-style reads. A large
      // documentation page can have thousands of elements but few in viewport.
      const r=el.getBoundingClientRect();
      if(r.width<3||r.height<3||r.right<=0||r.bottom<=0||
        r.top>=innerHeight||r.left>=innerWidth)continue;
      const st=css(el);
      if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.95)continue;
      if(auditNodes.length>=360){auditTruncated=true;break;}
      auditNodes.push(el);
    }
    Object.defineProperty(globalThis,key,{configurable:true,value:{
      surface,nodes,baseline:rows,sourceBackground,backup:null,
      auditNodes,auditTruncated
    }});
    return {status:'ready',sourceBackground,rows};
  }
  const state=globalThis[key];
  if(!state)throw Error('P12: no active page session');
  if(action==='measure')return {
    background:css(state.surface).backgroundColor,
    colors:state.nodes.map(el=>css(el).color)
  };
  if(action==='audit'){
    const rows=state.auditNodes.map(el=>{
      if(!el.isConnected)return null;
      const st=css(el),box=el.getBoundingClientRect();
      if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)<.95||
        box.width<3||box.height<3||box.right<=0||box.bottom<=0||
        box.top>=innerHeight||box.left>=innerWidth||
        !/^rgba?\(/.test(st.color))return null;
      let background=null,cur=el;
      for(let depth=0;cur&&depth<16;depth++,cur=cur.parentElement){
        const x=css(cur),col=x.backgroundColor;
        if(x.backgroundImage!=='none'||x.maskImage!=='none'||
          x.webkitMaskImage!=='none'||Number(x.opacity)<.99||
          x.mixBlendMode!=='normal'||!/^rgba?\(/.test(col))return null;
        if(col.startsWith('rgb(')){background=col;break;}
        const match=col.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        if(!match)return null;
        const alpha=Number(match[1]);
        if(alpha>=.999){background=col;break;}
        if(alpha>.001)return null;
      }
      const size=parseFloat(st.fontSize),weight=parseInt(st.fontWeight,10)||400;
      if(!background||!Number.isFinite(size)||!Number.isFinite(weight))
        return null;
      return {fg:st.color,bg:background,size,weight,tag:el.tagName};
    });
    return {rows,truncated:state.auditTruncated};
  }
  if(action==='apply'){
    if(state.backup)throw Error('P12: restore before applying next phase');
    if(!Array.isArray(operations)||operations.length!==state.nodes.length||
      operations.some((color)=>typeof color!=='string'||!rgb.test(color)))
      throw Error('P12: invalid palette');
    const saved=[state.surface,...state.nodes].map(el=>({
      element:el,inline:el.getAttribute('style')
    }));
    state.backup=saved;
    try{
      state.surface.style.setProperty('background-color','rgb(26, 32, 40)','important');
      state.surface.style.setProperty('color','rgb(241, 243, 246)','important');
      state.nodes.forEach((el,i)=>el.style.setProperty('color',operations[i],'important'));
      return {applied:state.nodes.length};
    }catch(error){
      for(const item of saved){
        if(item.inline===null)item.element.removeAttribute('style');
        else item.element.setAttribute('style',item.inline);
      }
      state.backup=null;
      throw error;
    }
  }
  if(action==='repair'){
    if(!state.backup||!Array.isArray(operations)||operations.length>160)
      throw Error('P12: repair outside active color transaction');
    const seen=new Set();
    for(const op of operations){
      if(!op||!Number.isSafeInteger(op.index)||op.index<0||
        op.index>=state.auditNodes.length||seen.has(op.index)||
        typeof op.color!=='string'||!rgb.test(op.color))
        throw Error('P12: invalid repair');
      seen.add(op.index);
      const el=state.auditNodes[op.index],st=css(el);
      if(!el.isConnected||el===state.surface||
        el.closest('button,input,textarea,select,svg,canvas,video,'+
          '[role="button"],[role="img"],[aria-disabled="true"],'+
          '[aria-selected="true"],[disabled]')||
        st.backgroundImage!=='none'||st.maskImage!=='none'||
        st.webkitMaskImage!=='none'||
        !/^rgba?\\(/.test(st.backgroundColor)||
        st.backgroundColor.startsWith('rgb('))
        throw Error('P12: descendant protection blocked repair');
    }
    // Append only nodes that were not already saved in the transaction.
    for(const op of operations){
      const el=state.auditNodes[op.index];
      if(!state.backup.some(saved=>saved.element===el))
        state.backup.push({element:el,inline:el.getAttribute('style')});
      el.style.setProperty('color',op.color,'important');
    }
    return {repaired:operations.length};
  }
  if(action==='restore'){
    if(!state.backup)throw Error('P12: no active color phase');
    const saved=state.backup;
    for(const item of saved){
      if(item.inline===null)item.element.removeAttribute('style');
      else item.element.setAttribute('style',item.inline);
    }
    const equivalent=(current,previous)=>current===previous||
      previous===null&&current==='';
    const mismatch=saved.some(item=>!equivalent(
      item.element.getAttribute('style'),item.inline));
    state.backup=null;
    return {restored:state.nodes.length,restoredDescendants:Math.max(0,saved.length-1-state.nodes.length),ok:!mismatch};
  }
  if(action==='close'){
    if(state.backup)throw Error('P12: restore before close');
    delete globalThis[key];return {closed:true};
  }
  throw Error('P12: unknown page action');
}
function allowedOutput(folder){
  if(path.resolve(folder)!==FOLDER)throw Error('P12: output must remain in disposable artifacts');
  return FOLDER;
}
function checkCapture(capture){
  if(!capture||capture.status!=='ready'||!Array.isArray(capture.rows)||
    capture.rows.length<8||capture.rows.length>80||
    Object.keys(capture).some(k=>!['status','sourceBackground','rows'].includes(k)))
    throw TypeError('P12: incomplete public CSS sample');
  const bg=colors.parseColor(capture.sourceBackground);
  if(!bg||bg.a<.999)throw TypeError('P12: source background invalid');
  for(const row of capture.rows){
    if(!row||Object.keys(row).some(k=>!['color','tag','size','weight'].includes(k))||
      !/^(P|A|LI|TD|TH|H1|H2|H3|SMALL|STRONG|EM|CODE|SPAN)$/.test(row.tag)||
      !colors.parseColor(row.color)||colors.parseColor(row.color).a<.999||
      !Number.isFinite(row.size)||!Number.isFinite(row.weight))
      throw TypeError('P12: private or malformed content in CSS sample');
  }
  return true;
}
function minContrast(row){
  return row.size>=24||row.size>=18.66&&row.weight>=700?3:4.5;
}
function plans(capture,predict){
  checkCapture(capture);
  if(typeof predict!=='function')throw TypeError('P12: prediction not callable');
  const bg=colors.parseColor(BG);
  const teacher=[],neural=[];
  let accepted=0,rejected=0,changed=0;
  for(const row of capture.rows){
    const old=colors.parseColor(row.color),required=minContrast(row);
    const safe=colors.contrastRatio(old,bg)>=required?row.color:
      colors.ensureContrast(old,bg,required);
    if(!safe||colors.contrastRatio(colors.parseColor(safe),bg)+.00001<required)
      throw Error('P12: teacher contrast invalid');
    teacher.push(safe);
    if(safe!==row.color)changed++;
    const input=featuresFor(colors,{background:BG,text:row.color,
      sourceBackground:capture.sourceBackground,isLink:row.tag==='A',
      isLarge:required===3,explicitColor:true});
    const proposed=predict(input);
    if(proposed?.action==='reject'){neural.push(safe);rejected++;}
    else if(proposed?.action==='suggest'&&
      typeof proposed.color==='string'&&
      colors.contrastRatio(colors.parseColor(proposed.color),bg)+.00001>=required){
      neural.push(proposed.color);accepted++;
    }else throw Error('P12: unsafe model response');
  }
  return {teacher,neural,stats:{total:teacher.length,accepted,rejected,changed,
    fallbackUsed:rejected,coverage:accepted/teacher.length}};
}
function checkPaint(capture,measured,painted){
  checkCapture(capture);
  if(!measured||!Array.isArray(measured.colors)||
    measured.colors.length!==capture.rows.length)throw Error('P12: missing computed CSS samples');
  const target=colors.parseColor(painted?BG:capture.sourceBackground);
  const bg=colors.parseColor(measured.background);
  if(painted&&(!bg||colors.contrastRatio(bg,target)!==1))
    throw Error('P12: target surface was not painted');
  if(!painted&&(!bg||bg.a<0))throw Error('P12: restored computed background absent');
  let weak=0;
  for(let i=0;i<measured.colors.length;i++){
    const fg=colors.parseColor(measured.colors[i]);
    if(!fg||!target||colors.contrastRatio(fg,target)+.0001<minContrast(capture.rows[i]))
      weak++;
  }
  return {sampled:measured.colors.length,weak};
}
// Compare every visible text-like element in the sampled surface, including
// descendants excluded from the 80-element neural plan. Every page record has
// only numeric typography and CSS RGB; IDs and text never leave Chromium.
function assessSurfaceContrast(before,after,colorUtils=colors){
  const valid=doc=>doc&&Array.isArray(doc.rows)&&doc.rows.length>=1&&
    doc.rows.length<=360&&typeof doc.truncated==='boolean';
  if(!valid(before)||!valid(after)||before.truncated||after.truncated||
     before.rows.length!==after.rows.length)
    return {status:'inconclusive',audited:0,newWeak:0,
      reason:'incomplete-surface-sample',
      countBefore:Array.isArray(before?.rows)?before.rows.length:null,
      countAfter:Array.isArray(after?.rows)?after.rows.length:null,
      truncatedBefore:before?.truncated===true,
      truncatedAfter:after?.truncated===true};
  let newWeak=0,worsened=0,alreadyWeak=0;
  for(let i=0;i<before.rows.length;i++){
    const a=before.rows[i],b=after.rows[i];
    const color=row=>{
      if(!row||!Number.isFinite(row.size)||!Number.isFinite(row.weight)||
        !['string'].every(type=>typeof row.fg===type&&typeof row.bg===type))
        return null;
      const fg=colorUtils.parseColor(row.fg),bg=colorUtils.parseColor(row.bg);
      if(!fg||!bg||fg.a<.999||bg.a<.999)return null;
      return colorUtils.contrastRatio(fg,bg);
    };
    const first=color(a),second=color(b);
    if(first===null||second===null)
      return {status:'inconclusive',audited:i,newWeak,
        reason:'unknown-or-changing-background'};
    const threshold=a.size>=24||a.size>=18.66&&a.weight>=700?3:4.5;
    if(first+.0001<threshold)alreadyWeak++;
    if(first+.0001>=threshold&&second+.0001<threshold)newWeak++;
    if(first+.0001<threshold&&second+.2<first)worsened++;
  }
  return {status:newWeak||worsened?'blocked':'safe-in-sample',
    audited:before.rows.length,newWeak,worsened,alreadyWeak,
    reason:newWeak||worsened?'contrast-regression':'no-new-sampled-contrast-regression'};
}
// Compute minimal modifications required for previously readable descendants.
// No content or element identity leaves Chromium: indices refer to the bounded
// visual audit cohort. All uncertain/protected cases fail closed.
function planDescendantRepairs(before,after,colorUtils=colors,targetBg=BG){
  if(!before||!after||!Array.isArray(before.rows)||!Array.isArray(after.rows)||
    before.rows.length!==after.rows.length||before.rows.length===0||
    before.rows.length>360||before.truncated||after.truncated)
    return {status:'inconclusive',reason:'incomplete-audit',repairs:[]};
  const target=colorUtils.parseColor(targetBg);
  if(!target||target.a<.999)
    return {status:'inconclusive',reason:'unknown-target-background',repairs:[]};
  const protectedTags=new Set(['BUTTON','INPUT','TEXTAREA','SELECT']);
  const repairs=[];
  for(let i=0;i<before.rows.length;i++){
    const old=before.rows[i],now=after.rows[i];
    if(!old||!now||!Number.isFinite(old.size)||!Number.isFinite(old.weight)||
      !Number.isFinite(now.size)||!Number.isFinite(now.weight))
      return {status:'inconclusive',reason:'unknown-css',repairs:[]};
    const bg=colorUtils.parseColor(now.bg),fg=colorUtils.parseColor(now.fg);
    const oldBg=colorUtils.parseColor(old.bg),oldFg=colorUtils.parseColor(old.fg);
    if(!bg||!fg||!oldBg||!oldFg||
      [bg,fg,oldBg,oldFg].some(x=>x.a<.999))
      return {status:'inconclusive',reason:'unsupported-transparency',repairs:[]};
    const minimum=old.size>=24||old.size>=18.66&&old.weight>=700?3:4.5;
    const first=colorUtils.contrastRatio(oldFg,oldBg);
    const second=colorUtils.contrastRatio(fg,bg);
    const regressed=first+.0001>=minimum&&second+.0001<minimum ||
      first+.0001<minimum&&second+.2<first;
    if(!regressed)continue;
    if(protectedTags.has(now.tag)||protectedTags.has(old.tag))
      return {status:'blocked',reason:'protected-descendant',repairs:[]};
    if(colorUtils.contrastRatio(bg,target)!==1)
      return {status:'blocked',reason:'independent-or-unknown-background',repairs:[]};
    if(repairs.length>=160)
      return {status:'inconclusive',reason:'repair-limit',repairs:[]};
    const suggestion=colorUtils.ensureContrast(fg,bg,minimum);
    const safe=colorUtils.parseColor(suggestion);
    if(!safe||colorUtils.contrastRatio(safe,bg)+.0001<minimum)
      return {status:'blocked',reason:'no-safe-descendant-color',repairs:[]};
    repairs.push({index:i,color:suggestion});
  }
  return {status:'ready',reason:'all-regressions-repairable',repairs};
}
async function inspect(site,predict){
  let browser;
  const started=performance.now();
  try{
    browser=await launch(null);
    await browser.page.navigate(site.url,{fixtureReady:false});
    const origin=await browser.page.eval('location.origin');
    const expected=new URL(site.url);
    if(new URL(origin).hostname!==expected.hostname)
      return {site:site.id,status:'inconclusive',reason:'redirect-outside-public-domain'};
    await sleep(400);
    const capture=await browser.page.eval(EXPRESSION(pageExperiment,'start'));
    if(capture?.status!=='ready')return {site:site.id,status:'inconclusive',
      reason:capture?.reason||'unavailable-css-samples',samples:capture?.samples||0};
    checkCapture(capture);
    const original=await browser.page.eval(EXPRESSION(pageExperiment,'measure'));
    const originalAudit=await browser.page.eval(EXPRESSION(pageExperiment,'audit'));
    const computeStart=performance.now();
    const plan=plans(capture,predict);
    const planningMs=Number((performance.now()-computeStart).toFixed(2));
    const report={site:site.id,status:'observed',
      samples:plan.stats.total,stats:{...plan.stats,planningMs},phases:{},
      promoEligible:false,rendering:'isolated-real-dom-partial-surface',
      performanceMs:0,restorationVerified:false};
    await browser.page.screenshot(path.join(FOLDER,site.id+'-original.png'));
    for(const phase of ['teacher','neural']){
      const operations=plan[phase];
      const applied=await browser.page.eval(EXPRESSION(pageExperiment,'apply',operations));
      try{
        assert.equal(applied.applied,operations.length);
        // Before a screenshot, reconcile previously readable descendants
        // that lost contrast because their ancestor became dark. Never touch
        // protected controls or children with their own painted background.
        const preRepair=await browser.page.eval(EXPRESSION(pageExperiment,'audit'));
        const repairs=planDescendantRepairs(originalAudit,preRepair);
        let repaired=0;
        if(repairs.status==='ready'&&repairs.repairs.length){
          const appliedRepair=await browser.page.eval(
            EXPRESSION(pageExperiment,'repair',repairs.repairs));
          assert.equal(appliedRepair.repaired,repairs.repairs.length);
          repaired=appliedRepair.repaired;
        }
        const full=await browser.page.eval(EXPRESSION(pageExperiment,'audit'));
        const gate=repairs.status==='ready'?
          assessSurfaceContrast(originalAudit,full):
          {status:repairs.status,reason:repairs.reason};
        report.phases[phase]={status:gate.status,surfaceAudit:gate,
          repairedDescendants:repaired,repairGate:repairs.status};
        if(gate.status==='safe-in-sample'){
          const snapshot=await browser.page.eval(EXPRESSION(pageExperiment,'measure'));
          const measured=checkPaint(capture,snapshot,true);
          assert.equal(measured.weak,0,'P12: text below contrast threshold');
          await browser.page.screenshot(path.join(FOLDER,site.id+'-'+phase+'.png'));
          report.phases[phase]={...report.phases[phase],...measured,
            image:site.id+'-'+phase+'.png'};
        }
      }finally{
        const restored=await browser.page.eval(EXPRESSION(pageExperiment,'restore'));
        assert.equal(restored.ok,true,'P12: inline CSS rollback failed');
        assert.equal(restored.restored,operations.length);
      }
      const after=await browser.page.eval(EXPRESSION(pageExperiment,'measure'));
      assert.deepEqual(after,original,'P12: computed CSS was not restored');
      const afterAudit=await browser.page.eval(EXPRESSION(pageExperiment,'audit'));
      assert.deepEqual(afterAudit,originalAudit,'P12: full-text CSS was not restored');
    }
    await browser.page.eval(EXPRESSION(pageExperiment,'close'));
    report.restorationVerified=true;
    report.performanceMs=Math.round(performance.now()-started);
    return report;
  }catch(error){
    if(error instanceof TypeError||error.code==='ERR_ASSERTION')throw error;
    // Report explicit uncertainty rather than fabricate an approved site.
    return {site:site.id,status:'inconclusive',reason:'browser-or-render-error'};
  }finally{if(browser)await browser.stop();}
}
async function main(){
  allowedOutput(FOLDER);
  fs.mkdirSync(FOLDER,{recursive:true});
  const candidate=JSON.parse(fs.readFileSync(path.join(ROOT,
    'data/p11-descendant-ci-candidate.json'),'utf8'));
  const model=loadCandidate(core,candidate);
  const predict=input=>predictText(core,model,input,colors);
  const report={kind:'p12-public-dom-p11-preview-not-mv3',
    noPersonalData:true,promotionEligible:false,readyForRelease:false,
    humanReviewed:false,
    note:'Parcial: aplica fundo escuro ao contêiner principal e cor de texto aos nós seguros visíveis; não é aplicação MV3 completa. Sites já vistos na auditoria anterior.',
    sites:[]};
  for(const site of CASES){
    const result=await inspect(site,predict);
    report.sites.push(result);
    fs.writeFileSync(path.join(FOLDER,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('P12 rendered',result.site,result.status,
      result.status==='observed'?JSON.stringify(result.stats):result.reason);
  }
  report.completed=true;
  report.observed=report.sites.filter(s=>s.status==='observed').length;
  report.inconclusive=report.sites.length-report.observed;
  fs.writeFileSync(path.join(FOLDER,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(report.observed<2)throw Error('P12: fewer than two real pages rendered');
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
      '### P12 — P11 renderizado em DOM público parcial, sem extensão',
      '| Site | Estado | Textos | P11 aceita | Fallback | CSS restaurado |',
      '|---|---|---:|---:|---:|---|',
      ...report.sites.map(s=>'| '+s.site+' | '+s.status+' | '+(s.samples??'—')+
        ' | '+(s.stats?.accepted??'—')+' | '+(s.stats?.rejected??'—')+
        ' | '+(s.restorationVerified?'sim':'inconclusivo')+' |'),
      '',
      '**Promoção bloqueada.** A amostra é um recorte de sites já conhecidos, não a extensão integrada.',
      ''
    ].join('\n'));
  }
  report.blockedPhases=report.sites.reduce((n,s)=>
    n+Object.values(s.phases||{}).filter(p=>p.status==='blocked').length,0);
  report.inconclusivePhases=report.sites.reduce((n,s)=>
    n+Object.values(s.phases||{}).filter(p=>p.status==='inconclusive').length,0);
  report.readyForRelease=false;
  fs.writeFileSync(path.join(FOLDER,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('P12 rendered summary',JSON.stringify({
    observed:report.observed,inconclusive:report.inconclusive,
    blockedPhases:report.blockedPhases,inconclusivePhases:report.inconclusivePhases,
    promotionEligible:false
  }));
}
if(require.main===module)main().catch(e=>{
  console.error('P12 rendered failed:',e.stack||e);process.exitCode=1;
});
module.exports=Object.freeze({CASES,BG,allowedOutput,checkCapture,plans,checkPaint,pageExperiment,assessSurfaceContrast,planDescendantRepairs});
