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
  const acquisition = find('src/joint/acquisition.js?');
  const calibrationMath = find('src/joint/calibration-math.js?');
  const calibration = find('src/joint/calibration-controller.js?');
  const exportsIndex = find('src/joint/exports.js?');
  const transfer = find('src/joint/record-transfer.js?');
  const results = find('src/joint/results-view.js?');
  const joint = find('src/joint/joint-app.js?');
  const translations = find('vwoma-i18n.js?');

  assert.ok(preprocessing >= 0 && preprocessing < legacy, 'el preprocesamiento debe cargarse antes de app.js');
  assert.ok(spectra >= 0 && spectra < legacy, 'el cálculo espectral debe cargarse primero');
  assert.ok(legacy >= 0, 'falta app.js');
  assert.ok(plan > legacy && plan < joint, 'el controlador del plano debe cargarse antes de la medida conjunta');
  assert.ok(transport > plan && transport < joint, 'WebRTC debe cargarse después del plano y antes de joint-app.js');
  assert.ok(clock > transport && clock < joint, 'el modelo de reloj debe cargarse después del transporte y antes de joint-app.js');
  assert.ok(persistence > clock && persistence < joint, 'el almacenamiento debe cargarse antes de joint-app.js');
  assert.ok(acquisition > persistence && acquisition < joint, 'el controlador de adquisición debe cargarse antes de joint-app.js');
  assert.ok(calibrationMath > acquisition && calibrationMath < calibration, 'las matemáticas de calibración se cargan antes del controlador');
  assert.ok(calibration > acquisition && calibration < joint, 'el controlador de calibración se carga antes de la aplicación conjunta');
  assert.ok(exportsIndex > calibration && exportsIndex < transfer, 'exports antes de transferencia');
  assert.ok(transfer > exportsIndex && transfer < results, 'transferencia antes de resultados');
  assert.ok(results > transfer && results < joint, 'resultados antes de joint-app.js');
  assert.ok(joint > legacy, 'la medida conjunta debe cargarse después de app.js');
  assert.ok(translations > joint, 'las traducciones se cargan al final');
  for (const index of [preprocessing, spectra, legacy, plan, transport, clock, persistence, acquisition, calibrationMath, calibration, exportsIndex, transfer, results, joint]) {
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

test('el ciclo de adquisición está separado del DOM y de la señalización WebRTC', () => {
  const acquisition = read('src/joint/acquisition.js');
  const joint = read('src/joint/joint-app.js');
  assert.match(acquisition, /function createAcquisition\(/);
  for(const name of ['appendSample','beginRun','startRun','stopRun','finishRun']) {
    assert.match(acquisition,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  assert.doesNotMatch(acquisition, /document\.|querySelector|RTCPeerConnection|indexedDB/);
  assert.match(joint, /VWOMAAcquisition\.createAcquisition\(/);
  assert.match(joint, /enterRecording:.*=>/);
  assert.match(joint, /readDuration:\(\)=>\$\('jointDuration'\)\.value/);
});

test('la calibración científica y el controlador de gestos quedan separados', () => {
  const math = read('src/joint/calibration-math.js');
  const controller = read('src/joint/calibration-controller.js');
  const joint = read('src/joint/joint-app.js');
  assert.match(math,/function createMath\(/);
  for(const name of ['linearDetrend','lowPassCalibration','calibrationLobes',
                      'correctedVector','filteredGestureSeries','interpolateGesture',
                      'correlationAt','estimateGestureAxis']){
    assert.match(math,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  assert.doesNotMatch(math,/document\.|localStorage|indexedDB|RTCPeerConnection|querySelector/);
  assert.match(controller,/function createController\(/);
  for(const name of ['finishCalibration','startCalibration',
                    'startSyncCalibration','finalizeSyncGesture']){
    assert.match(controller,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  assert.match(joint,/VWOMACalibrationMath\.createMath\(/);
  assert.match(joint,/VWOMACalibration\.createController\(/);
});

test('resultados, exportaciones y transferencia tienen responsabilidades distintas',()=>{
  const joint=read('src/joint/joint-app.js');
  const exportSource=read('src/joint/exports.js');
  const transferSource=read('src/joint/record-transfer.js');
  const view=read('src/joint/results-view.js');
  assert.match(joint,/VWOMAExports\.createExports\(/);
  assert.match(joint,/VWOMARecordTransfer\.createTransfer\(/);
  assert.match(joint,/VWOMAResultsView\.createResultsView\(/);
  for (const name of ['exportSession','processedCommonExport','exportCsv','resampleAxis','detrendPoints']) {
    assert.match(exportSource,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  for(const name of ['hashText','validateRecord','acknowledged','sendRecord','handleTransferMessage']) {
    assert.match(transferSource,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  for(const name of ['renderResults','renderSyncResults','renderComparison']) {
    assert.match(view,new RegExp('function '+name+'\\('));
    assert.doesNotMatch(joint,new RegExp('function '+name+'\\('));
  }
  assert.doesNotMatch(exportSource,/RTCPeerConnection|indexedDB|onmessage/);
  assert.doesNotMatch(view,/indexedDB|RTCPeerConnection/);
  assert.match(transferSource,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(transferSource,/m\.type==='TRANSFER_ACK'/);
  assert.match(joint,/handleTransferMessage\(p,m\)/);
});
