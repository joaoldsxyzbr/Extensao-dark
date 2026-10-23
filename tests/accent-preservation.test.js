'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');

test('preserva superfícies e indicadores com cores saturadas',()=>{
  assert.equal(colors.isVividAccent(colors.parseColor('rgb(8,115,235)')),true,'indicador azul');
  assert.equal(colors.isVividAccent(colors.parseColor('rgb(235,20,50)')),true,'badge vermelho');
  assert.equal(colors.isVividAccent(colors.parseColor('rgb(255,255,255)')),false,'fundo claro');
  assert.equal(colors.isVividAccent(colors.parseColor('rgb(34,35,39)')),false,'cartão escuro');
});
