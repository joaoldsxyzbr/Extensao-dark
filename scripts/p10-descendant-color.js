'use strict';
// P10: compatibilidade contextual de uma cor de superficie proposta pela rede.
// Somente no Chromium descartavel. A cor de texto e uma barreira de legibilidade,
// nao um peso aprendido ou um novo algoritmo de selecao de superfícies.
function repairDescendantText(root,colors,save,readStyle=el=>getComputedStyle(el)){
  if(!root||typeof root.querySelectorAll!=='function'||!colors||
    typeof colors.parseColor!=='function'||typeof colors.contrastRatio!=='function'||
    typeof colors.ensureContrast!=='function'||typeof save!=='function')
    throw new TypeError('P10: callback/contexto invalido');
  const selector='p,span,a,li,td,th,label,small,strong,em,b,i,pre,code,h1,h2,h3,h4,h5,h6';
  const nodes=Array.from(root.querySelectorAll(selector));
  if(nodes.length>300)throw new RangeError('P10: limite de descendentes excedido');
  let checked=0,repaired=0;
  for(const el of nodes){
    if(!el?.isConnected&&el?.isConnected!==undefined)continue;
    if(el.closest?.('svg,canvas,img,picture,video,button,input,textarea,select,'+
      '[role="img"],[aria-disabled="true"],[disabled],[aria-selected="true"],'+
      '[aria-pressed="true"]'))continue;
    const style=readStyle(el);
    if(!style||style.display==='none'||style.visibility==='hidden'||
      Number(style.opacity)<.2||
      (style.backgroundImage&&style.backgroundImage!=='none')||
      (style.maskImage&&style.maskImage!=='none')||
      (style.webkitMaskImage&&style.webkitMaskImage!=='none'))continue;
    const rect=el.getBoundingClientRect?.();
    if(rect&&(!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
      rect.width<3||rect.height<3))continue;
    const fg=colors.parseColor(style.color);
    if(!fg||fg.a<.99)continue;
    let bg=null,current=el;
    // Nao assumir que uma superficie translucida ou uma imagem e opaca.
    for(let hops=0;current&&hops<12;hops++){
      const currentStyle=current===el?style:readStyle(current);
      if(!currentStyle||currentStyle.backgroundImage&&currentStyle.backgroundImage!=='none'){
        bg=null;break;
      }
      const next=colors.parseColor(currentStyle.backgroundColor);
      if(next?.a>=.99){bg=next;break;}
      if(next?.a>.01){bg=null;break;}
      if(current===root)break;
      current=current.parentElement||null;
    }
    if(!bg)continue;
    checked++;
    const size=parseFloat(style.fontSize),weight=Number.parseInt(style.fontWeight,10);
    const large=(Number.isFinite(size)&&size>=24)||
      (Number.isFinite(size)&&size>=18.66&&(weight>=700||
        style.fontWeight==='bold'||style.fontWeight==='bolder'));
    const threshold=large?3:4.5;
    if(colors.contrastRatio(fg,bg)>=threshold)continue;
    const suggested=colors.ensureContrast(fg,bg,threshold);
    const adjusted=colors.parseColor(suggested);
    if(!adjusted||colors.contrastRatio(adjusted,bg)<threshold)continue;
    save(el);
    el.style.setProperty('color',suggested,'important');
    repaired++;
  }
  return {checked,repaired};
}
module.exports=Object.freeze({repairDescendantText});
