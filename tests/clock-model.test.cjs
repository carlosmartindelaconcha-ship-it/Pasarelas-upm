'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createClockModel}=require('../src/joint/clock-model.js');

const nowMs=125000;
const model=createClockModel({now:()=>nowMs,finite:Number.isFinite});
const {median,clockFit,toMaster,fromMaster,validModel,modelOffsetAt,
       offsetResidual,selectedForModel,syncMetric}=model;
const near=(a,b,epsilon=1e-8)=>assert.ok(
  Number.isFinite(a)&&Math.abs(a-b)<=epsilon,
  `Esperado ${b}, obtenido ${a} (diferencia ${a-b})`);

test('mediana robusta y selección de elementos finitos',()=>{
  near(median([7,1,3,Infinity,NaN]),3);
  near(median([8,2,4,6]),5);
  assert.equal(median([]),null);
});

test('intercambios de tiempo vacíos no generan modelos de reloj',()=>{
  assert.equal(clockFit([]),null);
});

test('el ajuste rechaza RTT altos y conserva el offset de RTT bajo',()=>{
  const rows=Array.from({length:20},(_,i)=>({
    local:10000+i*1000,
    offset:i<15?7.25:500,
    rtt:i<15?8:500
  }));
  const fit=clockFit(rows);
  near(fit.offset,7.25);
  near(fit.drift,0);
  near(fit.rtt,8);
  near(fit.rttCutoff,8);
  near(fit.rttMedian,8);
  near(fit.residual,0);
  assert.equal(fit.count,20);
  assert.equal(fit.selectedCount,15);
  assert.equal(fit.updated,nowMs);
  assert.equal(fit.method,'mediana del 30 % de RTT menor; deriva Theil–Sen');
});

test('detecta deriva mediante Theil-Sen con más de 20 segundos de observación',()=>{
  const drift=0.00008,reference=100000,offset=39.5;
  const rows=Array.from({length:40},(_,i)=>({
    local:reference+i*3000,
    offset:i<30?offset+drift*i*3000:800,
    rtt:i<30?4:400
  }));
  const fit=clockFit(rows);
  assert.ok(fit);
  near(fit.drift,drift,1e-12);
  near(fit.reference,reference+14.5*3000);
  near(fit.offset,offset+drift*(fit.reference-reference),1e-8);
  near(fit.residual,0);
  assert.equal(fit.selectedCount,30);
  near(fit.span,87000);
});

test('rechaza una deriva físicamente implausible',()=>{
  const rows=Array.from({length:8},(_,i)=>({
    local:i*4000,
    offset:0.008*i*4000,
    rtt:5
  }));
  assert.equal(clockFit(rows),null);
});

test('transformaciones maestro y participante son inversas en ms',()=>{
  const m={offset:3924.85,drift:-0.00008,reference:125000,
    count:18,rtt:6.5};
  for(const localTime of [0,10000,125000,150000,900000]){
    near(fromMaster(toMaster(localTime,m),m),localTime,1e-7);
  }
  near(toMaster(m.reference,m),m.reference-m.offset);
  near(fromMaster(toMaster(200000,{offset:0,drift:0,reference:0}),
    {offset:0,drift:0,reference:0}),200000);
});

test('validación de modelos conserva límites y campos exigidos',()=>{
  const good={offset:7,drift:0.005,reference:120,rtt:3,count:1};
  assert.equal(validModel(good),true);
  assert.equal(validModel({...good,drift:0.00500001}),false);
  assert.equal(validModel({...good,count:0}),false);
  assert.equal(validModel({...good,rtt:NaN}),false);
  assert.equal(Boolean(validModel(null)),false);
});

test('diagnóstico de offset residual y exclusión por RTT',()=>{
  const fit={offset:10,drift:.0002,reference:20000,rttCutoff:8};
  const row={offset:10.75,local:22000,rtt:7};
  near(modelOffsetAt(fit,row.local),10.4);
  near(offsetResidual(row,fit),.35);
  assert.equal(selectedForModel(row,fit),true);
  assert.equal(selectedForModel({...row,rtt:9},fit),false);
  assert.equal(selectedForModel(row,null),true);
  near(syncMetric(row,'offset',fit),.35);
  near(syncMetric(row,'rtt',fit),7);
  near(modelOffsetAt(null,row.local),0);
});

test('el módulo funciona en scripts clásicos de Safari/Chrome',()=>{
  const browser={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../src/joint/clock-model.js'),'utf8'),browser);
  assert.equal(typeof browser.VWOMAClockModel.createClockModel,'function');
  const instance=browser.VWOMAClockModel.createClockModel({
    now:()=>nowMs,finite:Number.isFinite});
  near(instance.clockFit([{local:0,rtt:2,offset:3}]).offset,3);
  assert.equal(typeof instance.fromMaster,'function');
});
