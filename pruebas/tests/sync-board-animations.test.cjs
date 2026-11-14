'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('original XYZ SVGs are preserved; six second and rest variants change only animateTransform',()=>{
 for(const axis of 'XYZ'){
  const basename='assets/joint/telefono-sincronizacion-eje-'+axis+'-tabla-madera-';
  const original=read(basename+'7_5s.svg'),live=read(basename+'medida-6s.svg'),rest=read(basename+'reposo.svg');
  const motion=original.match(/<animateTransform\b[^>]*\/>/g);
  assert.equal(motion?.length,1);
  assert.equal(live,original.replace('dur="7.50s" repeatCount="indefinite"','dur="6s" repeatCount="1" fill="freeze"'));
  assert.equal(rest,original.replace(motion[0],''));
  assert.match(original,/id="tabla_madera"/);
  assert.match(original,/id="movil_izquierdo"/);
  assert.match(original,/id="movil_derecho"/);
 }
});
test('physical-sync UI has demonstration, ready, countdown and progress controls',()=>{
 const html=read('index.html'),js=read('src/joint/ui-events.js');
 for(const id of ['jointSyncGuide','jointSyncGuideText','jointSyncGuideTime','jointSyncBack','jointSyncReplay','jointSyncContinue','jointSyncBegin','jointSyncProgress','jointSyncCountdown','jointSyncImage'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src\/joint\/calibration-controller\.js\?v=20261114-physical-sync-board-v1/);
 assert.match(js,/beginSyncExample\('x'\)/);
 assert.match(js,/\$\('jointSyncBegin'\)\.onclick=guard/);
});
