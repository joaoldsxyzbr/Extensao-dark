#!/usr/bin/env node
'use strict';
// E2E real em Chromium usando apenas Node nativo e Chrome DevTools Protocol.
// Uma extensão concorrente só entra via --compare-extension=/caminho/local, em outro perfil.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const colors = require('../content/colors.js');
const {FAMILIES, browserSample, renderFixture} = require('../tests/visual-corpus/catalog.js');
const visualCorpusFixture = renderFixture();

const ROOT = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(ROOT, 'tests/browser-fixture.html'));
const outArg = process.argv.find(a=>a.startsWith('--output='));
const compareArg = process.argv.find(a=>a.startsWith('--compare-extension='));
const OUTPUT = path.resolve(outArg?.slice('--output='.length) || path.join(os.tmpdir(),'extensao-dark-browser-results'));
const COMPARISON = compareArg?.slice('--compare-extension='.length);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

function browserPath() {
  const choices = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', 'chromium', 'google-chrome'];
  for (const candidate of choices.filter(Boolean)) {
    if ((candidate.includes('/') && fs.existsSync(candidate)) || (!candidate.includes('/') && spawnSync('which',[candidate]).status===0)) return candidate;
  }
  throw new Error('Chromium/Chrome for Testing não encontrado. Configure CHROME_BIN.');
}
class CDP {
  constructor(socket) {
    this.socket=socket;this.sequence=0;this.pending=new Map();
    socket.addEventListener('message', event=>{
      let data;try{data=JSON.parse(event.data);}catch{return;}
      const pending=this.pending.get(data.id);
      if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(data.id);
      if(data.error)pending.reject(Error(data.error.message));else pending.resolve(data.result||{});
    });
    socket.addEventListener('close',()=>{
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP encerrado'));}
      this.pending.clear();
    });
  }
  command(method,params={},sessionId,timeoutMs=12000) {
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  close(){this.socket.close();}
}
// Wait for Chromium to exit before deleting its profile: Chrome writes files
// briefly after SIGTERM. Bounded waits and rmSync retries prevent ENOTEMPTY
// teardown failures without hiding failures from the browser scenarios.
function waitForBrowserClose(child,timeoutMs){
  if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve(true);
  return new Promise(resolve=>{
    let settled=false;
    const finish=closed=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      child.removeListener('close',onClose);
      child.removeListener('error',onClose);
      resolve(closed);
    };
    const onClose=()=>finish(true);
    child.once('close',onClose);
    child.once('error',onClose);
    const timer=setTimeout(()=>finish(false),timeoutMs);
  });
}
async function cleanupBrowser(child,profile,{timeoutMs=800}={}){
  if(child.exitCode===null&&child.signalCode===null){
    const closed=waitForBrowserClose(child,timeoutMs);
    child.kill('SIGTERM');
    if(!await closed){
      const forced=waitForBrowserClose(child,timeoutMs);
      child.kill('SIGKILL');
      await forced;
    }
  }
  // Node retries only transient filesystem errors (ENOTEMPTY/EBUSY/EPERM).
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}
// DevToolsActivePort can exist before Chromium finishes writing both lines.
// Never construct a WebSocket URL from a partial or unexpected endpoint.
function parseDevToolsActivePort(contents){
  if(typeof contents!=='string'||contents.length>256)return null;
  const lines=contents.trim().split(/\r?\n/);
  if(lines.length!==2||!/^\d{1,5}$/.test(lines[0])||
     !/^\/devtools\/browser\/[A-Za-z0-9-]{8,80}$/.test(lines[1]))return null;
  const port=Number(lines[0]);
  if(!Number.isSafeInteger(port)||port<1||port>65535)return null;
  return {port,socketPath:lines[1]};
}
async function launch(extension) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ext-dark-cdp-'));
  const args=['--headless=new','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1100,900','--force-device-scale-factor=1',`--user-data-dir=${profile}`,'--no-sandbox','about:blank'];
  if(extension)args.unshift(`--disable-extensions-except=${extension}`,`--load-extension=${extension}`);
  const child=spawn(browserPath(),args,{stdio:['ignore','pipe','pipe']});
  let diagnostic='';
  let spawnError=null;
  child.on('error',error=>{spawnError=error;});
  for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{
    diagnostic=(diagnostic+String(chunk)).slice(-2500);
  });
  let endpoint=null;
  try {
    const activePort=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<120;i++){
      if(spawnError)throw Error('Não foi possível iniciar Chrome: '+spawnError.message);
      if(child.exitCode!=null)throw Error('Chrome encerrou com código '+child.exitCode+'; stderr: '+diagnostic);
      try{endpoint=parseDevToolsActivePort(fs.readFileSync(activePort,'utf8'));}
      catch(error){if(error.code!=='ENOENT')throw error;}
      if(endpoint)break;
      await sleep(100);
    }
    if(!endpoint)throw Error('Chrome não disponibilizou porta CDP completa; stderr: '+diagnostic);
    const socket = new WebSocket('ws://127.0.0.1:'+endpoint.port+endpoint.socketPath);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    const cdp=new CDP(socket);
    const {targetId}=await cdp.command('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await cdp.command('Target.attachToTarget',{targetId,flatten:true});
    await cdp.command('Page.enable',{},sessionId);
    await cdp.command('Runtime.enable',{},sessionId);
    const page={
      async eval(expr){const r=await cdp.command('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error('Erro em página: '+(r.exceptionDetails.text||JSON.stringify(r.exceptionDetails)));return r.result?.value;},
      async navigate(url,{fixtureReady=true}={}){const result=await cdp.command('Page.navigate',{url},sessionId,25000);if(result.errorText)throw Error('Navegação Chrome bloqueada/falhou: '+result.errorText);await waitFor(async()=>await page.eval(fixtureReady?'document.readyState === "complete" && window.__fixtureReady === true':'document.body !== null && (document.readyState === "complete" || document.readyState === "interactive")'),fixtureReady?8000:18000);},
      async screenshot(output){const r=await cdp.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId,22000);fs.writeFileSync(output,Buffer.from(r.data,'base64'));},
      async close(){await cdp.command('Target.closeTarget',{targetId});}
    };
    return {page,stop:async()=>{try{await page.close();}catch{}cdp.close();await cleanupBrowser(child,profile);}};
  }catch(err){await cleanupBrowser(child,profile);throw err;}
}
async function waitFor(fn,timeout=5000){const start=performance.now();while(performance.now()-start<timeout){if(await fn())return;await sleep(60);}throw Error('Condição não atingida em '+timeout+'ms');}
const metrics = `(()=>{
  const selectors=['body','#card','#copy','#translucent','#action','#muted-tab','#badge','#inserted','#shadow-host','#masked-icon'];
  const nodes=Object.fromEntries(selectors.map(s=>{const el=document.querySelector(s);if(!el)return[s,null];const css=getComputedStyle(el);return[s,{background:css.backgroundColor,color:css.color,border:css.borderTopColor,changedBg:el.style.getPropertyPriority('background-color')==='important'}];}));
  const shadow=document.querySelector('#shadow-host').shadowRoot.querySelector('.shadow-card');
  const cs=getComputedStyle(shadow);
  nodes.shadow={background:cs.backgroundColor,color:cs.color};
  const image=document.querySelector('#image');
  return {nodes,nativeDark:document.documentElement.hasAttribute('dark'),extensionActive:document.documentElement.hasAttribute('data-extensao-dark'),imageSrc:image.getAttribute('src'),imageComplete:image.complete,createdAt:new Date().toISOString()};
})()`;

