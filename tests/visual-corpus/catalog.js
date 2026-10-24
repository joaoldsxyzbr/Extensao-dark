'use strict';
// P0: cenários sintéticos combinatórios. Não são dados rotulados para treino.
const names = [
  ['paragraph','text'],['muted-text','text'],['link','text'],
  ['button','control'],['input','control'],['textarea','control'],
  ['select','control'],['checkbox','control'],['radio','control'],
  ['tab','control'],['menu','control'],['badge','accent'],
  ['alert','surface'],['card','surface'],['table','surface'],['dialog','surface'],
  ['tooltip','surface'],['progress','control'],['svg-icon','graphic'],
  ['masked-icon','graphic'],['pseudo-icon','graphic'],['image','graphic'],
  ['canvas','graphic'],['video','graphic'],['gradient','surface'],
  ['translucent','surface'],['shadow-dom','surface'],['dynamic','surface'],
  ['native-scheme','surface'],['iframe','surface']
];
const FAMILIES = Object.freeze(names.map(([id,intent])=>Object.freeze({id,intent})));
const CONTEXTS = Object.freeze([
  {id:'light',background:'#f6f7fb',foreground:'#20242b'},
  {id:'native-dark',background:'#17191e',foreground:'#edf0f5'},
  {id:'high-contrast',background:'#000000',foreground:'#ffffff'},
  {id:'accent',background:'#263a58',foreground:'#edf4ff'}
].map(Object.freeze));
const STATES = Object.freeze(['rest','selected','disabled']);
const DECORATIONS = Object.freeze(['flat','outlined','elevated']);
const SIZES = Object.freeze(['compact','regular','large']);
const TOTAL = FAMILIES.length * CONTEXTS.length * STATES.length * DECORATIONS.length * SIZES.length;
function* scenarios() {
  for (const family of FAMILIES) for (const context of CONTEXTS)
    for (const state of STATES) for (const decoration of DECORATIONS)
      for (const size of SIZES) yield Object.freeze({
        id:[family.id,context.id,state,decoration,size].join('--'),
        family:family.id,intent:family.intent,context:context.id,
        state,decoration,size,background:context.background,foreground:context.foreground
      });
}
function browserSample() {
  const wanted=new Map();
  for (const family of FAMILIES) for (let i=0;i<CONTEXTS.length;i++) {
    wanted.set(family.id+'--'+CONTEXTS[i].id,{
      state:STATES[i%STATES.length],decoration:DECORATIONS[(i+1)%DECORATIONS.length],
      size:SIZES[(i+2)%SIZES.length]
    });
  }
  return [...scenarios()].filter(c=>{
    const spec=wanted.get(c.family+'--'+c.context);
    return c.state===spec.state && c.decoration===spec.decoration && c.size===spec.size;
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
const svgData='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2040%2040%22%3E%3Ccircle%20cx=%2220%22%20cy=%2220%22%20r=%2216%22%20fill=%22%230e91ba%22/%3E%3C/svg%3E';
function markup(family) {
  switch(family) {
    case 'paragraph':return '<p class="visual-target">Texto principal legível</p>';
    case 'muted-text':return '<small class="visual-target visual-muted">Texto secundário legível</small>';
    case 'link':return '<a class="visual-target" href="#catalog">Abrir detalhes</a>';
    case 'button':return '<button class="visual-target" type="button">Continuar</button>';
    case 'input':return '<input class="visual-target" aria-label="Pesquisa" placeholder="Pesquisar" autocomplete="off">';
    case 'textarea':return '<textarea class="visual-target" aria-label="Nota" placeholder="Anotação"></textarea>';
    case 'select':return '<select class="visual-target" aria-label="Seleção"><option>Opção A</option><option>Opção B</option></select>';
    case 'checkbox':return '<label class="visual-target"><input type="checkbox" checked> Marcado</label>';
    case 'radio':return '<label class="visual-target"><input type="radio" checked> Selecionado</label>';
    case 'tab':return '<button class="visual-target" role="tab" aria-selected="true">Aba ativa</button>';
    case 'menu':return '<nav class="visual-target" aria-label="Menu"><a href="#catalog">Início</a> · <a href="#catalog">Opções</a></nav>';
    case 'badge':return '<span class="visual-target visual-badge">3 avisos</span>';
    case 'alert':return '<div class="visual-target visual-panel" role="alert">Aviso importante</div>';
    case 'card':return '<article class="visual-target visual-panel"><strong>Cartão</strong><p>Informações</p></article>';
    case 'table':return '<table class="visual-target"><thead><tr><th>Nome</th><th>Valor</th></tr></thead><tbody><tr><td>Item</td><td>20</td></tr></tbody></table>';
    case 'dialog':return '<div class="visual-target visual-panel" role="dialog" aria-label="Janela">Confirmar ação?</div>';
    case 'tooltip':return '<span class="visual-target visual-tip" role="tooltip">Informações adicionais</span>';
    case 'progress':return '<progress class="visual-target" max="100" value="60">60%</progress>';
    case 'svg-icon':return '<svg class="visual-target visual-svg" viewBox="0 0 24 24" role="img" aria-label="Ícone"><path d="M4 12h16M12 4v16" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
    case 'masked-icon':return '<span class="visual-target visual-mask" role="img" aria-label="Ícone com máscara"></span>';
    case 'pseudo-icon':return '<span class="visual-target visual-pseudo" role="img" aria-label="Ícone com pseudoelemento"></span>';
    case 'image':return '<img class="visual-target visual-image" alt="Ilustração" src="'+svgData+'">';
    case 'canvas':return '<canvas class="visual-target visual-canvas" width="32" height="32" role="img" aria-label="Desenho local"></canvas>';
    case 'video':return '<video class="visual-target visual-video" muted playsinline preload="none" aria-label="Vídeo local sem origem"></video>';
    case 'gradient':return '<div class="visual-target visual-gradient">Fundo com gradiente</div>';
    case 'translucent':return '<div class="visual-target visual-translucent">Sobreposição translúcida</div>';
    case 'shadow-dom':return '<div class="visual-target visual-shadow-host" data-shadow-host></div>';
    case 'dynamic':return '<div class="visual-target visual-dynamic" data-dynamic>Conteúdo inicial</div>';
    case 'native-scheme':return '<div class="visual-target visual-panel" style="color-scheme:dark">Tema nativo</div>';
    case 'iframe':return '<iframe class="visual-target visual-iframe" title="Área embutida" sandbox="" srcdoc="&lt;style&gt;body{background:#23252b;color:#fff;font:12px system-ui}&lt;/style&gt;Conteúdo embutido"></iframe>';
    default:throw new Error('Família não reconhecida: '+family);
  }
}
function renderCase(c) {
  const keys=['id','family','intent','context','state','decoration','size'];
  const attrs=keys.map(key=>key==='id'?'id="'+escapeHtml('case-'+c.id)+'"':'data-'+key+'="'+escapeHtml(c[key])+'"').join(' ');
  return '<section class="visual-case" '+attrs+'><div class="visual-case-label">'+escapeHtml(c.family)+' · '+escapeHtml(c.context)+'</div>'
    +'<div class="visual-surface" style="--case-bg:'+escapeHtml(c.background)+';--case-fg:'+escapeHtml(c.foreground)+'">'
    +markup(c.family)+'</div></section>';
}
const STYLE=[
 '*{box-sizing:border-box}body{margin:0;padding:16px;background:#fff;color:#171717;font:13px/1.4 system-ui,sans-serif}',
 '#catalog{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}',
 '.visual-case{min-width:0;border:1px solid #ccc;padding:4px;border-radius:6px}',
 '.visual-case-label{font-size:10px;margin-bottom:5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
 '.visual-surface{background:var(--case-bg);color:var(--case-fg);padding:12px;min-height:78px;border-radius:7px;overflow:hidden}',
 '.visual-case[data-decoration="outlined"] .visual-surface{outline:2px solid currentColor;outline-offset:-3px}',
 '.visual-case[data-decoration="elevated"] .visual-surface{box-shadow:0 2px 9px rgba(0,0,0,.32)}',
 '.visual-case[data-size="compact"] .visual-surface{font-size:11px;padding:7px}',
 '.visual-case[data-size="large"] .visual-surface{font-size:16px;padding:16px}',
 '.visual-case[data-state="selected"] .visual-target{outline:2px solid #6d91f4;outline-offset:1px}',
 '.visual-case[data-state="disabled"] .visual-target{opacity:.52}',
 '.visual-surface .visual-target{max-width:100%;margin:0;min-height:0}',
 '.visual-surface input,.visual-surface textarea,.visual-surface select,.visual-surface button{font:inherit}',
 '.visual-surface input,.visual-surface textarea,.visual-surface select{width:95%;color:inherit;background:transparent;border:1px solid currentColor}',
 '.visual-muted{opacity:.65}.visual-panel{padding:6px;border:1px solid currentColor;border-radius:4px}',
 '.visual-badge{display:inline-block;background:#3268b7;color:#fff;padding:5px;border-radius:6px}',
 '.visual-tip{background:#eaeaea;color:#161616;padding:5px;border-radius:4px}',
 '.visual-svg,.visual-mask,.visual-pseudo,.visual-image,.visual-canvas,.visual-video{width:30px;height:30px;display:inline-block;vertical-align:middle}',
 '.visual-mask{background-color:rgb(240,240,240);-webkit-mask-image:linear-gradient(#000,#000);mask-image:linear-gradient(#000,#000)}',
 '.visual-pseudo{position:relative}.visual-pseudo::before{content:"";display:block;width:20px;height:20px;border:3px solid currentColor;border-radius:50%}',
 '.visual-gradient{background:linear-gradient(120deg,#444,#7c9aba);padding:8px}',
 '.visual-translucent{background:rgba(255,255,255,.55);padding:8px}',
 '.visual-video{background:#444}.visual-iframe{border:0;width:98%;height:34px}',
 '.visual-surface table{border-collapse:collapse;width:100%}.visual-surface th,.visual-surface td{border:1px solid currentColor;padding:2px}',
 '@media (max-width:800px){#catalog{grid-template-columns:repeat(2,minmax(0,1fr))}}'
].join('\n');
const BOOT=[
 "for(const el of document.querySelectorAll('[data-shadow-host]')){",
 " const root=el.attachShadow({mode:'open'});",
 " const style=document.createElement('style');style.textContent='.item{background:#ededed;color:#202020;padding:5px;border-radius:3px}';",
 " const card=document.createElement('div');card.className='item';card.textContent='Cartão encapsulado';",
 " root.append(style,card);",
 "}",
 "for(const el of document.querySelectorAll('canvas.visual-canvas')){",
 " const ctx=el.getContext('2d');if(ctx){ctx.fillStyle='#f0f0f0';ctx.fillRect(2,2,28,28);ctx.fillStyle='#2277aa';ctx.fillRect(8,8,16,16)}",
 "}",
 "window.__fixtureReady=true;",
 "window.changeVisualCorpus=()=>{",
 " for(const el of document.querySelectorAll('[data-dynamic]')){el.textContent='Conteúdo atualizado';el.dataset.state='updated'}",
 "};"
].join('\n');
function renderFixture(rows=browserSample()) {
  if (!Array.isArray(rows) || !rows.every(c=>c && FAMILIES.some(f=>f.id===c.family) && typeof c.id==='string'))
    throw new TypeError('Amostra de cenários inválida');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Extensão Dark — P0 corpus visual</title><style>'+STYLE+'</style></head><body>'
    +'<h1>Catálogo visual P0 ('+rows.length+' cenários de amostra)</h1>'
    +'<main id="catalog">'+rows.map(renderCase).join('\n')+'</main><script>'+BOOT+'</script></body></html>';
}
module.exports=Object.freeze({FAMILIES,CONTEXTS,STATES,DECORATIONS,SIZES,TOTAL,scenarios,browserSample,renderFixture});
