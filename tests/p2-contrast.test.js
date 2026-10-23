'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const colors = require('../content/colors.js');
const rgb = value => colors.parseColor(value);

// These tests describe accessibility behavior, not the implementation.
test('composição alfa respeita ordem das camadas', () => {
  const r = colors.compositeColor(rgb('rgba(255,255,255,0.5)'), rgb('rgb(0,0,0)'));
  assert.ok(Math.abs(r.r-127.5)<.01);
  assert.equal(r.a,1);
  assert.deepEqual(colors.compositeColor(rgb('rgba(0,0,0,0)'),rgb('rgb(12,24,36)')),rgb('rgb(12,24,36)'));
});

test('texto escuro em fundo escuro recebe correção AA de 4.5:1', () => {
  const background=rgb('rgb(26,28,32)');
  const original=rgb('rgb(72,74,80)');
  const replacement=colors.ensureContrast(original,background,4.5);
  assert.ok(replacement);
  assert.ok(colors.contrastRatio(rgb(replacement),background)>=4.5);
});

test('texto claro já legível permanece sem substituição', () => {
  assert.equal(colors.ensureContrast(rgb('rgb(235,235,235)'),rgb('rgb(25,25,25)'),4.5),null);
});

test('texto translúcido é avaliado após composição sobre fundo real',()=>{
  const background=rgb('rgb(23,25,28)');
  const text=rgb('rgba(250,250,250,0.4)');
  const replacement=colors.ensureContrast(text,background,4.5);
  assert.ok(replacement,'contraste aparente ruim não pode passar por causa de alpha');
  assert.ok(colors.contrastRatio(rgb(replacement),background)>=4.5);
});

test('legibilidade corrige texto sobre destaque sem alterar o fundo de destaque',()=>{
  const bg=rgb('rgb(8,115,235)'), fg=rgb('rgb(75,125,225)');
  const replacement=colors.ensureContrast(fg,bg,4.5);
  assert.ok(replacement);
  assert.ok(colors.contrastRatio(rgb(replacement),bg)>=4.5);
});

test('texto grande normal e texto negrito usam mínimo 3:1, sem inferir tamanho inexistente',()=>{
  assert.equal(colors.textContrastThreshold({fontSize:'24px',fontWeight:'400'}),3);
  assert.equal(colors.textContrastThreshold({fontSize:'19px',fontWeight:'700'}),3);
  assert.equal(colors.textContrastThreshold({fontSize:'20px',fontWeight:'bold'}),3);
  assert.equal(colors.textContrastThreshold({fontSize:'20px',fontWeight:'400'}),4.5);
  assert.equal(colors.textContrastThreshold({}),4.5);
});

test('bordas e indicadores de controles recebem pelo menos 3:1 se insuficientes',()=>{
  const bg=rgb('rgb(25,25,25)'), fg=rgb('rgb(80,80,80)');
  const out=colors.ensureContrast(fg,bg,3);
  assert.ok(out);
  assert.ok(colors.contrastRatio(rgb(out),bg)>=3);
});

test('contraste impossível ou opacidade decorativa não gera CSS inventado',()=>{
  assert.equal(colors.ensureContrast(null,rgb('rgb(0,0,0)'),4.5),null);
  assert.equal(colors.ensureContrast(rgb('rgba(0,0,0,0.1)'),rgb('rgb(0,0,0)'),4.5),null);
});
