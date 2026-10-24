'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');

const surface={kind:'surface',action:'convert',nativeDark:false,translucent:false,
  selected:false,disabled:false,masked:false};
test('P4: gráficos, overlays e temas escuros nunca entram na inferência de conversão',()=>{
  for(const patch of [
    {kind:'graphic',action:'preserve'}, {action:'contrast',kind:'text'},
    {masked:true},{translucent:true},{nativeDark:true}
  ]){
    assert.equal(colors.neuralDecision(1,{...surface,...patch},18).convert,false);
  }
});
test('P4: candidato 18D exige confiança maior e rejeita controles sensíveis',()=>{
  assert.equal(colors.neuralDecision(.85,surface,18).convert,false);
  assert.equal(colors.neuralDecision(.91,surface,18).convert,true);
  assert.equal(colors.neuralDecision(.95,{...surface,selected:true,control:true},18).convert,false);
  assert.equal(colors.neuralDecision(.95,{...surface,disabled:true,control:true},18).convert,false);
});
test('P4: modelo original mantém corte de 0.80 para superfícies elegíveis',()=>{
  assert.equal(colors.neuralDecision(.79,surface,7).convert,false);
  assert.equal(colors.neuralDecision(.80,surface,7).convert,true);
  assert.equal(colors.neuralDecision(.81,{...surface,selected:true},7).convert,true);
});
test('P4: input inválido e modelo desconhecido falham fechados',()=>{
  for(const p of [NaN,Infinity,-1,1.1,null,undefined]){
    assert.equal(colors.neuralDecision(p,surface,18).convert,false);
  }
  assert.equal(colors.neuralDecision(1,surface,19).convert,false);
  assert.equal(colors.neuralDecision(1,null,18).convert,false);
});
