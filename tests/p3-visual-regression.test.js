'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const colors = require('../content/colors.js');
const parse = colors.parseColor;

test('painel branco semitransparente sobre fundo escuro mantém alfa mas deixa de ser branco', () => {
  const out = colors.mapTranslucentBackground(
    parse('rgba(255, 255, 255, 0.75)'),
    parse('rgb(25, 25, 25)'),
    parse('rgb(24, 24, 24)'), 'deep'
  );
  assert.ok(out, 'painel claro com texto escuro deve ser adaptado');
  const overlay = parse(out);
  assert.equal(overlay.a, .75);
  const visible = colors.compositeColor(overlay, parse('rgb(24,24,24)'));
  assert.ok(colors.luminance(visible) < .12, 'o painel não deve virar uma faixa clara');
});

test('não altera transparências pequenas, acentos e fundos sem contexto confiável', () => {
  const parent = parse('rgb(24,24,24)');
  const darkText = parse('rgb(25,25,25)');
  assert.equal(colors.mapTranslucentBackground(parse('rgba(255,255,255,0.08)'),darkText,parent,'deep'),null);
  assert.equal(colors.mapTranslucentBackground(parse('rgba(8,115,235,0.75)'),darkText,parent,'deep'),null);
  assert.equal(colors.mapTranslucentBackground(parse('rgba(255,255,255,0.75)'),parse('rgb(245,245,245)'),parent,'deep'),null);
  assert.equal(colors.mapTranslucentBackground(parse('rgba(255,255,255,0.75)'),darkText,null,'deep'),null);
  assert.equal(colors.mapTranslucentBackground(parse('rgba(255,255,255,0.75)'),darkText,parse('rgb(245,245,245)'),'deep'),null);
});
