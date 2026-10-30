'use strict';
// P14: offline, authored-fixture-only static review page inside CI artifact.
// No URL, script, tracking, private browsing data or release approval.
const fs=require('node:fs');
const path=require('node:path');
const IDS=Object.freeze(['canvas-shell','sidebar-navigation','card-grid',
  'direct-alert','form-toolbar','native-dark']);
function buildGallery(){
  const figures=IDS.map(id=>'<section><h2>'+id+'</h2><div class="pair">'+
    '<figure><img src="'+id+'-original.png" alt="'+id+
    ' sem extensão"><figcaption>Original</figcaption></figure>'+
    '<figure><img src="'+id+'-legacy-mv3.png" alt="'+id+
    ' com motor 7D MV3"><figcaption>7D MV3</figcaption></figure>'+
    '</div></section>').join('\n');
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="'+
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"+
    '"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>P14 — revisão visual sintética</title><style>'+
    'body{font:16px system-ui,sans-serif;background:#15191d;color:#eee;margin:2rem auto;max-width:1200px;padding:0 1rem}'+
    'h1,h2{line-height:1.3}p{line-height:1.6}section{border-top:1px solid #555;margin-top:2rem;padding-top:1rem}'+
    '.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:1rem}'+
    'figure{margin:0}img{display:block;width:100%;height:auto;border:1px solid #777}'+
    'figcaption{padding:.5rem 0;color:#ccc}'+
    '</style><h1>P14: comparação visual sintética</h1>'+
    '<p>Somente seis fixtures autorais. Inspecione legibilidade, controles, ilhas claras e tema nativo. '+
    'Esta página NÃO comprova qualidade em sites públicos, não desbloqueia holdout e não aprova release.</p>'+
    figures+'</html>';
}
function writeGallery(folder){
  const output=path.resolve(folder);
  for(const id of IDS)for(const mode of ['original','legacy-mv3']){
    if(!fs.existsSync(path.join(output,id+'-'+mode+'.png')))
      throw Error('P14 gallery: screenshot missing for '+id+' '+mode);
  }
  const target=path.join(output,'review.html');
  fs.writeFileSync(target,buildGallery()+'\n',{flag:'w'});
  return target;
}
module.exports=Object.freeze({IDS,buildGallery,writeGallery});
