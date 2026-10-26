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

test('P15: APIs do Neural Core estão disponíveis no bundle MV3 sem alterar o modelo atual', () => {
  const loaded = core.loadModel(model);
  const capabilities = core.getCapabilities();
  assert.deepEqual([...capabilities.operators], ['dense']);
  assert.deepEqual([...capabilities.activations], ['linear', 'relu', 'sigmoid', 'softmax', 'tanh']);
  const info = core.describeModel(loaded);
  assert.equal(info.inputSize, 7);
  assert.equal(info.outputSize, 1);
  assert.equal(info.layerCount, 2);
  assert.equal(info.parameterCount, model.layers.reduce((n, layer) => n + layer.weights.length + layer.biases.length, 0));
  const inputs = golden.cases.slice(0, 3).map(sample => sample.x);
  const outputs = core.predictBatch(loaded, inputs);
  assert.equal(outputs.length, inputs.length);
  outputs.forEach((output, i) => assert.ok(Math.abs(output[0] - core.predict(loaded, inputs[i])[0]) < 1e-7));
  const preserved = outputs[1][0];
  outputs[0][0] = -1;
  assert.equal(outputs[1][0], preserved, 'saídas do lote não podem compartilhar buffers');
  assert.equal(core.predict(loaded, inputs[0])[0], core.predictBatch(loaded, [inputs[0]])[0][0]);
  assert.deepEqual(core.predictBatch(loaded, []), []);
  assert.throws(() => core.predictBatch(loaded, Array.from({length: 4097}, () => inputs[0])), /limite/);
  assert.throws(() => core.loadModel({...model, layers: [{...model.layers[0], operator: 'attention'}, model.layers[1]]}), /operador/);
});

test('P15: softmax e entrada por lote funcionam no script clássico', () => {
  const definition = {formatVersion: 1, layers: [{
    inputSize: 2, outputSize: 2, activation: 'softmax',
    weights: [1, 0, 0, 1], biases: [0, 0]
  }]};
  const classifier = core.loadModel(definition);
  const predictions = core.predictBatch(classifier, [[3, 1], [1, 3]]);
  assert.ok(predictions[0][0] > predictions[0][1]);
  assert.ok(predictions[1][1] > predictions[1][0]);
  assert.ok(Math.abs(predictions[0][0] + predictions[0][1] - 1) < 1e-6);
});
