'use strict';
// Métricas de páginas públicas: nenhuma coleta de texto ou valores de formulário.
const colors=require('../content/colors.js');
function snapshotExpression(){
  const textSelectors='p,span,a,button,input,textarea,select,h1,h2,h3,h4,h5,h6,li,label,td,th,[role="button"],[role="tab"]';
  const elements=[...document.querySelectorAll(textSelectors)].slice(0,1800);
  const visible=el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>.2&&
      r.width>=3&&r.height>=3&&r.top<innerHeight+200&&r.bottom>=-30&&
      r.left<innerWidth+80&&r.right>=-30;
  };
  function backdrop(el){
    let cur=el,steps=0;
    while(cur&&steps++<14){
      const s=getComputedStyle(cur);
      if(s.backgroundImage&&s.backgroundImage!=='none')return null;
      if(/^rgb\(\s*[0-9]+[, ]/.test(s.backgroundColor))return s.backgroundColor;
      cur=cur.parentElement||cur.getRootNode?.()?.host||null;
    }
    return null;
  }
  const samples=[];
  for(const el of elements){
    if(samples.length===240)break;
    if(!visible(el))continue;
    const css=getComputedStyle(el),bg=backdrop(el);
    if(bg)samples.push({fg:css.color,bg,font:css.fontSize,weight:css.fontWeight});
  }
  const icons=[];
  const iconElements=[...document.querySelectorAll('span,i,svg,button,a,[role="img"]')].slice(0,1600);
  for(const el of iconElements){
    if(icons.length===80)break;
    if(!visible(el))continue;
    const css=getComputedStyle(el);
    if(![css.maskImage,css.webkitMaskImage].some(v=>v&&v!=='none'))continue;
    const bg=backdrop(el.parentElement);
    if(bg)icons.push({fg:css.backgroundColor,bg});
  }
  const ownBackgrounds=[...document.querySelectorAll('[style]')].slice(0,1500)
    .filter(el=>el.style.getPropertyPriority('background-color')==='important').length;
  return {landingUrl:location.href,totalElements:document.querySelectorAll('*').length,
    extensionActive:document.documentElement.getAttribute('data-extensao-dark')==='on',
    sampled:samples,masked:icons,changedBackgrounds:ownBackgrounds};
}
const EXPRESSION='('+snapshotExpression.toString()+')()';
function summarize(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.sampled)||!Array.isArray(raw.masked))
    throw Error('Amostra de DOM inválida');
  let weakText=0,weakIcons=0;
  const ratio=(fg,bg)=>{
    const front=colors.parseColor(fg),back=colors.parseColor(bg);
    if(!front||!back||front.a<.99||back.a<.99)return null;
    return colors.contrastRatio(front,back);
  };
  for(const sample of raw.sampled){
    const r=ratio(sample.fg,sample.bg);
    if(r===null)continue;
    const size=parseFloat(sample.font),bold=parseInt(sample.weight,10)>=700||
      ['bold','bolder'].includes(sample.weight);
    const threshold=(size>=24||(bold&&size>=18.66))?3:4.5;
    if(r+1e-4<threshold)weakText++;
  }
  for(const sample of raw.masked){
    const r=ratio(sample.fg,sample.bg);
    if(r!==null&&r+1e-4<3)weakIcons++;
  }
  return {
    landingUrl:String(raw.landingUrl||''),
    totalElements:Number(raw.totalElements),
    extensionActive:raw.extensionActive===true,
    sampledText:raw.sampled.length,weakText,maskedIcons:raw.masked.length,
    weakIcons,changedBackgrounds:Number(raw.changedBackgrounds)
  };
}
module.exports=Object.freeze({EXPRESSION,summarize});