async function scenario(name,extension,url){
  const {page,stop}=await launch(extension);
  try{
    const start=performance.now();await page.navigate(url);
    // Esperar por trabalho ocioso real, não supor tempo fixo de execução do motor.
    if(name==='ours')await waitFor(async()=>await page.eval('document.documentElement.hasAttribute("data-extensao-dark")'),10000);
    await sleep(350);const initial=await page.eval(metrics);const elapsedMs=Math.round(performance.now()-start);
    const screenshotWarnings=[];
    async function capture(stage) {
      try { await page.screenshot(path.join(OUTPUT,`${name}-${stage}.png`)); }
      catch(error){screenshotWarnings.push(`${stage}: ${error.message}`);}
    }
    await capture('initial');
    await page.eval('window.fixtureAction()');await sleep(650);
    const dynamic=await page.eval(metrics);await capture('dynamic');
    await page.eval('window.fixtureNativeDark()');await sleep(650);
    const nativeDark=await page.eval(metrics);await capture('native-dark');
    const record={name,elapsedMs,initial,dynamic,nativeDark,screenshotWarnings};
    for (const state of [initial,dynamic,nativeDark]) {
      state.contrast=Object.fromEntries(['body','#card','#badge','#action','shadow'].map(key=>{
        const c=state.nodes[key];
        const bg=colors.parseColor(c?.background);
        const fg=colors.parseColor(c?.color);
        return [key,bg?.a===1 && fg?.a===1?Number(colors.contrastRatio(bg,fg).toFixed(2)):null];
      }));
    }
    for (const state of [initial,dynamic,nativeDark]) {
      const panel = state.nodes['#translucent'];
      const parent = state.nodes['#card'];
      const overlay = colors.parseColor(panel?.background);
      const backdrop = colors.parseColor(parent?.background);
      const text = colors.parseColor(panel?.color);
      const visible = overlay && backdrop?.a === 1 ? colors.compositeColor(overlay, backdrop) : null;
      state.contrast['#translucent'] = visible && text?.a === 1 ?
        Number(colors.contrastRatio(visible,text).toFixed(2)) : null;
      state.translucentVisibleLuminance = visible ? Number(colors.luminance(visible).toFixed(3)) : null;
    }
    if(name==='ours'){
      // Regressão visual P3: contraste nominal de 4.5:1 era legível no papel,
      // mas resultava em textos cinza apagados. Testar legibilidade confortável.
      for (const key of ['body','#card','shadow']) {
        assert.ok(initial.contrast[key] >= 8, `texto apagado em ${key}: ${initial.contrast[key]}:1`);
      }
      assert.equal(colors.parseColor(initial.nodes['#translucent'].background)?.a, .75,
        'painel semitransparente deve preservar a opacidade original');
      assert.ok(initial.translucentVisibleLuminance < .12,
        'painel semitransparente voltou a ser uma faixa clara');
      assert.ok(initial.contrast['#translucent'] >= 8,
        'texto do painel semitransparente precisa de contraste confortável');
      assert.equal(initial.extensionActive,true,'a extensão precisa injetar estilos');
      assert.equal(initial.imageSrc,dynamic.imageSrc,'imagens não devem ser alteradas');
      assert.equal(dynamic.nodes['#inserted']!==null,true,'componente dinâmico presente');
      assert.notEqual(initial.nodes['#card'].background,'rgb(245, 245, 245)','cartão claro deveria escurecer');
      assert.equal(initial.nodes['#badge'].background,dynamic.nodes['#badge'].background,'indicador azul não deve ser perdido');
      assert.equal(initial.imageComplete,true,'imagem deve continuar carregada');
      assert.equal(initial.nodes['#masked-icon'].background,'rgb(240, 240, 240)',
        'ícone mascarado deve permanecer claro e visível sobre fundo escuro');
      assert.equal(dynamic.nodes['#masked-icon'].background,'rgb(240, 240, 240)',
        'ícone mascarado não deve mudar com alterações de página');
      assert.equal(initial.nodes['#muted-tab'].background,'rgb(180, 180, 182)','rede contextual deve preservar aba neutra selecionada');
      assert.equal(nativeDark.extensionActive,false,'modo escuro nativo deve pausar a extensão');
    }
    return record;
  }finally{await stop();}
}

