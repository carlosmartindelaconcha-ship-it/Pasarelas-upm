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

test('el maestro recibe un diagnóstico específico sin ofrecer el botón del participante',()=>{
  const x=setup('host');
  x.s.transferError='Registro incompatible: identificador del móvil distinto del emparejado.';
  x.api.renderResults(false);
  assert.match(x.byId('jointResultsList').innerHTML,/Registro rechazado/);
  assert.match(x.byId('jointResultsList').innerHTML,/identificador del móvil distinto/);
  assert.doesNotMatch(x.byId('jointResultsList').innerHTML,/Puedes volver a pulsar «Enviar datos»/);
});


test('cambiar de pestaña conserva gráficos de comparación y no reprocesa muestras',()=>{
  const nodes=new Map(),newCharts=[];
  class MockChart {
    constructor(ctx,config){
      this.canvas=ctx.canvas;
      this.options=config.options;
      this.destroyed=false;
      this.resized=0;
      newCharts.push(this);
    }
    destroy(){this.destroyed=true;}
    resize(){this.resized++;}
  }
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{id,textContent:'',value:'raw',
      getContext(){return {canvas:this}},
      querySelectorAll:()=>[],addEventListener(){}});
    return nodes.get(id);
  };
  let compute=0;
  const s={
    run:{finished:true,id:'run-1'},compareCharts:[],results:new Map(),peers:new Map(),jointCharts:{time:null,spectrum:null}
  };
  const record={device:{id:'dev-1',name:'Android'},samples:[
    {masterTimeMs:1000,raw:[1,2,3]}, {masterTimeMs:2000,raw:[3,4,5]}
  ]};
  const api=createResultsView({s,$:get,escape:String,Chart:MockChart,median:()=>1,finite:Number.isFinite,
    running:()=>false,syncMetric:()=>0,selectedForModel:()=>false,enableLegendToggling:()=>{},
    comparisonExport:()=>{compute++;return {plan:{points:[]},windowMasterMs:{start:1000,end:2000},records:[record]};},
    samplePeriodMs:()=>100,structuralValue:(raw,_record,axis)=>raw[axis],
    resampleAxis:()=>[],detrendPoints:v=>v});
  api.renderComparison();
  assert.equal(newCharts.length,3);
  assert.equal(compute,1);
  assert.equal(s.compareCharts[0].options.scales.y.min, -s.compareCharts[0].options.scales.y.max);
  assert.equal(s.compareCharts[0].options.scales.x.min,0);
  assert.equal(s.compareCharts[0].options.scales.x.max,1);
  api.renderComparison();
  assert.equal(compute,1);
  assert.equal(newCharts.length,3);
  assert.equal(newCharts[0].resized,1);
  get('jointCompareView').value='common';
  api.renderComparison();
  assert.equal(compute,2);
  assert.equal(newCharts.length,6);
  assert.equal(newCharts[0].destroyed,true);
});

test('Comparar muestra solo las tres curvas XYZ del maestro cuando no hay participantes',()=>{
  const nodes=new Map(),charts=[];
  class ChartMock {
    constructor(ctx,config){this.canvas=ctx.canvas;this.options=config.options;this.data=config.data;charts.push(this);}
    destroy(){}
  }
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,hidden:false,textContent:'',value:'raw',
      getContext(){return {canvas:this}},querySelectorAll:()=>[],addEventListener(){}
    });
    return nodes.get(id);
  };
  const record={device:{id:'master',name:'Maestro'},samples:[
    {masterTimeMs:1000,raw:[1,2,9.8]},
    {masterTimeMs:1100,raw:[1.5,2.5,10]},
    {masterTimeMs:1200,raw:[2,3,9.7]}
  ]};
  const s={id:'master',role:'host',run:{id:'solo-1',finished:true},
    peers:new Map(),results:new Map([['master',record]]),
    compareCharts:[],compareExport:null};
  const controller=createResultsView({
    s,$:element,escape:String,Chart:ChartMock,finite:Number.isFinite,median:()=>100,
    running:()=>false,syncMetric:()=>0,selectedForModel:()=>false,
    enableLegendToggling:()=>{},
    comparisonExport:()=>({plan:{points:[{device:'master',name:'P1',x:0,y:0}]},
      windowMasterMs:{start:1000,end:1200},records:[record]}),
    samplePeriodMs:()=>100,structuralValue:(raw,r,axis)=>raw[axis],
    resampleAxis:()=>[],detrendPoints:v=>v
  });
  controller.renderComparison();
  assert.equal(charts.length,3);
  assert.equal(s.compareCharts.length,3);
  assert.deepEqual(charts.map(c=>c.data.datasets.length),[1,1,1]);
  assert.match(element('jointCompareTitle').textContent,/Señales de Maestro/);
  assert.match(element('jointCompareStatus').textContent,/Un solo acelerómetro/);
  assert.ok(charts.every(c=>c.data.datasets[0].label.includes('Maestro')));
  assert.ok(charts.every(c=>c.data.datasets[0].data.length>0));
  assert.equal(s.results.size,1);
  // El JSON importado con un único acelerómetro también se presenta en singular.
  s.compareExport={some:true};
  s.run=null;
  controller.renderComparison();
  assert.equal(charts.length,6);
  assert.match(element('jointCompareStatus').textContent,/Un solo acelerómetro/);
});


