'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la aplicación conjunta está aislada en su archivo, sin duplicar el bloque', () => {
  const legacy = read('app.js');
  const joint = read('src/joint/joint-app.js');
  assert.doesNotMatch(legacy, /MEDIDA CONJUNTA — prototipo estático/);
  assert.match(joint, /MEDIDA CONJUNTA — prototipo estático/);
  assert.match(joint, /\(\(\) => \{/);
  assert.match(joint.trimEnd(), /\}\)\(\);$/);
});

test('los scripts clásicos conservan el orden que exige la integración', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"[^>]*><\/script>/g)];
  const find = prefix => scripts.findIndex(match => match[2].startsWith(prefix));
  const spectra = find('src/signal/spectra.js?');
  const legacy = find('app.js?');
  const joint = find('src/joint/joint-app.js?');
  const translations = find('vwoma-i18n.js?');

  assert.ok(spectra >= 0 && spectra < legacy, 'el cálculo espectral debe cargarse primero');
  assert.ok(legacy >= 0, 'falta app.js');
  assert.ok(joint > legacy, 'la medida conjunta debe cargarse después de app.js');
  assert.ok(translations > joint, 'las traducciones se cargan al final');
  for (const index of [spectra, legacy, joint]) {
    assert.doesNotMatch(scripts[index][1], /\btype\s*=\s*["']module["']/);
    assert.match(scripts[index][1], /\bdefer\b/);
  }
});
