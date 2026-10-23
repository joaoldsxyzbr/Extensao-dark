'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let colors = {};
try { colors = require('../content/colors.js'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('parseColor aceita rgb, rgba, espaços e alpha', () => {
  assert.deepEqual(colors.parseColor('rgb(255, 240, 220)'), {r:255,g:240,b:220,a:1});
  assert.deepEqual(colors.parseColor('rgba(12, 24, 36, 0.5)'), {r:12,g:24,b:36,a:0.5});
  assert.deepEqual(colors.parseColor('rgb(10 20 30 / 50%)'), {r:10,g:20,b:30,a:0.5});
});

test('parseColor rejeita cores inválidas sem travar', () => {
  for (const value of ['', 'transparent', 'inherit', 'rgb(abc)', 'rgb(1,2)', 'color(display-p3 1 0 0)']) {
    assert.equal(colors.parseColor(value), null, value);
  }
});

test('mapBackground escurece branco e preserva fundos transparentes ou escuros', () => {
  assert.match(colors.mapBackground(colors.parseColor('rgb(255,255,255)'), 'deep'), /^rgb\(\d+, \d+, \d+\)$/);
  assert.equal(colors.mapBackground(colors.parseColor('rgba(255,255,255,0)'), 'deep'), null);
  assert.equal(colors.mapBackground(colors.parseColor('rgb(16,18,24)'), 'deep'), null);
});

test('mapBackground diferencia paletas', () => {
  const white = colors.parseColor('rgb(255,255,255)');
  assert.notEqual(colors.mapBackground(white, 'soft'), colors.mapBackground(white, 'deep'));
  assert.notEqual(colors.mapBackground(white, 'deep'), colors.mapBackground(white, 'amoled'));
});

test('mapText ilumina texto escuro mas não toca texto claro', () => {
  assert.match(colors.mapText(colors.parseColor('rgb(0,0,0)')), /^rgb\(\d+, \d+, \d+\)$/);
  assert.equal(colors.mapText(colors.parseColor('rgb(245,245,245)')), null);
});

test('isEnabledForSite respeita liga/desliga e exceção exata de host', () => {
  const config={enabled:true, disabledHosts:['example.com'], theme:'deep'};
  assert.equal(colors.isEnabledForSite(config, 'example.com'), false);
  assert.equal(colors.isEnabledForSite(config, 'blog.example.com'), true);
  assert.equal(colors.isEnabledForSite({...config,enabled:false}, 'other.com'), false);
  assert.equal(colors.isEnabledForSite(config, 'other.com'), true);
});
