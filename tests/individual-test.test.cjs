'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {defaultTestName}=require('../src/ui/test-names.js');

test('el nombre por defecto es la fecha local: año mes día hora minuto segundo',()=>{
  assert.equal(defaultTestName(new Date(2026,10,13,19,24,7)),'2026-11-13 19:24:07');
  assert.equal(defaultTestName(new Date(2026,0,1,3,4,5)),'2026-01-01 03:04:05');
});

test('iniciar ensayo es el primer control; el nombre es opcional',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const section=html.slice(html.indexOf('<section id="testForm"'),html.indexOf('id="finishedTestButtons"'));
  assert.ok(section.indexOf('id="recordButton"')>=0);
  assert.ok(section.indexOf('id="recordButton"')<section.indexOf('Ensayo dinámico'));
  assert.ok(section.indexOf('id="recordButton"')<section.indexOf('id="testDescription"'));
  assert.ok(section.indexOf('id="recordButton"')<section.indexOf('id="accelerationChart"'));
  assert.doesNotMatch(section,/data-vwoma-tooltip-toggle/);
  assert.doesNotMatch(html,/data-vwoma-tooltip-toggle/);
});

test('la fecha se asigna únicamente tras obtener el sensor, sin bloquear el inicio',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  const code=app.slice(app.indexOf('async function startRecording()'),app.indexOf('async function requestIOSMotionPermissionIfNeeded()'));
  assert.doesNotMatch(code,/Escribe una descripción del ensayo antes de comenzar/);
  assert.ok(code.indexOf('const sensorStarted')<code.indexOf('VWOMATestNames.defaultTestName'));
  assert.ok(code.indexOf('VWOMATestNames.defaultTestName')<code.indexOf('recordingStartTime'));
  const newTest=app.slice(app.indexOf('newTestButton.addEventListener('),app.indexOf('downloadCsvButton.addEventListener('));
  assert.doesNotMatch(newTest,/testDescription\.focus\(/);
});
