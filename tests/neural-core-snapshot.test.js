'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('pin do Neural Core é único, íntegro e usado no bundle MV3', () => {
  const upstream = fs.readFileSync(path.join(root, 'vendor/neural_core/UPSTREAM.md'), 'utf8');
  const match = /^Commit fixado: `([a-f0-9]{40})`/m.exec(upstream);
  assert.ok(match, 'UPSTREAM.md deve conter commit SHA completo');
  const revision = match[1];
  const bundle = fs.readFileSync(path.join(root, 'vendor/neural_core/neural-core.js'), 'utf8');
  assert.ok(bundle.startsWith('/* Neural Core reutilizável - snapshot ' + revision + ';'));
  const build = fs.readFileSync(path.join(root, 'scripts/build-neural.js'), 'utf8');
  assert.match(build, /const upstream = get\('vendor\/neural_core\/UPSTREAM\.md'\)/);
  assert.doesNotMatch(build, /const revision = '[0-9a-f]{40}'/);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /\[UPSTREAM\.md\]\(vendor\/neural_core\/UPSTREAM\.md\)/);
});
