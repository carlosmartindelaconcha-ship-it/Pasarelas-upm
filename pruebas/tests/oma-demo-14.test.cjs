'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const demo=require('../src/oma/efdd-demo.js');
const EF=require('../src/oma/efdd-core.js');
const spec=require('../src/signal/spectra.js');
const sample=()=>demo.generate(20261117);

test('14 acelerómetros: 7 por cada lado; 50 x 10.5 m; 180 s @ 60 Hz',()=>{
  const d=sample();
  assert.equal(d.plan.length,50);assert.equal(d.plan.width,10.5);
  assert.equal(d.records.length,14);assert.equal(d.commonRateHz,60);
  assert.equal(d.simulation.durationSeconds,180);
  assert.equal(d.simulation.samplesPerSensor,10800);
  assert.equal(d.records[0].samples.length,10800);
  assert.equal(d.records[13].samples.length,10800);
  assert.equal(d.records[0].samples.at(-1).masterTimeMs,(10800-1)*1000/60);
  const left=d.plan.points.filter(p=>p.y===0);
  const right=d.plan.points.filter(p=>p.y===10.5);
  assert.equal(left.length,7);assert.equal(right.length,7);
  assert.deepEqual(left.map(p=>p.x),right.map(p=>p.x));
  assert.deepEqual(d.simulation.modes.map(m=>m.frequencyHz),[2,5,8,18]);
  const torsion=d.simulation.modes.find(m=>m.id==='T1');
  assert.equal(torsion.signedShape[0].value,-torsion.signedShape[7].value);
  for(const id of ['B1','B2','B3']){
    const shape=d.simulation.modes.find(m=>m.id===id).signedShape;
    for(let i=0;i<7;i++)assert.equal(shape[i].value,shape[7+i].value);
  }
});

test('generación reproducible con semilla fija y señales no idénticas entre sensores',()=>{
  const a=sample(),b=sample();
  for(const [i,j] of [[0,0],[10,48],[9000,10799]])
    assert.deepEqual(a.records[i].samples[j],b.records[i].samples[j]);
  assert.notEqual(a.records[0].samples[3333].z,a.records[7].samples[3333].z);
});

test('ruido blanco: autocorrelación cercana a cero y PSD razonablemente uniforme',()=>{
  const n=10800,gen=demo.seededNormal(12345),other=demo.seededNormal(98765);
  const x=Array.from({length:n},()=>gen()),y=Array.from({length:n},()=>other());
  const mean=x.reduce((a,b)=>a+b,0)/n;
  const variance=x.reduce((a,b)=>a+(b-mean)**2,0)/n;
  assert.ok(Math.abs(mean)<.03);
  assert.ok(Math.abs(Math.sqrt(variance)-1)<.03);
  const auto=(lag)=>x.slice(lag).reduce((sum,v,i)=>sum+v*x[i],0)/((n-lag)*variance);
  assert.ok(Math.abs(auto(1))<.035);
  assert.ok(Math.abs(auto(10))<.035);
  const cross=x.reduce((sum,v,i)=>sum+v*y[i],0)/n;
  assert.ok(Math.abs(cross)<.04);
  const spectrum=spec.calculateWelchPsd(x.map(v=>({v})),'v',60);
  const bands=[[1,6],[6,12],[12,18],[18,24],[24,29]].map(([min,max])=>{
    const band=spectrum.filter(p=>p.x>=min&&p.x<max);
    return band.reduce((s,p)=>s+p.y,0)/band.length;
  });
  assert.ok(Math.max(...bands)/Math.min(...bands)<1.30);
});

test('FDD recupera las cuatro formas modales de flexión/torsión con ruido',()=>{
  const input=sample(),r=EF.compute([input],{axis:'z',maxHz:25,nfft:4096});
  assert.equal(r.kind,'simultaneous');assert.equal(r.channels.length,14);
  assert.equal(r.rank,3);assert.equal(r.segments[0],5);
  assert.ok(Math.abs(r.fs-60)<1e-8);
  for(const trueMode of input.simulation.modes){
    const estimated=EF.estimate(r,trueMode.frequencyHz,0,{macThreshold:.75});
    const theoretical=new Map(trueMode.signedShape.map(p=>[p.id,p.value]));
    const target=estimated.shape.points.map(p=>({re:theoretical.get(p.id),im:0}));
    const estimate=estimated.shape.points.map(p=>({re:p.re,im:p.im}));
    const mac=EF.mac(target,estimate);
    assert.ok(Math.abs(estimated.frequencyHz-trueMode.frequencyHz)<.15,
      trueMode.name+' no coincide en frecuencia: '+estimated.frequencyHz);
    assert.ok(mac>.995,trueMode.name+' MAC insuficiente: '+mac);
  }
});

test('la demo y el worker están conectados en la interfaz de pruebas',()=>{
  const root=path.resolve(__dirname,'..');
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const html=read('index.html'),ui=read('src/oma/efdd-ui.js'),
    app=read('src/joint/joint-app.js'),worker=read('src/oma/efdd-worker.js');
  assert.match(html,/id="jointOmaDemo"/);
  assert.match(html,/id="jointOmaDemoInfo"/);
  assert.match(html,/id="jointOmaDemoCompare"/);
  assert.match(html,/src\/oma\/efdd-demo\.js\?/);
  assert.match(html,/src\/oma\/efdd-ui\.js\?/);
  assert.ok(html.indexOf('src/oma/efdd-demo.js?')<html.indexOf('src/oma/efdd-ui.js?'));
  assert.match(app,/demo:globalThis\.VWOMAOmaDemo/);
  assert.match(ui,/loadDemo\(\)/);
  assert.match(ui,/new Worker\('src\/oma\/efdd-worker\.js/);
  assert.match(ui,/mode\.shape/);
  assert.match(ui,/MAC respecto a la forma teórica/);
  assert.match(worker,/importScripts\('\.\.\/signal\/spectra\.js/);
  assert.match(worker,/efdd-core\.js/);
});
