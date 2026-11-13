'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createResultsView}=require('../src/joint/results-view.js');

function setup(role='host') {
  const nodes=new Map(),byId=id=>{
    if(!nodes.has(id))nodes.set(id,{
      innerHTML:'',textContent:'',hidden:false,disabled:false,
      querySelectorAll:()=>[],setAttribute(){},addEventListener(){}
    });
    return nodes.get(id);
  };
  const s={
    role,id:role==='host'?'master':'guest',peers:new Map(),
    results:new Map(),syncCharts:[],storageFailed:false,transfer:null,transferError:null,
    run:{
      state:'finished',finished:true,finishing:false,transferred:false,
      plan:{name:'Pasarela UPM',points:[{device:'master'},{device:'guest'}]},
      device:{id:role==='host'?'master':'guest',name:'Móvil de referencia'},
      samples:[],incidents:[],id:'run-1'
    }
  };
  s.results.set(s.id,{samples:[],incidents:[]});
  const api=createResultsView({
    s,$:byId,escape:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
    Chart:undefined,median:()=>0,finite:Number.isFinite,
    running:()=>false,syncMetric:()=>null,selectedForModel:()=>false,
    enableLegendToggling:()=>{},comparisonExport:()=>null,
    samplePeriodMs:()=>null,structuralValue:()=>null,
    resampleAxis:()=>[],detrendPoints:points=>points
  });
  return {s,api,byId};
}

test('el maestro muestra porcentaje mientras llegan bloques desde el participante',()=>{
  const x=setup();
  x.s.peers.set('guest',{id:'guest',name:'Android',incoming:{size:1000,length:430,next:3}});
  x.api.renderResults(false);
  assert.match(x.byId('jointResultsList').innerHTML,/Recibiendo registro: 43%/);
  assert.doesNotMatch(x.byId('jointResultsList').innerHTML,/Registro pendiente de recibir/);
});

test('el resultado muestra el número de muestras tras recibir íntegramente el registro',()=>{
  const x=setup();
  x.s.peers.set('guest',{id:'guest',name:'Android',incoming:null});
  x.s.results.set('guest',{samples:new Array(130).fill(null),incidents:[]});
  x.api.renderResults(false);
  assert.match(x.byId('jointResultsList').innerHTML,/130 muestras/);
  assert.doesNotMatch(x.byId('jointResultsList').innerHTML,/Recibiendo registro/);
});

test('fallo de envío se conserva como aviso visible y permite pulsar Enviar datos',()=>{
  const x=setup('guest');
  x.s.transferError='Sin confirmación del bloque.';
  x.api.renderResults(false);
  assert.match(x.byId('jointResultsList').innerHTML,/Sin confirmación del bloque/);
  assert.match(x.byId('jointResultsList').innerHTML,/volver a pulsar «Enviar datos»/);
  assert.equal(x.byId('jointSendData').disabled,false);
  assert.equal(x.byId('jointSendData').hidden,false);
});

test('el progreso no necesita reconstruir histogramas ni gráficos',()=>{
  const x=setup();
  x.s.peers.set('guest',{id:'guest',name:'Android',incoming:{size:100,length:1,next:1}});
  x.api.renderResults(false);
  assert.equal(x.s.syncCharts.length,0);
  assert.equal(x.byId('jointRttHistograms').innerHTML,'');
});
