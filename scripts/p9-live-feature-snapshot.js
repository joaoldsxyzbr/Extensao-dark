'use strict';
// P9: inspeciona APENAS CSS calculado de paginas publicas, sem devolver DOM, texto, URLs, classes ou formularios.
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

function samplePublicPage(colors,storeVisualHandles=false){
  const MAX_SCANNED=2200,MAX_SAMPLES=140;
  const nodes=document.querySelectorAll('body,main,article,section,header,footer,nav,aside,div,button,input,textarea,select,svg,span,a,img,p,li,h1,h2,h3,table');
  const records=[];
  const visualHandles=storeVisualHandles?[]:null;
  let visible=0;
  for(let i=0;i<Math.min(nodes.length,MAX_SCANNED);i++){
    if(records.length>=MAX_SAMPLES)break;
    const el=nodes[i],style=getComputedStyle(el),rect=el.getBoundingClientRect();
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<=.2||
      rect.width<10||rect.height<10||rect.right<0||rect.bottom<0||
      rect.left>innerWidth||rect.top>innerHeight)continue;
    visible++;
    const bg=colors.parseColor(style.backgroundColor),fg=colors.parseColor(style.color);
    if(!bg||!fg)continue;
    let parentEl=el.parentElement||el.getRootNode?.()?.host||null;
    let ancestor=null;
    for(let depth=0;parentEl&&depth<10;depth++){
      const parentStyle=getComputedStyle(parentEl);
      if(parentStyle.backgroundImage!=='none')break;
      const candidate=colors.parseColor(parentStyle.backgroundColor);
      if(candidate&&candidate.a>=.99){ancestor=candidate;break;}
      parentEl=parentEl.parentElement||parentEl.getRootNode?.()?.host||null;
    }
    if(!ancestor)ancestor=colors.parseColor('rgb(255, 255, 255)');
    const visual=colors.visualContext(el,style);
    const base=colors.advancedContextFeatures(bg,fg,ancestor,visual,style);
    if(!base||base.length!==48)continue;
    const x=base.concat([bg.r,bg.g,bg.b,fg.r,fg.g,fg.b].map(n=>n/255),[0,1,0]);
    if(x.length!==57||x.some(n=>!Number.isFinite(n)||n<0||n>1))continue;
    const reasons=[];
    if(visual.kind==='graphic')reasons.push('graphic');
    if(visual.selected)reasons.push('selected');
    if(visual.disabled)reasons.push('disabled');
    if(visual.translucent)reasons.push('translucent');
    if(visual.nativeDark)reasons.push('native-dark');
    if(visual.masked||visual.pseudo||visual.clipped||visual.backgroundImage)reasons.push('decorated');
    if(visual.action!=='convert')reasons.push('non-surface');
    // X e motivos tecnicos somente; nunca retornar CSS bruto, atributo, identificador, texto ou URL.
    records.push({x,reasons});
    if(visualHandles)visualHandles.push(el);
  }
  if(visualHandles){
    if(Object.prototype.hasOwnProperty.call(globalThis,'__extDarkP9VisualNodes'))
      throw Error('P9: sessão visual ja existe na pagina');
    Object.defineProperty(globalThis,'__extDarkP9VisualNodes',
      {value:visualHandles,configurable:true});
  }
  return {scanned:Math.min(nodes.length,MAX_SCANNED),visible,samples:records};
}
const COLOR_SOURCE=fs.readFileSync(path.join(ROOT,'content/colors.js'),'utf8');
// O modulo local recebe as funcoes de cor; nao grava globais na pagina e nao usa eval()/fetch().
const EXPRESSION='(()=>{const module={exports:{}};\n'+COLOR_SOURCE+
  '\nreturn ('+samplePublicPage.toString()+')(module.exports);})()';
// Somente no Chromium descartavel: mantem referencias DOM na pagina, jamais devolvidas ao Node.
const VISUAL_EXPRESSION='(()=>{const module={exports:{}};\n'+COLOR_SOURCE+
  '\nreturn ('+samplePublicPage.toString()+')(module.exports,true);})()';
module.exports=Object.freeze({EXPRESSION,VISUAL_EXPRESSION,
  CAPTURE_SOURCE:samplePublicPage.toString(),samplePublicPage});