test('Comparar aplica detrend de orden 0 por eje y por móvil, en bruto y rejilla común',()=>{
  for(const view of ['raw','common']) {
    const nodes=new Map(),charts=[];
    class ChartMock {
      constructor(ctx,options){this.canvas=ctx.canvas;this.data=options.data;this.options=options.options;charts.push(this);}
      destroy(){}
    }
    const el=id=>{
      if(!nodes.has(id))nodes.set(id,{
        id,hidden:false,textContent:'',value:id==='jointCompareView'?view:'',
        getContext(){return {canvas:this}},querySelectorAll:()=>[],addEventListener(){}
      });
      return nodes.get(id);
    };
    const records=[0,1].map((deviceIndex)=>({
      device:{id:deviceIndex?'guest':'host',name:deviceIndex?'Android':'Maestro'},
      samples:Array.from({length:5},(_,i)=>({
        masterTimeMs:1000+i*100,
        raw:[i,0,0,10+deviceIndex*100+i,20+deviceIndex*100+i*2,9.8+deviceIndex*10+i*.25]
      }))
    }));
    const originals=JSON.stringify(records);
    const s={id:'host',role:'host',run:{id:'run-1',finished:true},
      peers:new Map(),results:new Map(records.map(r=>[r.device.id,r])),
      compareCharts:[],compareExport:null};
    const controller=createResultsView({
      s,$:el,escape:String,Chart:ChartMock,finite:Number.isFinite,median:()=>100,
      running:()=>false,syncMetric:()=>null,selectedForModel:()=>false,enableLegendToggling:()=>{},
      comparisonExport:()=>({
        plan:{points:[{device:'host',name:'P1',x:0},{device:'guest',name:'P2',x:10}]},
        windowMasterMs:{start:1000,end:1400},records
      }),
      samplePeriodMs:()=>100,
      structuralValue:(raw,_record,axis)=>raw[3+axis],
      resampleAxis:(samples,getValue,grid)=>grid.flatMap(t=>{
        const sample=samples.find(s=>s.masterTimeMs===t);
        return sample?[{x:t,y:getValue(sample)}]:[];
      }),
      detrendPoints:()=>{throw Error('Comparar no debe aplicar detrend lineal');}
    });
    controller.renderComparison();
    assert.equal(charts.length,3);
    for(const [axis,chart] of charts.entries()){
      assert.equal(chart.data.datasets.length,2);
      assert.match(chart.options.scales.y.title.text,/sin continua/);
      for(const [deviceIndex,dataset] of chart.data.datasets.entries()){
        const values=dataset.data.map(p=>p.y);
        assert.equal(values.length,5);
        const mean=values.reduce((a,b)=>a+b,0)/values.length;
        assert.ok(Math.abs(mean)<1e-10,
          view+' axis '+axis+' device '+deviceIndex+' mean='+mean);
        // An order-0 detrend must not remove an existing physical trend.
        const expectedSlope=[1,2,.25][axis];
        assert.ok(Math.abs(values[1]-values[0]-expectedSlope)<1e-10);
      }
    }
    assert.equal(JSON.stringify(records),originals,'las muestras originales no se alteran');
    assert.match(el('jointCompareStatus').textContent,/detrend de orden 0 por móvil/);
  }
});
