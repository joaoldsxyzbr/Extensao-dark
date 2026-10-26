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
    const surface=document.querySelector('main,article,#content,#main,.document,.content')||document.body;
    if(!surface)throw Error('P12: no public surface');
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
    Object.defineProperty(globalThis,key,{configurable:true,value:{
      surface,nodes,baseline:rows,sourceBackground,backup:null
    }});
    return {status:'ready',sourceBackground,rows};
  }
  const state=globalThis[key];
  if(!state)throw Error('P12: no active page session');
  if(action==='measure')return {
    background:css(state.surface).backgroundColor,
    colors:state.nodes.map(el=>css(el).color)
  };
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
    return {restored:state.nodes.length,ok:!mismatch};
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
    const plan=plans(capture,predict);
    const report={site:site.id,status:'observed',
      samples:plan.stats.total,stats:plan.stats,phases:{},
      promoEligible:false,rendering:'isolated-real-dom-partial-surface',
      performanceMs:0,restorationVerified:false};
    await browser.page.screenshot(path.join(FOLDER,site.id+'-original.png'));
    for(const phase of ['teacher','neural']){
      const operations=plan[phase];
      const applied=await browser.page.eval(EXPRESSION(pageExperiment,'apply',operations));
      try{
        assert.equal(applied.applied,operations.length);
        const snapshot=await browser.page.eval(EXPRESSION(pageExperiment,'measure'));
        const measured=checkPaint(capture,snapshot,true);
        assert.equal(measured.weak,0,'P12: text below contrast threshold');
        await browser.page.screenshot(path.join(FOLDER,site.id+'-'+phase+'.png'));
        report.phases[phase]={...measured,image:site.id+'-'+phase+'.png'};
      }finally{
        const restored=await browser.page.eval(EXPRESSION(pageExperiment,'restore'));
        assert.equal(restored.ok,true,'P12: inline CSS rollback failed');
        assert.equal(restored.restored,operations.length);
      }
      const after=await browser.page.eval(EXPRESSION(pageExperiment,'measure'));
      assert.deepEqual(after,original,'P12: computed CSS was not restored');
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
  console.log('P12 rendered summary',JSON.stringify({
    observed:report.observed,inconclusive:report.inconclusive,promotionEligible:false
  }));
}
if(require.main===module)main().catch(e=>{
  console.error('P12 rendered failed:',e.stack||e);process.exitCode=1;
});
module.exports=Object.freeze({CASES,BG,allowedOutput,checkCapture,plans,checkPaint,pageExperiment});