// P0: um recorte representativo do catálogo, em navegador real, não equivale
// a validar automaticamente todas as 3240 possibilidades ou treinar a rede.
async function visualCorpusScenario(url) {
  const {page,stop}=await launch(ROOT);
  try {
    await page.navigate(url);
    await waitFor(async()=>await page.eval('document.documentElement.hasAttribute("data-extensao-dark")'),10000);
    await sleep(450);
    const expression=[
      '(()=>{',
      'const cases=[...document.querySelectorAll(".visual-case")];',
      'const families=[...new Set(cases.map(el=>el.dataset.family))];',
      'const contexts=[...new Set(cases.map(el=>el.dataset.context))];',
      'const mask=[...document.querySelectorAll(".visual-mask")];',
      'const images=[...document.querySelectorAll(".visual-image")];',
      'const shadows=[...document.querySelectorAll("[data-shadow-host]")];',
      'const canvases=[...document.querySelectorAll("canvas.visual-canvas")];',
      'const complete=cases.filter(el=>!!el.querySelector(".visual-target")).length;',
      'return {total:cases.length,uniqueIds:new Set(cases.map(el=>el.id)).size,',
      'families,contexts,complete,maskColors:mask.map(el=>getComputedStyle(el).backgroundColor),',
      'maskStyleOverridden:mask.some(el=>el.style.getPropertyPriority("background-color")==="important"),',
      'imagesValid:images.length===4&&images.every(el=>el.complete&&el.naturalWidth>0),',
      'shadowRootsValid:shadows.length===4&&shadows.every(el=>!!el.shadowRoot?.querySelector(".item")),',
      'canvasCount:canvases.length,',
      'dynamicCount:document.querySelectorAll("[data-dynamic]").length};',
      '})()'
    ].join('');
    const result=await page.eval(expression);
    assert.equal(result.total,browserSample().length,'quantidade de cenários renderizados');
    assert.equal(result.total,120);
    assert.equal(result.uniqueIds,result.total,'IDs únicos');
    assert.equal(result.complete,result.total,'cada cenário precisa de um componente');
    assert.equal(result.families.length,FAMILIES.length,'cobertura de famílias');
    assert.equal(result.contexts.length,4,'cobertura de temas');
    assert.deepEqual(result.maskColors,Array(4).fill('rgb(240, 240, 240)'),
      'ícones mascarados não devem escurecer');
    assert.equal(result.maskStyleOverridden,false,'ícones mascarados não devem receber inline !important');
    assert.equal(result.imagesValid,true,'imagens locais devem carregar');
    assert.equal(result.shadowRootsValid,true,'Shadow DOM deve renderizar');
    assert.equal(result.canvasCount,4);
    assert.equal(result.dynamicCount,4);
    const screenshotWarnings=[];
    try {await page.screenshot(path.join(OUTPUT,'visual-corpus-sample.png'));}
    catch(error){screenshotWarnings.push(error.message);}
    await page.eval('window.changeVisualCorpus()');
    await waitFor(async()=>await page.eval(
      '[...document.querySelectorAll("[data-dynamic]")].every(el=>el.dataset.state==="updated")'
    ),5000);
    return {...result,dynamicUpdated:true,screenshotWarnings};
  }finally{await stop();}
}


