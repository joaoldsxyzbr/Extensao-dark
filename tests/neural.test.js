'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Neural = require('../content/neural.js');

test('modelo é uma rede neural local, pequena e com inferência finita', () => {
  assert.ok(Neural.MODEL.hidden >= 3 && Neural.MODEL.hidden <= 16);
  assert.ok(Neural.MODEL.input >= 3 && Neural.MODEL.input <= 8);
  assert.ok(fs.statSync(path.join(__dirname, '../content/neural.js')).size < 10_000);
  for (const features of [[0.24, 0.01, 0.9], [0.02, 0.9, 1], [1, 0.02, 1], [NaN, 3, -1]]) {
    const result = Neural.probability(features);
    assert.ok(Number.isFinite(result) && result >= 0 && result <= 1);
  }
});

test('previsão conservadora distingue painel cinza com texto escuro de painel escuro com texto claro', () => {
  assert.ok(Neural.probability([0.28, 0.008, 1]) > 0.78);
  assert.ok(Neural.probability([0.02, 0.86, 1]) < 0.20);
  assert.ok(Neural.probability([0.95, 0.008, 1]) > 0.90);
});

test('modelo é determinístico e não utiliza chamadas externas', () => {
  const point = [0.24, 0.01, 0.9];
  assert.equal(Neural.probability(point), Neural.probability(point));
  const source = fs.readFileSync(path.join(__dirname, '../content/neural.js'),'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|https?:\/\//);
});
