'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  PROTOCOL_SCHEMA,BAD_PREVIEW_SCHEMA,
  preparePreview,assertSameRecordSchema,repairArchivedPreviewMeta
}=require('../scripts/preview-config.cjs');

const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const inputs=()=>({
  indexHtml:source('index.html'),
  jointApp:source('src/joint/joint-app.js'),
  language:source('vwoma-i18n.js'),
  recordTransfer:source('src/joint/record-transfer.js')
});

test('el formato de runMeta coincide con el receptor en la versión experimental',()=>{
  const data=inputs(),preview=preparePreview(data);
  assert.doesNotThrow(()=>assertSameRecordSchema(preview.jointApp,data.recordTransfer));
  assert.match(preview.jointApp,/function runMeta\(run\)\s*\{\s*return \{schema:'pasarelas-upm-joint-v1'/);
  assert.doesNotMatch(preview.jointApp,/return \{schema:'pasarelas-upm-joint-vwoma-preview-v1'/);
  assert.equal(PROTOCOL_SCHEMA,'pasarelas-upm-joint-v1');
  assert.doesNotThrow(()=>new Function(preview.jointApp));
});

test('solo aísla el nombre de IndexedDB, el plano y el idioma; no el protocolo',()=>{
  const original=inputs(),preview=preparePreview(original);
  assert.match(preview.jointApp,/storageKey:'upm-joint-plan-vwoma-preview-v1'/);
  assert.match(preview.jointApp,/localStorage\.getItem\('upm-joint-plan-vwoma-preview-v1'\)/);
  assert.match(preview.jointApp,/databaseName:'upm-joint-vwoma-preview-v1'/);
  assert.match(preview.language,/vwoma\.language\.preview\.v1/);
  assert.match(preview.indexHtml,/src\/joint\/joint-app\.js\?v=20261113-preview-joint-solo-v14/);
  assert.match(preview.indexHtml,/VWOMA · PRUEBAS · Pasarelas UPM/);
  assert.match(preview.indexHtml,/src\/joint\/session-state\.js\?v=/);
  assert.match(preview.indexHtml,/src\/joint\/ui-events\.js\?v=/);
  assert.match(preview.indexHtml,/src\/joint\/tab-navigation\.js\?v=/);
  assert.match(preview.indexHtml,/src\/ui\/chart-tooltips\.js\?v=/);
  assert.equal(original.jointApp.includes("pasarelas-upm-joint-vwoma-preview-v1"),false);
  assert.equal(preview.jointApp.includes("schema:'"+BAD_PREVIEW_SCHEMA+"'"),false);
});

test('rechaza la sustitución global que causó el fallo reportado por el usuario',()=>{
  const data=inputs(),bad=data.jointApp.replaceAll('upm-joint-v1','upm-joint-vwoma-preview-v1');
  assert.throws(()=>assertSameRecordSchema(bad,data.recordTransfer),/schema mismatches/);
  assert.throws(()=>preparePreview({...data,jointApp:bad}),/schema mismatches/);
});

test('un archivo recuperado de la preview antigua conserva muestras e identidad',()=>{
  const old={schema:BAD_PREVIEW_SCHEMA,id:'test-4',session:'session-x',
    device:{id:'mobile-12',role:'guest'},
    samples:[[0,1,2,3,4,5,16.7,13.4,13.5]]};
  const fixed=repairArchivedPreviewMeta(old);
  assert.equal(fixed.schema,PROTOCOL_SCHEMA);
  assert.deepEqual(fixed.samples,old.samples);
  assert.deepEqual(fixed.device,old.device);
  assert.equal(fixed.id,old.id);
  assert.equal(old.schema,BAD_PREVIEW_SCHEMA);
  assert.strictEqual(repairArchivedPreviewMeta({schema:'third-party-v2'}).schema,'third-party-v2');
});

test('el generador falla si cambia una cadena objetivo y evita publicar una preview parcial',()=>{
  const original=inputs();
  const changed={...original,jointApp:original.jointApp.replace(
    "databaseName:'upm-joint-v1'","databaseName:'upm-joint-db-renamed'")};
  assert.throws(()=>preparePreview(changed),/preview replacement/);
});
