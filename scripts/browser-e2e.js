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
  let connected=false;
  try {
    const activePort=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<120;i++){
      if(fs.existsSync(activePort)){connected=true;break;}
      if(spawnError)throw Error('Não foi possível iniciar Chrome: '+spawnError.message);
      if(child.exitCode!=null)throw Error('Chrome encerrou com código '+child.exitCode+'; stderr: '+diagnostic);
      await sleep(100);
    }
    if(!connected)throw Error('Chrome não abriu porta de depuração; stderr: '+diagnostic);
    const [port,socketPath]=fs.readFileSync(activePort,'utf8').trim().split('\n');
    const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    const cdp=new CDP(socket);
    const {targetId}=await cdp.command('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await cdp.command('Target.attachToTarget',{targetId,flatten:true});
    await cdp.command('Page.enable',{},sessionId);
    await cdp.command('Runtime.enable',{},sessionId);
    const page={
      async eval(expr){const r=await cdp.command('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error('Erro em página: '+(r.exceptionDetails.text||JSON.stringify(r.exceptionDetails)));return r.result?.value;},
      async navigate(url){const result=await cdp.command('Page.navigate',{url},sessionId);if(result.errorText)throw Error('Navegação Chrome bloqueada/falhou: '+result.errorText);await waitFor(async()=>await page.eval('document.readyState === "complete" && window.__fixtureReady === true'),8000);},
      async screenshot(output){const r=await cdp.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId,22000);fs.writeFileSync(output,Buffer.from(r.data,'base64'));},
      async close(){await cdp.command('Target.closeTarget',{targetId});}
    };
    return {page,stop:async()=>{try{await page.close();}catch{}cdp.close();child.kill('SIGTERM');await sleep(200);if(child.exitCode==null)child.kill('SIGKILL');fs.rmSync(profile,{recursive:true,force:true});}};
  }catch(err){child.kill('SIGKILL');fs.rmSync(profile,{recursive:true,force:true});throw err;}
}
async function waitFor(fn,timeout=5000){const start=performance.now();while(performance.now()-start<timeout){if(await fn())return;await sleep(60);}throw Error('Condição não atingida em '+timeout+'ms');}
const metrics = `(()=>{
  const selectors=['body','#card','#copy','#translucent','#action','#badge','#inserted','#shadow-host'];
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
    if(name==='ours'){
      assert.equal(initial.extensionActive,true,'a extensão precisa injetar estilos');
      assert.equal(initial.imageSrc,dynamic.imageSrc,'imagens não devem ser alteradas');
      assert.equal(dynamic.nodes['#inserted']!==null,true,'componente dinâmico presente');
      assert.notEqual(initial.nodes['#card'].background,'rgb(245, 245, 245)','cartão claro deveria escurecer');
      assert.equal(initial.nodes['#badge'].background,dynamic.nodes['#badge'].background,'indicador azul não deve ser perdido');
      assert.equal(initial.imageComplete,true,'imagem deve continuar carregada');
      assert.equal(nativeDark.extensionActive,false,'modo escuro nativo deve pausar a extensão');
    }
    return record;
  }finally{await stop();}
}
async function main(){
  fs.mkdirSync(OUTPUT,{recursive:true});
  if(COMPARISON&&!fs.existsSync(path.join(COMPARISON,'manifest.json')))throw Error('Extensão concorrente precisa ser pasta unpacked com manifest.json: '+COMPARISON);
  const server=http.createServer((req,res)=>{if(req.url.startsWith('/fixture')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fixture);}else{res.writeHead(404);res.end('not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/fixture`;
    const runs=[await scenario('plain',null,url), await scenario('ours',ROOT,url)];
    if(COMPARISON)runs.push(await scenario('dark-reader',path.resolve(COMPARISON),url));
    const output={chromium:spawnSync(browserPath(),['--version'],{encoding:'utf8'}).stdout.trim(),comparisonRequested:Boolean(COMPARISON),benchmarkNote:'Tempo inclui inicialização, carregamento e espera de estabilização; NÃO é benchmark isolado do motor. Capturas dependem do ambiente.',runs};
    fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(output,null,2)+'\n');
    console.log(`P3 browser E2E: ${runs.map(r=>r.name).join(', ')} — ${OUTPUT}`);
    for(const run of runs){if(run.screenshotWarnings.length)console.warn('Capturas incompletas:',run.name,run.screenshotWarnings.join(' | '));}
    console.log(JSON.stringify(runs.map(r=>({mode:r.name,elapsedMs:r.elapsedMs,card:r.initial.nodes['#card']?.background,contraste:r.initial.contrast['#card'],badge:r.initial.nodes['#badge']?.background,nativeDarkPaused:r.nativeDark.extensionActive===false})),null,2));
  }finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error('P3 browser E2E falhou:',err.stack||err);process.exitCode=1;});
