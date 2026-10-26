'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const colors=require('../content/colors.js');

const bg=colors.parseColor('rgb(244, 244, 244)');
const fg=colors.parseColor('rgb(20, 22, 24)');
const parent=colors.parseColor('rgb(240, 240, 240)');
const state={kind:'surface',action:'convert',control:false,selected:false,
  contrast:colors.contrastRatio(bg,fg),nativeDark:false,compact:false};
test('P5: CSS ampliado tem 48 dimensões com as 18 anteriores intactas',()=>{
  const css={display:'grid',position:'fixed',opacity:'0.8',fontSize:'18px',
    fontWeight:'700',boxShadow:'0 2px 8px #000',borderRadius:'16px',
    borderTopWidth:'2px',outlineWidth:'2px',backgroundImage:'none'};
  const old=colors.contextFeatures(bg,fg,parent,state);
  const expanded=colors.advancedContextFeatures(bg,fg,parent,state,css);
  assert.equal(colors.ADVANCED_FEATURE_COUNT,48);
  assert.equal(colors.ADVANCED_FEATURE_NAMES.length,48);
  assert.equal(new Set(colors.ADVANCED_FEATURE_NAMES).size,48);
  assert.equal(expanded.length,48);
  assert.deepEqual(expanded.slice(0,18),old);
  assert.ok(expanded.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
test('P5: detecta propriedades com efeito visual, sem ler conteúdo da página',()=>{
  const fixed=colors.advancedStyleFeatures({display:'grid',position:'fixed',
    backgroundImage:'linear-gradient(red, blue)',boxShadow:'0 0 6px #000',
    filter:'blur(4px)',opacity:'0.4',colorScheme:'dark'});
  const plain=colors.advancedStyleFeatures({display:'block',position:'static',
    backgroundImage:'none',filter:'none',opacity:'1',colorScheme:'normal'});
  assert.equal(fixed.length,30);
  for(const name of ['displayGrid','positionOverlay','boxShadow','filter','gradient','colorSchemeDark']){
    const pos=colors.ADVANCED_FEATURE_NAMES.indexOf(name)-18;
    assert.ok(pos>=0,name);
    assert.equal(fixed[pos],1,name);
    assert.equal(plain[pos],0,name);
  }
  assert.notDeepEqual(fixed,plain);
});
test('P5: normaliza valores CSS inválidos sem NaN ou executar código',()=>{
  const p=colors.advancedStyleFeatures({opacity:'NaN',zIndex:'auto',
    width:'calc(100% - 10px)',height:'unknown',fontWeight:'500',
    lineHeight:'normal', backgroundImage:'url("data:image/svg+xml;base64,dGVzdA==")',
    boxShadow:'none',transform:'matrix(1,0,0,1,0,0)',overflowX:'hidden'});
  assert.equal(p.length,30);
  assert.ok(p.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.equal(p[colors.ADVANCED_FEATURE_NAMES.indexOf('rasterImage')-18],1);
  assert.equal(p[colors.ADVANCED_FEATURE_NAMES.indexOf('gradient')-18],0);
});
test('P5: formato é previsível mesmo sem style',()=>{
  assert.equal(colors.advancedStyleFeatures().length,30);
  assert.equal(colors.advancedContextFeatures(bg,fg,parent,state,null).length,48);
  assert.equal(colors.advancedContextFeatures(null,fg,parent,state,{}),null);
});
test('P5: extrator não consulta DOM nem armazena URL, texto ou formulário',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../content/colors.js'),'utf8');
  const part=source.slice(source.indexOf('function advancedStyleFeatures('),
    source.indexOf('function neuralDecision('));
  assert.doesNotMatch(part,/textContent|innerHTML|localStorage|document\.cookie|fetch\(/);
});
