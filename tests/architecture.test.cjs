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
  const preprocessing = find('src/signal/preprocessing.js?');
  const spectra = find('src/signal/spectra.js?');
  const legacy = find('app.js?');
  const plan = find('src/joint/plan-controller.js?');
  const transport = find('src/joint/webrtc-transport.js?');
  const clock = find('src/joint/clock-model.js?');
  const persistence = find('src/joint/persistence.js?');
  const joint = find('src/joint/joint-app.js?');
  const translations = find('vwoma-i18n.js?');

  assert.ok(preprocessing >= 0 && preprocessing < legacy, 'el preprocesamiento debe cargarse antes de app.js');
  assert.ok(spectra >= 0 && spectra < legacy, 'el cálculo espectral debe cargarse primero');
  assert.ok(legacy >= 0, 'falta app.js');
  assert.ok(plan > legacy && plan < joint, 'el controlador del plano debe cargarse antes de la medida conjunta');
  assert.ok(transport > plan && transport < joint, 'WebRTC debe cargarse después del plano y antes de joint-app.js');
  assert.ok(clock > transport && clock < joint, 'el modelo de reloj debe cargarse después del transporte y antes de joint-app.js');
  assert.ok(persistence > clock && persistence < joint, 'el almacenamiento debe cargarse antes de joint-app.js');
  assert.ok(joint > legacy, 'la medida conjunta debe cargarse después de app.js');
  assert.ok(translations > joint, 'las traducciones se cargan al final');
  for (const index of [preprocessing, spectra, legacy, plan, transport, clock, persistence, joint]) {
    assert.doesNotMatch(scripts[index][1], /\btype\s*=\s*["']module["']/);
    assert.match(scripts[index][1], /\bdefer\b/);
  }
});

test('el controlador del plano está separado del transporte y usa dependencias explícitas', () => {
  const joint = read('src/joint/joint-app.js');
  const plan = read('src/joint/plan-controller.js');
  assert.match(plan, /function createController\(/);
  assert.match(plan, /function deletePlanPoint\(/);
  assert.match(plan, /function renderPlan\(/);
  assert.doesNotMatch(plan, /RTCPeerConnection|function startSync\(/);
  assert.match(joint, /VWOMAPlan\.createController\(/);
  assert.doesNotMatch(joint, /function deletePlanPoint\(/);
});

test('WebRTC y el emparejamiento pertenecen al controlador de transporte', () => {
  const transport = read('src/joint/webrtc-transport.js');
  const joint = read('src/joint/joint-app.js');
  assert.match(transport, /function createTransport\(/);
  assert.match(transport, /function newPeer\(/);
  assert.match(transport, /function wireChannel\(/);
  assert.match(transport, /function decodeToken\(/);
  assert.doesNotMatch(joint, /function newPeer\(/);
  assert.match(joint, /VWOMATransport\.createTransport\(/);
});

test('el plano difiere el envío hasta inicializar WebRTC', () => {
  const joint = read('src/joint/joint-app.js');
  assert.match(joint, /broadcast:\s*\(\.\.\.args\)\s*=>\s*broadcast\(\.\.\.args\)/);
});

test('el transporte usa callbacks diferidos para orquestación de la aplicación', () => {
  const joint = read('src/joint/joint-app.js');
  for (const callback of ['renderDevices','workspace','startSync','onMessage']) {
    assert.match(joint, new RegExp(callback + ':\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*' + callback + '\\(\\.\\.\\.args\\)'));
  }
});

test('los modelos de reloj y deriva están aislados del transporte y de la UI', () => {
  const clock = read('src/joint/clock-model.js');
  const joint = read('src/joint/joint-app.js');
  assert.match(clock, /function createClockModel\(/);
  assert.match(clock, /function clockFit\(/);
  assert.match(clock, /const toMaster=/);
  assert.match(clock, /const fromMaster=/);
  assert.match(clock, /function validModel\(/);
  assert.doesNotMatch(clock, /document\.|RTCPeerConnection|localStorage|indexedDB/);
  assert.match(joint, /VWOMAClockModel\.createClockModel\(/);
  assert.doesNotMatch(joint, /function clockFit\(/);
  assert.doesNotMatch(joint, /const fromMaster=/);
});

test('IndexedDB se mantiene fuera de la UI y conserva almacenes y claves', () => {
  const persistence = read('src/joint/persistence.js');
  const joint = read('src/joint/joint-app.js');
  const plan = read('src/joint/plan-controller.js');
  assert.match(persistence, /function createPersistence\(/);
  assert.match(persistence, /function storeBatch\(/);
  assert.match(persistence, /function persistBeforeClosing\(/);
  assert.match(persistence, /objectStore\('runs'\)/);
  assert.match(persistence, /objectStore\('chunks'\)/);
  assert.match(joint, /VWOMAPersistence\.createPersistence\(/);
  assert.match(joint, /databaseName:'upm-joint-v1'/);
  assert.match(joint, /storageKey:'upm-joint-plan-v1'/);
  assert.match(plan, /localStorage\.setItem\(storageKey,/);
  assert.doesNotMatch(joint, /indexedDB\.open\(/);
  assert.doesNotMatch(joint, /IDBKeyRange\.bound\(/);
  assert.doesNotMatch(joint, /function storeBatch\(/);
});
