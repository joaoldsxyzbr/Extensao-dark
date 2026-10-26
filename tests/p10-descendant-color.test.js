'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const {repairDescendantText}=require('../scripts/p10-descendant-color.js');

function style(bg='',fg='rgb(21, 21, 21)'){
  const props=new Map();
  if(bg)props.set('background-color',{value:bg,priority:'important'});
  if(fg)props.set('color',{value:fg,priority:''});
  return {
    props,
    getPropertyValue:name=>props.get(name)?.value||'',
    getPropertyPriority:name=>props.get(name)?.priority||'',
    setProperty:(name,value,priority='')=>props.set(name,{value,priority}),
    removeProperty:name=>props.delete(name)
  };
}
function node(tagName,styleObject,background,foreground,opts={}){
  return {tagName,style:styleObject,parentElement:null,
    getComputedStyle(){return {
      display:'block',visibility:'visible',opacity:'1',fontSize:'16px',fontWeight:'400',
      backgroundImage:'none',maskImage:'none',webkitMaskImage:'none',
      backgroundColor:styleObject.getPropertyValue('background-color')||background,
      color:styleObject.getPropertyValue('color')||foreground,
      ...opts.computed
    };},
    closest:()=>opts.protected?{}:null,
    getBoundingClientRect:()=>({width:200,height:22,top:0,bottom:22,left:0,right:200}),
    querySelectorAll:()=>[],
    ...opts
  };
}
test('P10: colore texto escuro em superficie neural escura sem substituir links nem ler texto',()=>{
  const parent=node('ARTICLE',style('rgb(22, 26, 31)','rgb(235, 238, 243)'),
    'rgb(245, 246, 247)','rgb(30, 30, 30)');
  const p=node('P',style('', 'rgb(34, 34, 34)'),
    'rgba(0, 0, 0, 0)','rgb(34, 34, 34)');
  const link=node('A',style('', 'rgb(25, 71, 155)'),
    'rgba(0, 0, 0, 0)','rgb(25, 71, 155)');
  p.parentElement=parent;link.parentElement=parent;
  parent.querySelectorAll=()=>[p,link];
  const before=[];
  const result=repairDescendantText(parent,colors,el=>before.push({
    el,original:el.style.getPropertyValue('color'),
    priority:el.style.getPropertyPriority('color')
  }),el=>el.getComputedStyle());
  assert.equal(result.checked,2);
  assert.equal(result.repaired,2);
  assert.equal(before.length,2);
  for(const child of [p,link]){
    const bg=colors.parseColor('rgb(22, 26, 31)');
    const fg=colors.parseColor(child.style.getPropertyValue('color'));
    assert.ok(colors.contrastRatio(bg,fg)>=4.5);
  }
  // Link azul mantém identidade cromática em vez de ser forçado a branco.
  const linkResult=colors.parseColor(link.style.getPropertyValue('color'));
  assert.ok(linkResult.b>linkResult.r);
});
test('P10: preserva ícones, controles e descendentes com background incerto',()=>{
  const parent=node('DIV',style('rgb(20, 20, 20)'), 'rgb(250,250,250)','rgb(20,20,20)');
  const graphic=node('SPAN',style('', 'rgb(22,22,22)'),'rgba(0,0,0,0)','rgb(22,22,22)',{protected:true});
  const overlay=node('P',style('', 'rgb(22,22,22)'),'rgba(255,255,255,.55)','rgb(22,22,22)');
  const good=node('LABEL',style('rgb(255,255,255)','rgb(25,25,25)'),'rgb(255,255,255)','rgb(25,25,25)');
  [graphic,overlay,good].forEach(el=>el.parentElement=parent);
  parent.querySelectorAll=()=>[graphic,overlay,good];
  const saved=[];
  const result=repairDescendantText(parent,colors,el=>saved.push(el),el=>el.getComputedStyle());
  assert.equal(result.repaired,0);
  assert.equal(saved.length,0);
  assert.equal(graphic.style.getPropertyValue('color'),'rgb(22,22,22)');
});
test('P10: limita varredura e falha fechado sem cromatografia confiável',()=>{
  const parent=node('DIV',style('rgb(20,20,20)'),'rgb(250,250,250)','rgb(20,20,20)');
  const child=node('P',style('', 'rgb(20,20,20)'),'rgba(0,0,0,0)','rgb(20,20,20)');
  child.parentElement=parent;parent.querySelectorAll=()=>Array.from({length:350},()=>child);
  assert.throws(()=>repairDescendantText(parent,colors,()=>{},el=>el.getComputedStyle()),/limite/i);
  parent.querySelectorAll=()=>[child];
  assert.throws(()=>repairDescendantText(parent,colors,null,el=>el.getComputedStyle()),/callback/i);
});
