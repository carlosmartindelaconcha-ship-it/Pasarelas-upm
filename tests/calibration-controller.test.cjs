'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createController}=require('../src/joint/calibration-controller.js');
const {createMath}=require('../src/joint/calibration-math.js');
const finite=Number.isFinite;
const median=v=>{const a=v.filter(finite).sort((x,y)=>x-y),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null};
function fixture(overrides={}) {
  const notices=[],sent=[],tabs=[],elements=new Map();let time=1000,rendered=0;
  const node=id=>{
    if(!elements.has(id))elements.set(id,{
      id,hidden:false,disabled:false,textContent:'',innerHTML:'',value:0,alt:'',
      attrs:{},classList:{add(){},remove(){},toggle(){}},
      getAttribute(key){return this.attrs[key]??null},
      setAttribute(key,value){this.attrs[key]=value},
      closest(){return {classList:{toggle(){}}}}
    });
    return elements.get(id);
  };
  const peer={id:'guest',name:'Android',channel:{readyState:'open'},
    status:{sensor:true,visible:true,calibrated:true},samples:[],
    startModel:{offset:12,rtt:4}};
  const s={id:'host',name:'Maestro',role:'host',sensor:true,sensorEnabled:true,
    peers:new Map([['guest',peer]]),syncModel:{offset:0,drift:0,reference:0},
    calibration:{map:{x:null,y:null,z:null},active:null,complete:false,
      manualChoosing:false,feedback:null},
    syncCalibration:{id:'sync1',phase:'idle',accepted:false,results:{},
      correctionMs:0,models:{},peerIds:['guest'],gesture:null}};
  const math=createMath({finite,median,sampleRate:()=>60});
  const controlledMath=overrides.math?{...math,...overrides.math}:math;
  const ctl=createController({
    s,$:node,escape:x=>String(x),now:()=>time,toMaster:(t,m)=>t-(m?.offset||0),
    finite,sampleRate:()=>60,tell:(...x)=>notices.push(x),
    renderDevices:()=>rendered++,tab:name=>tabs.push(name),
    requireHostEdit:()=>{},localStatus:()=>({sensor:true}),
    startSync:async()=>{},pause:async()=>{},clockFit:()=>null,
    send:(p,msg)=>sent.push([p.id,msg]),broadcast:msg=>sent.push(['all',msg]),
    uid:()=> 'sync1',structuredClone,setTimeout:()=>0,median,
    math:controlledMath
  });
  return {ctl,s,peer,node,notices,sent,tabs,getRendered:()=>rendered,setTime:t=>time=t};
}

test('calibración manual invierte cada eje sin permutar canales',()=>{
  const f=fixture();
  f.ctl.chooseManualCalibration();
  assert.equal(f.s.calibration.manualChoosing,true);
  f.ctl.setManualCalibration(-1);
  assert.equal(f.s.calibration.complete,true);
  assert.deepEqual(f.ctl.correctedVector([2,-3,4]),[-2,3,-4]);
  for(const axis of ['x','y','z'])assert.equal(f.s.calibration.map[axis].raw,{x:0,y:1,z:2}[axis]);
  assert.ok(f.getRendered()>0);
});

test('la calibración automática prepara tres segundos de reposo y seis de gesto',()=>{
  const f=fixture();
  f.ctl.startCalibration('x');
  assert.equal(f.s.calibration.active.start,4000);
  assert.equal(f.s.calibration.active.end,10000);
  assert.equal(f.s.calibration.active.axis,'x');
  assert.equal(f.s.calibration.active.samples.length,0);
  assert.ok(f.notices.some(x=>/Calibración X/.test(x[0])));
});

test('rechaza una ventana de calibración con pocas muestras',()=>{
  const f=fixture();
  f.s.calibration.active={axis:'x',baseline:Array.from({length:30},()=>[0,0,0]),
    samples:Array.from({length:10},()=>[0,0,0])};
  f.ctl.finishCalibration();
  assert.equal(f.s.calibration.active,null);
  assert.equal(f.s.calibration.map.x,null);
  assert.match(f.s.calibration.feedback,/solo llegaron 10 muestras/);
});

