'use strict';
// P14 synthetic, authored fixtures; do not evaluate holdout from CI.
const {load,validateCatalog}=require('./p14-dataset-contract.js');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);
function buildPage(item,{allowHoldout=false}={}){
  if(!item||!['train','validation','holdout'].includes(item.split)||
    item.split==='holdout'&&!allowHoldout)
    throw Error('P14: sealed holdout cannot render in exploratory CI');
  for(const key of ['id','background','surface','foreground']){
    if(typeof item[key]!=='string')throw TypeError('P14: invalid fixture colors');
  }
  const bg=item.background,surface=item.surface,fg=item.foreground;
  const name=escapeHtml(item.id);
  const intro='<h1>Example interface</h1><p>Sample paragraph for color and hierarchy checks.</p>'+
    '<p><a href="#second">Local navigation example</a> with a readable label.</p>';
  const card=(i)=>'<section class="panel"><h2>Panel '+i+'</h2>'+
    '<p>Example content for testing contrast and consistent background rendering.</p>'+
    '<p class="muted">Secondary label and additional text.</p></section>';
  const kinds={
    canvas:()=>'<main class="layout">'+intro+card(1)+card(2)+'</main>',
    nav:()=>'<header class="toolbar">Sample toolbar</header><div class="layout columns">'+
      '<nav class="panel"><a href="#second">Navigation one</a><p>Navigation two</p></nav>'+
      '<main>'+intro+card(1)+'</main></div>',
    cards:()=>'<main class="layout">'+intro+'<div class="cards">'+card(1)+card(2)+'</div></main>',
    notice:()=>'<main class="layout">'+intro+
      '<div class="notice">Direct text inside independently painted warning surface.</div>'+
      card(1)+'</main>',
    form:()=>'<main class="layout">'+intro+'<form class="panel" onsubmit="return false">'+
      '<label for="f">Form field</label><input id="f" value="" placeholder="Test only">'+
      '<button type="button">Safe control</button></form>'+card(1)+'</main>',
    table:()=>'<main class="layout">'+intro+
      '<table class="panel"><caption>Example results</caption><thead><tr><th>Column A</th><th>Column B</th></tr></thead>'+
      '<tbody><tr><td>Alpha</td><td>Value one</td></tr><tr><td>Beta</td><td>Value two</td></tr></tbody></table>'+
      card(1)+'</main>',
    graphics:()=>'<main class="layout">'+intro+card(1)+
      '<section class="panel"><svg width="130" height="75" viewBox="0 0 130 75" role="img" aria-label="decorative example">'+
      '<rect x="2" y="2" width="126" height="71" rx="9" fill="#268ac0"/>'+
      '<circle cx="45" cy="36" r="19" fill="#ffcb56"/></svg><p>Protected graphic.</p></section></main>',
    gradient:()=>'<main class="layout">'+intro+
      '<div class="gradient"><p>Gradient and mixed background.</p></div>'+card(1)+'</main>',
    shadow:()=>'<main class="layout">'+intro+
      '<div id="shadow-mount"></div>'+card(1)+'</main>',
  };
  if(!Object.hasOwn(kinds,item.kind))throw Error('P14: unknown fixture kind');
  const shadowScript=item.kind==='shadow'?
    '<script>const host=document.getElementById("shadow-mount");'+
    'const root=host.attachShadow({mode:"open"});'+
    'root.innerHTML="<section style=\'background:#e3e7ee;color:#252b38;padding:20px\'><h2>Shadow surface</h2><p>Example text</p></section>";'+
    'window.__fixtureReady=true;</script>':
    '<script>window.__fixtureReady=true;</script>';
  return '<!doctype html><html lang="en"><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>P14 '+name+'</title><style>'+
    '*{box-sizing:border-box}html{color-scheme:'+ (item.theme==='native-dark'?'dark':'light')+'}'+
    'body{margin:0;min-height:100vh;background:'+bg+';color:'+fg+';font:16px/1.5 system-ui,sans-serif}'+
    'h1{font-size:26px}h2{font-size:20px}a{color:#2869ba}'+
    '.layout{padding:30px;max-width:1020px;margin:auto}'+
    '.columns{display:grid;grid-template-columns:240px 1fr;gap:16px}'+
    '.cards{display:grid;grid-template-columns:1fr 1fr;gap:18px}'+
    '.panel{background:'+surface+';color:'+fg+';padding:22px;border-radius:10px;margin:12px 0}'+
    '.notice,.toolbar{background:'+surface+';color:'+fg+';padding:16px;margin:16px 0}'+
    '.gradient{padding:18px;background:linear-gradient(90deg,#eef1f4,#c9d5e0)}'+
    'button,input{padding:10px;background:#e7edf3;color:#222c39;border:1px solid #889cae}'+
    'button:focus,input:focus,a:focus{outline:3px solid #ef9e36}'+
    'td,th{padding:8px;border:1px solid #a5b3c5}.muted{opacity:.9}'+
    '@media(max-width:640px){.columns,.cards{display:block}.layout{padding:10px}}'+
    '</style>'+kinds[item.kind]()+'<div id="second"></div>'+shadowScript+'</html>';
}
function getExplorationFixtures(){
  const {catalog}=load();validateCatalog(catalog);
  return catalog.fixtures.filter(f=>f.split!=='holdout');
}
module.exports=Object.freeze({buildPage,getExplorationFixtures});
