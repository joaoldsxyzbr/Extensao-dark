#!/usr/bin/env node
'use strict';
// Empacota o snapshot JS do Neural Core para content scripts clássicos MV3.
// O motor upstream é copiado literalmente em vendor/neural_core/src/.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const get = name => fs.readFileSync(path.join(root, name), 'utf8');
const check = process.argv.includes('--check');

function strip(code, importsForward) {
  if (importsForward) {
    const statement = "import { forward } from './network.js';";
    if (!code.includes(statement)) throw Error('Import do motor alterado: atualize o empacotador com revisão');
    code = code.replace(statement, '');
  }
  code = code.replace(/^export function /gm, 'function ');
  if (/^\s*(import|export)\b/m.test(code)) throw Error('API do Neural Core mudou: revisão manual obrigatória');
  return code.trimEnd();
}
function output(filename, content) {
  const target = path.join(root, filename);
  if (check) assert.equal(get(filename), content, filename + ' desatualizado: execute node scripts/build-neural.js');
  else fs.writeFileSync(target, content);
}
const revision = '41e8d0ac8eeebd814abbd4782d3c809c3e46773d';
const prefix = '/* Neural Core reutilizável - snapshot ' + revision + '; gerado localmente, sem rede. */';
const bundled = [
  prefix,
  '(function(root) {',
  "'use strict';",
  strip(get('vendor/neural_core/src/network.js'), false),
  strip(get('vendor/neural_core/src/model.js'), true),
  'const api = Object.freeze({loadModel, predict, serializeModel});',
  "if (typeof module !== 'undefined' && module.exports) module.exports = api;",
  'else root.NeuralCore = api;',
  '})(globalThis);',
  ''
].join('\n');
output('vendor/neural_core/neural-core.js', bundled);
const model = JSON.parse(get('data/neural-model.json'));
const adapter = [
  '/* Adaptador local da Extensão Dark ao Neural Core; gerado por scripts/build-neural.js. */',
  '(function(root) {',
  "'use strict';",
  "const core = (typeof module !== 'undefined' && module.exports) ? require('../vendor/neural_core/neural-core.js') : root.NeuralCore;",
  'if (!core) return; // Sem IA, a extensão usa o motor clássico.',
  'const definition = ' + JSON.stringify(model) + ';',
  'let loaded;',
  'try { loaded = core.loadModel(definition); } catch (error) {',
  "  if (typeof module !== 'undefined' && module.exports) throw error;",
  '  return;',
  '}',
  'const MODEL = Object.freeze({formatVersion: definition.formatVersion, input: loaded.inputSize, hidden: definition.layers[0].outputSize});',
  'function probability(features) {',
  '  if (!Array.isArray(features) || features.length !== MODEL.input || !features.every(Number.isFinite)) return 0;',
  '  const values = features.map(value => Math.max(0, Math.min(1, value)));',
  '  try { return Math.max(0, Math.min(1, core.predict(loaded, values)[0])); }',
  '  catch { return 0; }',
  '}',
  'const api = Object.freeze({MODEL, probability});',
  "if (typeof module !== 'undefined' && module.exports) module.exports = api;",
  'else root.DarkExtensionNeural = api;',
  '})(globalThis);',
  ''
].join('\n');
output('content/neural.js', adapter);
console.log(check ? 'Motor e adaptador sincronizados.' : 'Motor e adaptador gerados.');