test('identifica el signo positivo del primer lóbulo de ida y vuelta',()=>{
  const f=fixture();
  const samples=Array.from({length:360},(_,i)=>{
    let v=0;
    if(i>=60&&i<115)v=3;
    else if(i>=132&&i<190)v=-3;
    else if(i>=211&&i<268)v=3;
    return [v,0,0];
  });
  f.s.calibration.active={axis:'x',baseline:Array.from({length:40},()=>[0,0,0]),samples};
  f.ctl.finishCalibration();
  assert.ok(f.s.calibration.map.x,f.s.calibration.feedback);
  assert.equal(f.s.calibration.map.x.sign,1);
  assert.equal(f.s.calibration.map.x.raw,0);
  assert.equal(f.s.calibration.map.x.pattern,'ida-vuelta');
});

test('preparar gesto conserva el modelo de reloj por copia',()=>{
  const f=fixture();
  const m={offset:11,drift:.0001,reference:500,count:10};
  f.ctl.armSyncGesture({id:'sync1',axis:'x',start:4000,end:10000},m);
  assert.equal(f.s.syncCalibration.phase,'gesture');
  assert.equal(f.s.syncCalibration.gesture.axis,'x');
  assert.deepEqual(f.s.syncCalibration.gesture.model,m);
  assert.notEqual(f.s.syncCalibration.gesture.model,m);
  assert.ok(f.tabs.includes('Sync'));
});

test('ventana de un participante ausente permite repetir solo el eje',()=>{
  const f=fixture();
  f.s.syncCalibration.phase='gesture';
  f.s.syncCalibration.gesture={id:'sync1',axis:'x',start:4000,end:10000,
    model:{offset:0},samples:[[4000,1,0,0]]};
  f.ctl.finalizeSyncGesture('sync1','x');
  assert.equal(f.s.syncCalibration.phase,'gesture-ready');
  assert.equal(f.s.syncCalibration.gesture,null);
  assert.ok(f.notices.some(x=>/No llegó la ventana/.test(x[0])));
});

test('valida correcciones X/Y/Z coherentes y las comunica a participantes',()=>{
  const lag={x:19,y:20,z:21};
  const f=fixture({math:{estimateGestureAxis:(a,b,axis)=>({axis,lag:lag[axis],correlation:.96})}});
  f.s.syncCalibration.phase='gesture';
  f.s.syncCalibration.gesture={id:'sync1',axis:'z',start:4000,end:10000,
    samples:[[4000,1,0,0]]};
  f.s.syncCalibration.results={
    host:{axes:{x:{axis:'x',lag:0,correlation:1},y:{axis:'y',lag:0,correlation:1}}},
    guest:{axes:{x:{axis:'x',lag:19,correlation:.96},y:{axis:'y',lag:20,correlation:.96}},
      windows:{z:[[4000,1,0,0]]},calibration:{map:{}}}
  };
  f.ctl.finalizeSyncGesture('sync1','z');
  assert.equal(f.s.syncCalibration.phase,'accepted');
  assert.equal(f.s.syncCalibration.accepted,true);
  assert.equal(f.s.syncCalibration.results.guest.correctionMs,20);
  const sent=f.sent.find(x=>x[1].type==='SYNC_GESTURE_APPLY');
  assert.ok(sent);
  assert.equal(sent[1].correctionMs,20);
});

test('si un eje contradice a los demás, se repite el discrepante',()=>{
  const lag={x:0,y:2,z:25};
  const f=fixture({math:{estimateGestureAxis:(a,b,axis)=>({axis,lag:lag[axis],correlation:.95})}});
  f.s.syncCalibration.phase='gesture';
  f.s.syncCalibration.gesture={id:'sync1',axis:'z',start:4000,end:10000,
    samples:[[4000,1,0,0]]};
  f.s.syncCalibration.results={
    host:{axes:{x:{axis:'x',lag:0,correlation:1},y:{axis:'y',lag:0,correlation:1}}},
    guest:{axes:{x:{axis:'x',lag:0,correlation:.95},y:{axis:'y',lag:2,correlation:.95}},
      windows:{z:[[4000,1,0,0]]},calibration:{map:{}}}
  };
  f.ctl.finalizeSyncGesture('sync1','z');
  assert.equal(f.s.syncCalibration.phase,'gesture-ready');
  assert.equal(f.s.syncCalibration.accepted,false);
  assert.equal(f.s.syncCalibration.results.guest.axes.z,undefined);
  assert.ok(f.notices.some(x=>/Repite solo ese eje/.test(x[0])));
});

test('API controlador disponible en scripts clásicos de Safari/Chrome',()=>{
  const context={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/joint/calibration-controller.js'),'utf8'),context);
  assert.equal(typeof context.VWOMACalibration.createController,'function');
});
