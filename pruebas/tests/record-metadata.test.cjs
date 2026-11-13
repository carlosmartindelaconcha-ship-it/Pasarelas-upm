'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createTransfer}=require('../src/joint/record-transfer.js');

test('el esquema que produce runMeta de VWOMA es válido para el receptor WebRTC',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../src/joint/joint-app.js'),'utf8');
  const begin=src.indexOf('    function runMeta(run) {');
  const end=src.indexOf('    function localRecord() {',begin);
  assert.ok(begin>=0&&end>begin);
  const context={navigator:{userAgent:'Safari WebKit (simulado)'}};
  vm.runInNewContext(src.slice(begin,end)+'\nthis.runMeta=runMeta;',context);
  const run={
    id:'same-run',session:'same-session',created:'2026-11-13T14:20:00.000Z',
    state:'finished',device:{id:'paired-guest',role:'guest',name:'Participante'},
    plan:{name:'Ensayo',length:24,width:4,points:[]},
    start:1000,end:1100,plannedEnd:1100,
    initialClock:{offset:18,drift:0,reference:1000},
    networkClock:{offset:18,drift:0,reference:1000},
    finalClock:{offset:18,drift:0,reference:1000},
    syncModels:{},synchronizationCalibration:{accepted:true},
    sync:[],incidents:[],samples:[[0,0,0,1,2,3,16.7,1010,992]]
  };
  const serialized=JSON.stringify({...context.runMeta(run),samples:run.samples});
  const received=JSON.parse(serialized);
  const persistence=createTransfer({
    s:{role:'host',session:'same-session',results:new Map()},MAX_SAMPLES:500000,
    finite:Number.isFinite,send:()=>true,renderResults:()=>{},
    localRecord:()=>null,uid:()=> 'unused',tell:()=>{},
    crypto:require('node:crypto').webcrypto,TextEncoder,Uint8Array,
    setTimeout,clearTimeout
  });
  assert.doesNotThrow(()=>persistence.validateRecord(received,'paired-guest','same-run'));
  assert.equal(received.schema,'pasarelas-upm-joint-v1');
  assert.equal(received.device.id,'paired-guest');
  assert.equal(received.samples.length,1);
});
