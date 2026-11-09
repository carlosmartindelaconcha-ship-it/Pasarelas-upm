'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleSource = fs.readFileSync(path.join(__dirname,'../src/joint/plan-controller.js'),'utf8');

function fixture(role='host') {
  const elements = new Map(), broadcasts = [], notices = [], storage = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, {
      value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,
      dataset:{},style:{},querySelector:()=>null,querySelectorAll:()=>[]
    });
    return elements.get(id);
  };
  const hostState = {
    id:'host',name:'Maestro',role,peers:new Map(),
    plan:{length:24,width:4,name:'Pasarela',points:[]},
    selected:null,transaction:null,planView:null,planPan:null,planPinch:null
  };
  const sandbox = {
    localStorage:{setItem:(key,value)=>storage.set(key,value)},
    CSS:{escape:value=>String(value)},
    requestAnimationFrame:callback=>callback(),
    setTimeout:callback=>callback(),
    DOMPoint:class{}
  };
  vm.runInNewContext(moduleSource,sandbox);
  const api=sandbox.VWOMAPlan.createController({
    s:hostState,finite:Number.isFinite,MAX_POINTS:64,running:()=>false,
    $:byId,escape:value=>String(value).replace(/[&<>"']/g, c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c])),
    tell:(...args)=>notices.push(args),
    broadcast:message=>broadcasts.push(message),
    requireHostEdit:()=>{
      if(hostState.role!=='host')throw Error('El plano lo edita el maestro.');
    },
    renderDevices:()=>{}
  });
  return {api,s:hostState,elements,byId,broadcasts,notices,storage};
}

test('valida un plano y conserva únicamente los campos autorizados',()=>{
  const {api}=fixture();
  const got=api.checkPlan({length:24,width:4,name:'Pasarela',
    points:[{id:'P1',x:12,y:2,name:'Centro',axis:'z',angle:0,device:null,extra:'inseguro'}],
    extra:'fuera'});
  assert.equal(got.points.length,1);
  assert.equal(got.points[0].id,'P1');
  assert.equal(got.points[0].extra,undefined);
  assert.equal(got.extra,undefined);
  assert.equal(got.length,24);
});

test('rechaza puntos repetidos, coordenadas no válidas y sensores duplicados',()=>{
  const {api}=fixture();
  const base={length:24,width:4,name:'Ensayo'};
  const point=(id,device)=>({id,name:id,x:2,y:1,axis:'z',angle:0,device});
  assert.throws(()=>api.checkPlan({...base,points:[point('P1','phone'),point('P2','phone')]}),/dos puntos/);
  assert.throws(()=>api.checkPlan({...base,points:[point('P1',null),point('P1',null)]}),/no válid/);
  assert.throws(()=>api.checkPlan({...base,points:[{...point('P1',null),x:25}]}),/no válid/);
  assert.throws(()=>api.checkPlan({...base,points:[{...point('P1',null),axis:'w'}]}),/no válid/);
  assert.throws(()=>api.checkPlan({...base,width:0,points:[]}),/no válido/);
  assert.throws(()=>api.checkPlan({...base,points:Array.from({length:65},(_,i)=>point('P'+i,null))}),/no válido/);
});

test('geometría del visor conserva la escala uniforme y limita el zoom',()=>{
  const {api}=fixture();
  const initial=api.planViewport();
  assert.equal(initial.x,0);
  assert.equal(initial.y,0);
  assert.equal(initial.w,24);
  assert.equal(initial.h,4);
  const zoom=api.planViewport({x:22,y:3,w:4,h:2});
  assert.ok(zoom.w<=24 && zoom.h<=4);
  assert.ok(zoom.x>=0 && zoom.x+zoom.w<=24.0000001);
  assert.ok(zoom.y>=0 && zoom.y+zoom.h<=4.0000001);
  const geometry=api.geometry(initial);
  assert.ok(geometry.scale>0);
  assert.equal(api.planPointScale(initial),1);
  assert.deepEqual(JSON.parse(JSON.stringify(api.snapPlanPosition({x:30.1,y:-2}))),{x:24,y:0});
});

test('el punto nuevo se coloca en centro, luego X=L/4 y edición respeta 3 decimales',()=>{
  const {api,s,storage,broadcasts,byId}=fixture();
  api.addPoint();
  assert.equal(s.plan.points[0].id,'P1');
  assert.equal(s.plan.points[0].x,12);
  assert.equal(s.plan.points[0].y,2);
  api.addPoint();
  assert.equal(s.plan.points[1].x,6);
  assert.equal(s.plan.points[1].y,0);
  api.updatePlanPoint('P1','x','8.12346');
  assert.equal(s.plan.points[0].x,8.123);
  api.updatePlanPoint('P1','device','sensor-one');
  assert.equal(api.pointFor('sensor-one').id,'P1');
  assert.throws(()=>api.updatePlanPoint('P2','device','sensor-one'),/asignado/);
  assert.equal(s.plan.points[1].device,null);
  assert.equal(broadcasts.at(-1).type,'PLAN');
  const saved=JSON.parse(storage.get('upm-joint-plan-v1'));
  assert.equal(saved.points[0].device,null);
  assert.match(byId('jointPointsTable').innerHTML,/data-point-id="P1"/);
  assert.match(byId('jointPlan').innerHTML,/joint-phone-marker/);
});

test('borrar un punto sin animación conserva los demás y actualiza selección',()=>{
  const {api,s,storage,byId}=fixture();
  api.addPoint();
  api.addPoint();
  assert.equal(s.selected,'P2');
  api.deletePlanPoint('P2',false);
  assert.deepEqual(s.plan.points.map(p=>p.id),['P1']);
  assert.equal(s.selected,'P1');
  assert.equal(JSON.parse(storage.get('upm-joint-plan-v1')).points.length,1);
  assert.doesNotMatch(byId('jointPointsTable').innerHTML,/data-point-id="P2"/);
});

test('el visitante no puede editar el plano',()=>{
  const {api}=fixture('guest');
  assert.throws(()=>api.addPoint(),/maestro/);
  assert.throws(()=>api.deletePlanPoint('P1',false),/maestro/);
});
