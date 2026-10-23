#!/usr/bin/env node
'use strict';
// Extrai características com o MESMO código JS que roda na extensão.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const colors = require('../content/colors.js');
const dataset = require('../data/neural-cases.json');
const samples = dataset.cases.map(row => {
  const x = colors.neuralFeatures(
    colors.parseColor(row.bg),
    colors.parseColor(row.fg),
    colors.parseColor(row.parent),
    {control: row.control, selected: row.selected}
  );
  if (!x || x.length !== 7 || !x.every(Number.isFinite)) throw Error('Características inválidas: ' + row.id);
  if (![0, 1].includes(row.label) || !['train', 'holdout'].includes(row.split)) throw Error('Rótulo inválido: ' + row.id);
  return {id: row.id, split: row.split, x: x.map(value => Number(value.toFixed(12))), y: [row.label]};
});
const content = JSON.stringify({formatVersion: 1, samples}, null, 2) + '\n';
const output = path.join(root, 'training/neural-features.json');
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(output, 'utf8'), content, 'Dados defasados: execute node scripts/export-neural-features.js');
else fs.writeFileSync(output, content);
console.log('Vetores de treinamento conferidos:', samples.length);