// Auditoria pós-P4: frame HTTP(S) e 800 nós dinâmicos com Chromium real.
// about:blank e srcdoc continuam fora de escopo (match_about_blank=false).
async function frameAndDomLoadScenario(url){
  const {page,stop}=await launch(ROOT);
  try {
    await page.navigate(url);
    await waitFor(async()=>page.eval('document.documentElement.hasAttribute("data-extensao-dark")'),10000);
    await page.eval('(()=>{const frame=document.createElement("iframe");frame.id="audit-light-frame";frame.title="iframe HTTP";frame.src="/embedded-light";document.body.appendChild(frame);})()');
    await waitFor(async()=>page.eval('(()=>{const doc=document.querySelector("#audit-light-frame")?.contentDocument;return doc?.documentElement?.getAttribute("data-extensao-dark")==="on"&&doc.querySelector("#inner-card")?.style.getPropertyPriority("background-color")==="important";})()'),15000);
    const frameActive=await page.eval('(()=>{const doc=document.querySelector("#audit-light-frame").contentDocument;return {active:doc.documentElement.getAttribute("data-extensao-dark")==="on",innerBackground:getComputedStyle(doc.querySelector("#inner-card")).backgroundColor};})()');
    assert.notEqual(frameActive.innerBackground,'rgb(245, 245, 245)');
    await page.eval('(()=>{const box=document.createElement("section");box.id="audit-dom-load";const fragment=document.createDocumentFragment();for(let i=0;i<800;i++){const el=document.createElement("div");el.textContent="item "+i;el.style.cssText="background-color:rgb(245,245,245);color:rgb(12,12,12)";el.className="audit-item";fragment.appendChild(el);}box.appendChild(fragment);window.__auditStart=performance.now();document.body.appendChild(box);})()');
    await waitFor(async()=>page.eval('(()=>{const nodes=document.querySelectorAll(".audit-item");return nodes.length===800&&[...nodes].every(el=>el.style.getPropertyValue("background-color")!=="rgb(245, 245, 245)");})()'),17000);
    const elapsedMs=await page.eval('Math.round(performance.now()-window.__auditStart)');
    return {frameActive,domNodes:800,domElapsedMs:elapsedMs,kind:'dom-time-includes-idle-scheduling'};
  }finally{await stop();}
}

