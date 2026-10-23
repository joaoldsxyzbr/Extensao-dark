'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifesto habilita URL do site no popup e não pede permissões redundantes', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('activeTab'), 'popup precisa acessar a URL da aba clicada');
  assert.equal(manifest.host_permissions, undefined, 'content_scripts já declara os matches');
});

test('ícones referenciados existem, são PNG válidos e têm dimensões esperadas', () => {
  for (const [size, relativePath] of Object.entries(manifest.icons)) {
    const file = fs.readFileSync(path.join(root, relativePath));
    assert.ok(file.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
    assert.equal(file.readUInt32BE(16), Number(size));
    assert.equal(file.readUInt32BE(20), Number(size));
  }
  for (const relativePath of Object.values(manifest.action.default_icon)) {
    assert.ok(fs.existsSync(path.join(root, relativePath)));
  }
});

test('popup usa a mesma identidade visual do ícone da extensão', () => {
  const html = fs.readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
  assert.match(html, /src="\.\.\/icons\/icon-48\.png"/);
});

test('todas as referências do manifesto apontam para arquivos existentes', () => {
  assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
  for (const script of manifest.content_scripts) {
    for (const filename of script.js) assert.ok(fs.existsSync(path.join(root, filename)));
  }
});
