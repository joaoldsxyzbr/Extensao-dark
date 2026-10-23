'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../vendor/neural_core/neural-core.js');
const adapter = require('../content/neural.js');
const model = require('../data/neural-model.json');
const golden = require('./fixtures/neural-baseline.json');
const root = path.resolve(__dirname, '..');

test('modelo versionado usa exatamente o mesmo motor que o navegador', () => {
  const loaded = core.loadModel(model);
  assert.equal(loaded.inputSize, 7);
  assert.equal(loaded.outputSize, 1);
  assert.equal(adapter.MODEL.input, 7);
  for (const {x, p} of golden.cases) {
    assert.equal(adapter.probability(x)>=0.80, p>=0.80, 'decisão anterior preservada: '+JSON.stringify(x));
    assert.ok(Math.abs(core.predict(loaded, x)[0] - adapter.probability(x)) < 0.0000001);
  }
});

test('o pacote MV3 carrega o núcleo antes do adaptador sem dependências externas', () => {
  const manifest = require('../manifest.json');
  const list = manifest.content_scripts[0].js;
  assert.ok(list.indexOf('vendor/neural_core/neural-core.js') < list.indexOf('content/neural.js'));
  const sandbox = {};
  sandbox.globalThis = sandbox;
  for (const filename of ['vendor/neural_core/neural-core.js', 'content/neural.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, filename), 'utf8'), sandbox, {filename});
  }
  assert.equal(typeof sandbox.NeuralCore.predict, 'function');
  assert.ok(sandbox.DarkExtensionNeural.probability(golden.cases[0].x) > 0);
});

test('validação forte do motor rejeita modelos inválidos e não acessa a rede', () => {
  assert.throws(() => core.loadModel({...model, formatVersion: 999}), /versão desconhecida/);
  const js = fs.readFileSync(path.join(root,'vendor/neural_core/neural-core.js'), 'utf8');
  assert.doesNotMatch(js, /\bfetch\s*\(|\bXMLHttpRequest\b/);
});

test('geradores versionados não estão defasados', () => {
  const {execFileSync} = require('node:child_process');
  for (const filename of ['build-neural.js','export-neural-features.js']) {
    assert.doesNotThrow(() => execFileSync(process.execPath, [path.join(root,'scripts',filename),'--check'], {cwd:root,stdio:'pipe'}));
  }
});

test('modelo atualizado evita regressões e melhora o cenário de validação difícil', () => {
  const previous = core.loadModel(require('../data/neural-model-previous.json'));
  const current = core.loadModel(model);
  const data = require('../training/neural-features.json').samples;
  let gains = 0;
  for (const row of data.filter(r => r.split==='validation' || r.split==='holdout')) {
    const old = core.predict(previous,row.x)[0] >= 0.80;
    const now = core.predict(current,row.x)[0] >= 0.80;
    const expected = row.y[0]===1;
    assert.ok(now===expected || old!==expected, 'Nova regressão: '+row.id);
    if(now===expected && old!==expected) gains++;
  }
  assert.ok(gains>=1, 'Novo modelo precisa corrigir ao menos um erro anterior');
});
