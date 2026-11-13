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
  const notices=[],sent=[],tabs=[],elements=new Map(),timers=[];let time=1000,rendered=0;
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
    uid:()=> 'sync1',structuredClone,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},median,
    math:controlledMath
  });
  return {ctl,s,peer,node,notices,sent,tabs,getRendered:()=>rendered,setTime:t=>time=t,
    runTimer:delay=>{
      const index=timers.findIndex(t=>t.delay===delay);
      assert.ok(index>=0,'temporizador esperado: '+delay);
      const [timer]=timers.splice(index,1);
      timer.fn();
    }
  };
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

test('los botones XYZ no se habilitan hasta terminar el mensaje y el ejemplo X',()=>{
  const f=fixture();
  f.ctl.showCalibration();
  for(const axis of ['X','Y','Z'])assert.equal(f.node('jointCalibrate'+axis).disabled,true);
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  assert.throws(()=>f.ctl.startCalibration('x'),/Pulsa primero/);
  f.ctl.beginCalibrationGuide();
  assert.equal(f.s.calibration.guidePhase,'message');
  assert.equal(f.node('jointCalibrationExample').hidden,false);
  assert.equal(f.node('jointBeginCalibration').hidden,true);
  for(const axis of ['X','Y','Z'])assert.equal(f.node('jointCalibrate'+axis).disabled,true);
  f.runTimer(5000);
  assert.equal(f.s.calibration.guidePhase,'observe');
  assert.equal(f.node('jointCalibrationExample').hidden,false);
  assert.equal(f.node('jointCalibrationExample').textContent,'OBSERVA');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  for(const axis of ['X','Y','Z'])assert.equal(f.node('jointCalibrate'+axis).disabled,true);
  f.runTimer(1100);
  assert.equal(f.s.calibration.guidePhase,'demo');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-eje-x-un-ciclo.svg?v=20261113-speed2');
  assert.equal(f.node('jointCalibrationExample').hidden,true);
  assert.equal(f.node('jointCalibrateX').disabled,true);
  f.runTimer(2800);
  assert.equal(f.s.calibration.guidePhase,'ready');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  for(const axis of ['X','Y','Z'])assert.equal(f.node('jointCalibrate'+axis).disabled,false);
});

test('cada gesto dispone de 3 s quieto y 3,6 s de captura, un solo ciclo por eje',()=>{
  const f=fixture();
  f.s.calibration.guidePhase='ready';
  f.ctl.startCalibration('y');
  const active=f.s.calibration.active;
  assert.equal(active.start,4000);
  assert.equal(active.end,7600);
  assert.equal(active.axis,'y');
  assert.equal(active.samples.length,0);
  assert.equal(f.node('jointCalibrateX').disabled,true);
  assert.equal(f.node('jointCalibrateY').disabled,true);
  f.setTime(1000);f.ctl.renderCalibrationCountdown();
  assert.match(f.node('jointCalibrationCountdown').textContent,/QUIETO · 3/);
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  f.setTime(3001);f.ctl.renderCalibrationCountdown();
  assert.match(f.node('jointCalibrationCountdown').textContent,/QUIETO · 1/);
  f.setTime(4000);f.ctl.renderCalibrationCountdown();
  assert.equal(f.node('jointCalibrationCountdown').textContent,'¡AHORA!');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-eje-y-un-ciclo.svg?v=20261113-speed2');
  f.setTime(7000);f.ctl.renderCalibrationCountdown();
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  assert.equal(f.node('jointCalibrationCountdown').hidden,true);
  assert.ok(f.notices.some(x=>/quieto 3, 2, 1/.test(x[0])));
});

test('salir de la sesión durante el ejemplo no habilita los gestos con temporizadores atrasados',()=>{
  const f=fixture();
  const previous=f.s.calibration;
  f.ctl.beginCalibrationGuide();
  f.s.calibration={map:{},active:null,complete:false,guidePhase:'idle'};
  f.runTimer(5000);
  assert.equal(previous.guidePhase,'message');
  assert.equal(f.s.calibration.guidePhase,'idle');
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

test('un único acelerómetro no requiere sincronización física entre relojes',()=>{
  const f=fixture();
  f.s.peers.clear();
  f.s.calibration.complete=true;
  f.s.syncCalibration.accepted=false;
  f.ctl.renderSyncCalibration();
  assert.equal(f.node('jointSyncStart').hidden,true);
  assert.match(f.node('jointSyncState').textContent,/No necesaria/);
  assert.match(f.node('jointSyncHelp').textContent,/Puedes pasar a Medir/);
  assert.match(f.node('jointSyncSummary').innerHTML,/únicamente el maestro/);
  assert.equal(f.s.syncCalibration.accepted,false);
});

test('el ciclo SVG conserva los tres segundos completos si la pantalla se actualiza con retraso',()=>{
  const f=fixture();
  f.s.calibration.guidePhase='ready';
  f.ctl.startCalibration('z');
  f.setTime(4270);f.ctl.renderCalibrationCountdown();
  assert.equal(f.s.calibration.active.svgStartedAt,4270);
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-eje-z-un-ciclo.svg?v=20261113-speed2');
  f.setTime(7000);f.ctl.renderCalibrationCountdown();
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-eje-z-un-ciclo.svg?v=20261113-speed2');
  f.setTime(7080);f.ctl.renderCalibrationCountdown();
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
});

test('la calibración manual cancela la demostración pendiente',()=>{
  const f=fixture();
  f.ctl.beginCalibrationGuide();
  f.ctl.chooseManualCalibration();
  f.ctl.setManualCalibration(1);
  assert.equal(f.s.calibration.complete,true);
  f.runTimer(5000);
  assert.equal(f.s.calibration.guidePhase,'ready');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
});

test('el aviso de lectura y OBSERVA mantienen el SVG en reposo hasta la demostración',()=>{
  const f=fixture();
  f.ctl.beginCalibrationGuide();
  assert.equal(f.s.calibration.guidePhase,'message');
  assert.equal(f.node('jointCalibrationExample').textContent,
    'EJEMPLO: haz un SOLO movimiento de ida y vuelta con el móvil en CADA EJE.');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  f.runTimer(5000);
  assert.equal(f.s.calibration.guidePhase,'observe');
  assert.equal(f.node('jointCalibrationExample').textContent,'OBSERVA');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  f.runTimer(1100);
  assert.equal(f.s.calibration.guidePhase,'demo');
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-eje-x-un-ciclo.svg?v=20261113-speed2');
  f.runTimer(2800);
  assert.equal(f.node('jointCalibrationImage').getAttribute('src'),
    'assets/calibration/telefono-ejes-reposo.svg');
  assert.equal(f.s.calibration.guidePhase,'ready');
});
