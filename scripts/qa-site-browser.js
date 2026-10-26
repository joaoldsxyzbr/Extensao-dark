#!/usr/bin/env node
'use strict';
// P9: paginas de QA escritas manualmente, fora dos dados de treinamento.
// Isto NAO comprova desempenho em sites reais ou permite promover pesos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const colors = require('../content/colors.js');
const {launch, waitFor, sleep, ROOT} = require('./browser-e2e.js');

const PAGES = Object.freeze(['commerce','workspace']);
const outputArg = process.argv.find(value => value.startsWith('--output='));
const extensionArg = process.argv.find(value => value.startsWith('--extension='));
const OUTPUT = path.resolve(outputArg?.slice('--output='.length) || path.join(os.tmpdir(), 'ext-dark-qa-sites'));
const EXTENSION = path.resolve(extensionArg?.slice('--extension='.length) || ROOT);
const inputFiles = Object.fromEntries(PAGES.map(id => [id, fs.readFileSync(path.join(ROOT, 'tests/qa-pages', id + '.html'))]));
const PROBE = [
  '(() => {',
  'const style=id=>{const el=document.getElementById(id);if(!el)return null;',
  'const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color};};',
  'return {active:document.documentElement.hasAttribute("data-extensao-dark"),',
  'panel:style("qa-panel"),live:style("qa-live"),accent:style("qa-accent"),mask:style("qa-mask"),',
  'imageSource:document.getElementById("qa-image")?.getAttribute("src")||null,',
  'selected:document.getElementById("qa-accent")?.getAttribute("aria-selected")||null};',
  '})()'
].join('');
function ratio(pair) {
  const bg = colors.parseColor(pair?.background);
  const fg = colors.parseColor(pair?.color);
  return bg?.a === 1 && fg?.a === 1 ? colors.contrastRatio(bg,fg) : null;
}
async function measure(id, mode, port) {
  const {page,stop} = await launch(mode === 'extension' ? EXTENSION : null);
  try {
    await page.navigate('http://127.0.0.1:' + port + '/' + id);
    if (mode === 'extension') {
      await waitFor(() => page.eval('document.documentElement.hasAttribute("data-extensao-dark")'),10000);
    }
    await sleep(400);
    const initial = await page.eval(PROBE);
    await page.screenshot(path.join(OUTPUT,id+'-'+mode+'-initial.png'));
    await page.eval('window.qaMutate()');
    await waitFor(() => page.eval('document.getElementById("qa-live") !== null'),4000);
    if (mode === 'extension') {
      await waitFor(() => page.eval('getComputedStyle(document.getElementById("qa-live")).backgroundColor !== "rgb(247, 247, 247)"'),12000);
    }
    const dynamic = await page.eval(PROBE);
    await page.screenshot(path.join(OUTPUT,id+'-'+mode+'-dynamic.png'));
    await page.eval('window.qaNativeDark()');
    if (mode === 'extension') {
      await waitFor(() => page.eval('!document.documentElement.hasAttribute("data-extensao-dark")'),12000);
    }
    await sleep(350);
    const native = await page.eval(PROBE);
    await page.screenshot(path.join(OUTPUT,id+'-'+mode+'-native.png'));
    return {initial,dynamic,native};
  } finally {await stop();}
}
function verify(id,plain,ours) {
  assert.equal(plain.initial.active,false,id+': pagina sem extensao nao pode estar ativa');
  assert.equal(ours.initial.active,true,id+': modo escuro deve estar ativo');
  assert.notEqual(ours.initial.panel.background,plain.initial.panel.background,id+': painel claro deveria escurecer');
  assert.ok(ratio(ours.initial.panel) >= 4.5,id+': contraste insuficiente no painel');
  assert.ok(ratio(ours.dynamic.live) >= 4.5,id+': contraste insuficiente no conteudo dinamico');
  assert.equal(ours.initial.accent.background,plain.initial.accent.background,id+': destaque saturado nao deve mudar');
  assert.equal(ours.initial.mask.background,plain.initial.mask.background,id+': icone mascarado nao deve mudar');
  assert.equal(ours.initial.imageSource,plain.initial.imageSource,id+': origem da imagem mudou');
  assert.equal(ours.dynamic.selected,'true',id+': estado selecionado nao foi preservado');
  assert.equal(ours.native.active,false,id+': modo escuro nativo deveria pausar a extensao');
  assert.equal(ours.native.panel.background,plain.native.panel.background,id+': estilo nativo nao foi restaurado');
}
async function main() {
  assert.ok(fs.existsSync(path.join(EXTENSION,'manifest.json')),'Extensao sem manifest.json');
  fs.mkdirSync(OUTPUT,{recursive:true});
  const server = http.createServer((req,res) => {
    const id = req.url.slice(1);
    if (!Object.hasOwn(inputFiles,id)) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(inputFiles[id]);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const report={type:'independent-manual-qa-fixtures-not-release-approval',runtime:EXTENSION===ROOT?'published-model':'custom-extension-copy',pages:[]};
  try {
    for (const id of PAGES) {
      const baseline=await measure(id,'plain',server.address().port);
      const extension=await measure(id,'extension',server.address().port);
      verify(id,baseline,extension);
      report.pages.push({id,verified:true,baseline,extension});
      console.log('P9 QA:',id,'contraste',ratio(extension.initial.panel).toFixed(2),
        'nativo preservado e conteudo dinamico validado');
    }
    fs.writeFileSync(path.join(OUTPUT,'qa-report.json'),JSON.stringify(report,null,2)+'\n');
  } finally {await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error('P9 QA falhou:',error.stack || error);process.exitCode=1;});
module.exports={ratio,verify,PAGES};
