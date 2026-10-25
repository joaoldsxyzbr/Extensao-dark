'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');
const {assessPair}=require('../scripts/real-site-audit.js');
const {siteCoverage}=require('../scripts/p4-release-gate.js');
const manifest=require('../manifest.json');
const root=path.resolve(__dirname,'..');
const mock=(role,css={},tag='DIV')=>({
  tagName:tag,
  getAttribute:key=>key==='role'?role:null,
  hasAttribute:()=>false,
  querySelector:()=>null
});
const defaultStyle={width:'280px',height:'190px',backgroundColor:'rgb(245,245,245)',
  color:'rgb(20,20,20)',maskImage:'none',webkitMaskImage:'none',
  clipPath:'none',webkitClipPath:'none',backgroundImage:'none'};
test('Auditoria: aria presentation/none não transforma um cartão em imagem',()=>{
  for(const role of ['none','presentation']){
    const context=colors.visualContext(mock(role),defaultStyle);
    assert.equal(context.kind,'surface',role);
    assert.equal(context.action,'convert',role);
  }
  const icon=colors.visualContext(mock('img',{},'SPAN'),{...defaultStyle,width:'24px',height:'24px'});
  assert.equal(icon.action,'preserve');
  const masked=colors.visualContext(mock('none'),{...defaultStyle,maskImage:'url(icon.svg)'});
  assert.equal(masked.action,'preserve');
});
test('Auditoria: limiar do candidato é igual no treino, avaliação JS e runtime',()=>{
  const policy=JSON.parse(fs.readFileSync(path.join(root,'data/neural-thresholds.json'),'utf8'));
  assert.equal(policy.baseline,0.8);
  assert.equal(policy.candidate,0.9);
  const surface={kind:'surface',action:'convert',nativeDark:false,translucent:false};
  for(const [inputs,threshold] of [[7,policy.baseline],[18,policy.candidate]]){
    assert.equal(colors.neuralDecision(threshold-.0001,surface,inputs).convert,false);
    assert.equal(colors.neuralDecision(threshold,surface,inputs).convert,true);
  }
  const js=fs.readFileSync(path.join(root,'scripts/evaluate-contextual.js'),'utf8');
  const python=fs.readFileSync(path.join(root,'training/train_contextual.py'),'utf8');
  assert.match(js,/neural-thresholds\.json/);
  assert.match(python,/neural-thresholds\.json/);
});
const site={id:'example',url:'https://example.com/',minSamples:1};
const stat=extras=>({landingUrl:site.url,totalElements:200,sampledText:40,
  maskedIcons:10,weakText:1,weakIcons:0,changedBackgrounds:0,
  extensionActive:false,nativeDarkDetected:true,...extras});
test('Auditoria: tema nativo comprovado e preservado é ignorado por decisão consciente',()=>{
  const status=assessPair(site,stat(),stat());
  assert.equal(status.status,'expected-native-dark-skip');
  assert.equal(status.evidence,'native-dark-both-models');
  const base={completed:true,mode:'automatic-native-detection',candidateDeployed:false,
    results:[{site:'example',assessment:status,
      baseline:{kind:'observed',capture:'example-baseline.png'},
      candidate:{kind:'observed',capture:'example-candidate.png'}}]};
  assert.equal(siteCoverage(base,['example'],'automatic-native-detection'),true);
  assert.equal(siteCoverage(base,['example'],'global-ignore-native-dark'),false);
});
test('Auditoria: extensão ausente em página clara segue inconclusiva',()=>{
  const s=assessPair(site,stat({nativeDarkDetected:false}),stat({nativeDarkDetected:false}));
  assert.equal(s.status,'inconclusive');
  const oneActive=assessPair(site,stat({extensionActive:true}),stat());
  assert.equal(oneActive.status,'inconclusive');
});
test('Auditoria: injetar scripts somente em frames HTTP(S), sem ativar páginas internas',()=>{
  const script=manifest.content_scripts[0];
  assert.equal(script.all_frames,true);
  assert.equal(script.match_about_blank,undefined);
  assert.deepEqual(script.matches,['http://*/*','https://*/*']);
});
