'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createExports}=require('../src/joint/exports.js');
const finite=Number.isFinite,median=v=>{const a=v.filter(finite).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)/2)]:null;};
const x=createExports({s:{},finite,median,MAX_PEERS:8,toMaster:t=>t,
 validModel:()=>true,correctedVector:v=>v,localRecord:()=>null,
 document:{},Blob,URL,setTimeout});
test('rechaza una comparación sin ventana, plan o registros',()=>{
 assert.throws(()=>x.validComparisonExport(null),/ensayo conjunto válido/);
 assert.throws(()=>x.validComparisonExport({plan:{},windowMasterMs:{start:0,end:1},records:[]}),/número no válido/);
});
test('valida esquema y muestras recibidas para comparar',()=>{
 const data={plan:{points:[]},windowMasterMs:{start:0,end:100},records:[{device:{id:'a'},samples:[{raw:[0,1,2,3,4,5,6,7],masterTimeMs:5}]}]};
 assert.equal(x.validComparisonExport(data),data);
 assert.throws(()=>x.validComparisonExport({...data,records:[{device:{id:'a'},samples:[{raw:[0],masterTimeMs:5}]}]}),/muestras incompatibles/);
});
test('calcula el periodo mediano dentro de la ventana',()=>{
 const r={samples:[0,10,20,30,40].map(masterTimeMs=>({masterTimeMs}))};
 assert.equal(x.samplePeriodMs(r,0,40),10);
 assert.equal(x.samplePeriodMs({samples:[{masterTimeMs:0}]},0,10),null);
});
test('interpola en malla común sin extrapolar y mantiene huecos',()=>{
 const samples=[{masterTimeMs:0,v:0},{masterTimeMs:10,v:10},{masterTimeMs:30,v:30}];
 const points=x.resampleAxis(samples,s=>s.v,[0,5,10,20,30,40]);
 assert.deepEqual(points,[{x:0,y:0},{x:5,y:5},{x:10,y:10},{x:20,y:20}]);
});
test('el detrend de puntos elimina la pendiente sin modificar la entrada',()=>{
 const p=[{x:0,y:3},{x:1,y:5},{x:2,y:7},{x:3,y:9}];
 const result=x.detrendPoints(p);
 for(const item of result)assert.ok(Math.abs(item.y)<1e-10);
 assert.equal(p[0].y,3);
});