async function main(){
  fs.mkdirSync(OUTPUT,{recursive:true});
  if(COMPARISON&&!fs.existsSync(path.join(COMPARISON,'manifest.json')))throw Error('Extensão concorrente precisa ser pasta unpacked com manifest.json: '+COMPARISON);
  const server=http.createServer((req,res)=>{if(req.url==='/embedded-light'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html><body style="background:rgb(250,250,250);color:#121212"><div id="inner-card" style="background-color:rgb(245,245,245);color:rgb(15,15,15)">Conteúdo iframe HTTP</div></body></html>');}else if(req.url.startsWith('/fixture')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fixture);}else if(req.url==='/visual-corpus'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(visualCorpusFixture);}else{res.writeHead(404);res.end('not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/fixture`;
    const runs=[await scenario('plain',null,url), await scenario('ours',ROOT,url)];
    const visualCorpus=await visualCorpusScenario(`http://127.0.0.1:${server.address().port}/visual-corpus`);
    const frameAndDomLoad=await frameAndDomLoadScenario(url);
    if(COMPARISON)runs.push(await scenario('dark-reader',path.resolve(COMPARISON),url));
    const output={chromium:spawnSync(browserPath(),['--version'],{encoding:'utf8'}).stdout.trim(),comparisonRequested:Boolean(COMPARISON),benchmarkNote:'Tempo inclui inicialização, carregamento e espera de estabilização; NÃO é benchmark isolado do motor. Capturas dependem do ambiente.',visualCorpus,frameAndDomLoad,runs};
    fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(output,null,2)+'\n');
    console.log(`P3 browser E2E: ${runs.map(r=>r.name).join(', ')} — ${OUTPUT}`);
    console.log('P0 visual corpus:',visualCorpus.total,'casos renderizados em Chromium,',visualCorpus.families.length,'famílias');
    for(const run of runs){if(run.screenshotWarnings.length)console.warn('Capturas incompletas:',run.name,run.screenshotWarnings.join(' | '));}
    console.log(JSON.stringify(runs.map(r=>({mode:r.name,elapsedMs:r.elapsedMs,card:r.initial.nodes['#card']?.background,contraste:r.initial.contrast['#card'],badge:r.initial.nodes['#badge']?.background,nativeDarkPaused:r.nativeDark.extensionActive===false})),null,2));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(err=>{console.error('P3 browser E2E falhou:',err.stack||err);process.exitCode=1;});
module.exports=Object.freeze({launch,waitFor,browserPath,sleep,ROOT,cleanupBrowser,parseDevToolsActivePort});
