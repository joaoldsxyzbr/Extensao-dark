'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const neural=require('../content/neural.js');
const catalog=require('./visual-corpus/catalog.js');

function element(tag='DIV',attributes={},hasChildGraphic=false){
  return {
    tagName:tag,
    getAttribute(name){return attributes[name]??null;},
    hasAttribute(name){return Object.hasOwn(attributes,name);},
    querySelector(query){return hasChildGraphic&&query.includes('svg')?{}:null;}
  };
}
function style(bg='rgb(240,240,240)',fg='rgb(16,16,16)',more={}){
  return {backgroundColor:bg,color:fg,backgroundImage:'none',maskImage:'none',
    webkitMaskImage:'none',clipPath:'none',webkitClipPath:'none',
    width:'200px',height:'100px',...more};
}
test('P1 preserva grafismos CSS identificados por máscara, clip-path e background-image',()=>{
  const icon=element('SPAN',{'role':'img'});
  for(const props of [
    {maskImage:'url(#glyph)'},{webkitMaskImage:'linear-gradient(#000,#000)'},
    {clipPath:'circle(40%)'},{webkitClipPath:'inset(5px)'},
    {backgroundImage:'url(data:image/png;base64,AAA)'}
  ]){
    const ctx=colors.visualContext(icon,style('rgb(240,240,240)','rgb(15,15,15)',props));
    assert.equal(ctx.kind,'graphic');
    assert.equal(ctx.action,'preserve');
  }
});
test('P1 preserva ícones por role e wrappers compactos; não bloqueia cartões',()=>{
  for(const [node,css] of [
    [element('SPAN',{role:'img'}),style()],
    [element('SPAN',{class:'site-icon-small'}),style('rgb(243,243,243)','rgb(10,10,10)',{width:'24px',height:'24px'})],
    [element('SPAN',{},true),style('rgb(243,243,243)','rgb(10,10,10)',{width:'26px',height:'26px'})]
  ]){
    assert.equal(colors.visualContext(node,css).action,'preserve');
  }
  assert.equal(colors.visualContext(element('DIV'),style()).action,'convert');
  assert.equal(colors.visualContext(element('BUTTON',{role:'button'}),style()).kind,'control');
  assert.equal(colors.visualContext(element('SPAN',{class:'site-icon-small'}),
    style('rgb(243,243,243)','rgb(10,10,10)',{width:'600px',height:'200px'})).action,'convert');
});
test('P1 reconhece pseudo-elementos gráficos sem varrer conteúdo da página',()=>{
  let calls=0;
  const icon=element('SPAN',{class:'nav-icon'});
  const ctx=colors.visualContext(icon,
    style('rgb(235,235,235)','rgb(10,10,10)',{width:'30px',height:'30px'}),
    ()=>{calls++;return [{content:'""',maskImage:'url(icon.svg)'},{content:'none'}];});
  assert.equal(calls,1);
  assert.equal(ctx.kind,'graphic');
  assert.equal(ctx.action,'preserve');
  assert.equal(ctx.pseudo,true);
  const card=colors.visualContext(element('ARTICLE'),
    style('rgb(235,235,235)','rgb(10,10,10)',{width:'320px',height:'260px'}),
    ()=>{throw Error('não deveria consultar ::before em cartões grandes');});
  assert.equal(card.kind,'surface');
});
test('P1 mantém seleção, estado de interação, contraste e transparência no contexto',()=>{
  const selected=colors.visualContext(element('BUTTON',{role:'tab','aria-selected':'true','aria-disabled':'true'}),style());
  assert.equal(selected.action,'convert');
  assert.equal(selected.control,true);
  assert.equal(selected.selected,true);
  assert.equal(selected.disabled,true);
  const textOnly=colors.visualContext(element('SPAN'),style('rgba(0,0,0,0)','rgb(220,220,220)'));
  assert.equal(textOnly.action,'contrast');
  const v=colors.contextFeatures(
    colors.parseColor('rgb(240,240,240)'),
    colors.parseColor('rgb(20,20,20)'),
    colors.parseColor('rgb(26,26,26)'),selected);
  assert.equal(v.length,18);
  assert.ok(v.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
  assert.equal(v[5],1);
  assert.equal(v[6],1);
  assert.deepEqual(v.slice(0,7),colors.neuralFeatures(
    colors.parseColor('rgb(240,240,240)'),colors.parseColor('rgb(20,20,20)'),
    colors.parseColor('rgb(26,26,26)'),{control:true,selected:true}));
});
test('P1 preserva compatibilidade do modelo binário de sete entradas até o treino P2',()=>{
  const white=colors.parseColor('rgb(245,245,245)');
  const black=colors.parseColor('rgb(20,20,20)');
  const parent=colors.parseColor('rgb(240,240,240)');
  assert.equal(neural.MODEL.input,7);
  assert.ok(Number.isFinite(neural.probability(colors.neuralFeatures(white,black,parent))));
  assert.equal(neural.probability(colors.contextFeatures(white,black,parent,
    colors.visualContext(element('DIV'),style()))),0);
});
test('P1 sintetiza características numéricas de cada família P0 sem atribuir rótulos falsos',()=>{
  const known=new Set(['graphic','surface','control','text']);
  for(const family of catalog.FAMILIES) {
    const node=element(family.id==='svg-icon'?'SVG':family.id==='button'?'BUTTON':'DIV',family.intent==='graphic'?{role:'img'}:{});
    const css=style();
    const context=colors.visualContext(node,css);
    const x=colors.contextFeatures(colors.parseColor(css.backgroundColor),
      colors.parseColor(css.color),colors.parseColor('rgb(32,32,32)'),context);
    assert.ok(known.has(context.kind));
    assert.equal(x.length,18,family.id);
    assert.ok(x.every(v=>v>=0&&v<=1),family.id);
    assert.equal(Object.hasOwn(context,'trainingLabel'),false);
  }
});
