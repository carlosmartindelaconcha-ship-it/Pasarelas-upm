'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createAcquisition}=require('../src/joint/acquisition.js');

function fixture({role='host',responses='success',duration=5,MAX_SAMPLES=12}={}) {
  let clock=100000;
  const sent=[],events=[],alerts=[],issues=[],stored=[],periodic=new Map();
  let timerId=0;
  const peer={id:'mobile-2',name:'Android',channel:{readyState:'open'},
    lastSeen:clock,status:{sensor:true,visible:true,calibrated:true},
    model:{offset:3,drift:0,reference:0}};
  const plan={name:'Pasarela',length:20,width:4,points:[
    {id:'P1',name:'Centro',device:'host',x:10,y:2},
    {id:'P2',name:'Cuarto',device:'mobile-2',x:5,y:2}
  ]};
  const state={id:'host',name:'iPhone',role,session:'sess',peers:new Map([[peer.id,peer]]),
    run:null,transaction:null,results:new Map(),compareExport:null,storageFailed:false,
    plan,recent:[],syncLog:[],calibration:{complete:true,map:[0,1,2]},
    syncCalibration:{accepted:true,correctionMs:0},syncModel:{offset:7,drift:0,reference:0,count:12},
    wake:null,duringSyncTimer:null,jointCharts:{time:null,spectrum:null}};
  const now=()=>clock;
  const periodicSync=[];
  let persistCount=0,closeCount=0,sendCount=0;
  const ui={};
  for(const name of ['enterRecording','runArmed','preparing','preparationInterrupted',
     'refresh','exitRecording','closing','finished'])ui[name]=()=>events.push(name);
  const broadcast=m=>{
    sent.push(m);
    if(m.type==='PREPARE'&&responses!=='no-ready')state.transaction.ready.set(peer.id,{ok:responses!=='rejected',reason:'No preparado'});
    if(m.type==='START_AT'&&responses==='success')state.transaction.acks.add(peer.id);
  };
  const controller=createAcquisition({
    s:state,MAX_SAMPLES,now,running:()=>!!state.run&&
      ['armed','recording'].includes(state.run.state),
    incident:(type,detail)=>issues.push({type,detail}),
    toMaster:(t,m)=>t-(m?.offset||0),
    syncOnce:(p,phase,id)=>periodicSync.push([p.id,phase,id]),
    navigator:{wakeLock:{request:async()=>({release:async()=>{events.push('wake-released');}})}},
    setInterval:(cb,ms)=>{assert.equal(ms,100);const id=++timerId;periodic.set(id,cb);return id;},
    clearInterval:id=>periodic.delete(id),
    requireHostEdit:()=>{if(state.role!=='host')throw Error('Solo el maestro');},
    localStatus:()=>({sensor:true}),
    pageHidden:()=>false,readDuration:()=>duration,
    pointFor:(id=state.id)=>state.plan.points.find(p=>p.device===id)||null,
    tell:(message,bad)=>alerts.push({message,bad}),
    pause:async ms=>{clock+=ms;},
    finite:Number.isFinite,uid:()=> 'run-42',
    broadcast,send:m=>{sent.push({type:'SENT',to:m?.id});},
    correctedVector:v=>v,
    persist:()=>{persistCount++;return Promise.resolve();},
    persistBeforeClosing:async()=>{closeCount++;},
    sendRecord:async()=>{sendCount++;},
    localRecord:()=>({id:state.run.id,device:state.run.device,samples:[...state.run.samples]}),
    structuredClone,ui
  });
  return{state,peer,controller,events,sent,alerts,issues,stored,periodic,
    periodicSync,now,advance:ms=>{clock+=ms;},
    persistCalls:()=>persistCount,closeCalls:()=>closeCount,sendCalls:()=>sendCount};
}

test('muestras: numeración correlativa, límites y aviso único de capacidad',()=>{
  const f=fixture({MAX_SAMPLES:2});
  const run={samples:[],end:150000,initialClock:{offset:0}};
  f.controller.appendSample(run,[99,1,2,3,4,5]);
  f.controller.appendSample(run,[99,6,7,8,9,10]);
  assert.deepEqual(run.samples.map(row=>row[0]),[0,1]);
  f.controller.appendSample(run,[99,11,12,13,14,15]);
  f.controller.appendSample(run,[99,16,17,18,19,20]);
  assert.equal(run.samples.length,2);
  assert.equal(run.end,f.now());
  assert.equal(f.issues.filter(x=>x.type==='limit').length,1);
});

test('beginRun conserva reloj inicial, plan, esquema y muestras del margen',()=>{
  const f=fixture();
  f.state.recent=[
    [0,99000,99900,1,2,3,20,103500,103500],
    [1,99500,99950,4,5,6,20,105000,105000]
  ];
  f.controller.beginRun('run-42',104000,109000,5);
  const r=f.state.run;
  assert.equal(r.id,'run-42');
  assert.equal(r.state,'armed');
  assert.equal(r.start,104000);
  assert.equal(r.end,109000);
  assert.equal(r.device.id,'host');
  assert.equal(r.initialClock.offset,0);
  assert.equal(r.previewBaseline[0],2.5);
  assert.deepEqual(r.samples.map(row=>row[0]),[0,1]);
  assert.notEqual(r.plan,f.state.plan);
  assert.ok(f.events.includes('enterRecording'));
  assert.ok(f.events.includes('runArmed'));
  assert.equal(f.persistCalls(),1);
  assert.equal(f.periodic.size,1);
});

test('maestro espera READY y START_ACK antes de confirmar el ensayo',async()=>{
  const f=fixture();
  await f.controller.startRun();
  assert.equal(f.state.run.id,'run-42');
  assert.equal(f.state.run.start,104000);
  assert.equal(f.state.run.end,109000);
  assert.equal(f.state.transaction,null);
  assert.deepEqual(f.sent.map(m=>m.type),['PREPARE','START_AT']);
  assert.ok(f.events.includes('preparing'));
  assert.ok(f.events.includes('refresh'));
  assert.ok(f.alerts.some(a=>/Todos han confirmado/.test(a.message)));
});

test('sin participantes, el maestro inicia el ensayo y conserva el plano histórico',async()=>{
  const f=fixture();
  f.state.peers.clear();
  f.state.syncCalibration.accepted=false; // no hay otro reloj que sincronizar
  const originalPlan=structuredClone(f.state.plan);
  await f.controller.startRun();
  assert.equal(f.state.run.id,'run-42');
  assert.equal(f.state.run.start,104000);
  assert.equal(f.state.run.state,'armed');
  assert.equal(f.state.run.plan.points[0].device,'host');
  assert.equal(f.state.run.plan.points[1].device,null);
  assert.deepEqual(f.state.plan,originalPlan,'no se altera la asignación guardada');
  assert.deepEqual(f.state.run.syncModels,{});
  assert.equal(f.state.run.synchronizationCalibration.phase,'not-required');
  assert.equal(f.state.run.device.id,'host');
  assert.equal(f.state.transaction,null);
  assert.deepEqual(f.sent,[],'sin mensajes WebRTC de preparación ni de inicio');
  assert.equal(f.periodic.size,0,'sin sondeos de reloj para un único móvil');
  assert.ok(f.events.includes('enterRecording'));
  assert.ok(f.events.includes('runArmed'));
  f.controller.appendSample(f.state.run,[0,104000,104000,0.1,0.2,9.7,16,104001,104001]);
  await f.controller.finishRun();
  assert.equal(f.state.run.finished,true);
  assert.equal(f.state.results.size,1);
  assert.equal(f.state.results.get('host').samples.length,1);
  assert.equal(f.closeCalls(),1);
});

test('un participante desconectado no impide el ensayo solo del maestro',async()=>{
  const f=fixture();
  f.peer.channel.readyState='closed';
  f.state.syncCalibration.accepted=false;
  await f.controller.startRun();
  assert.equal(f.state.run.plan.points[1].device,null);
  assert.equal(f.state.plan.points[1].device,'mobile-2');
  f.controller.stopRun('cancelar');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.state.run.state,'cancelled');
  assert.ok(!f.sent.some(message=>message.type==='ABORT'||message.type==='STOP_AT'));
});

test('un ensayo solo todavía exige calibración local y punto del maestro',async()=>{
  const f=fixture();f.state.peers.clear();
  f.state.calibration.complete=false;
  await assert.rejects(f.controller.startRun(),/calibración X, Y y Z/);
  f.state.calibration.complete=true;
  f.state.plan.points[0].device=null;
  await assert.rejects(f.controller.startRun(),/Asigna el maestro a un punto/);
  assert.equal(f.state.run,null);
});

test('con participantes conectados sigue siendo obligatoria la sincronización física',async()=>{
  const f=fixture();
  f.state.syncCalibration.accepted=false;
  await assert.rejects(f.controller.startRun(),/Calibrar y sincronizar/);
  assert.equal(f.state.run,null);
});

test('no inicia con duración inválida o calibración pendiente',async()=>{
  const invalid=fixture({duration:4.5});
  await assert.rejects(invalid.controller.startRun(),/duración entera/);
  assert.equal(invalid.state.run,null);
  const calibration=fixture();
  calibration.state.syncCalibration.accepted=false;
  await assert.rejects(calibration.controller.startRun(),/Calibrar y sincronizar/);
});

test('no recibir READY aborta sin crear registro ni dejar transacciones colgadas',async()=>{
  const f=fixture({responses:'no-ready'});
  await assert.rejects(f.controller.startRun(),/no respondió/);
  assert.equal(f.state.run,null);
  assert.equal(f.state.transaction,null);
  assert.deepEqual(f.sent.map(m=>m.type),['PREPARE','ABORT']);
  assert.ok(f.events.includes('preparationInterrupted'));
  assert.equal(f.closeCalls(),0);
});

test('READY rechazado aborta antes de registrar aceleraciones',async()=>{
  const f=fixture({responses:'rejected'});
  await assert.rejects(f.controller.startRun(),/No preparado/);
  assert.equal(f.state.run,null);
  assert.equal(f.state.transaction,null);
  assert.deepEqual(f.sent.map(m=>m.type),['PREPARE','ABORT']);
});

test('sin START_ACK cancela y finaliza con persistencia sin bloquear el estado',async()=>{
  const f=fixture({responses:'no-ack'});
  await assert.rejects(f.controller.startRun(),/Falta confirmación del inicio/);
  assert.deepEqual(f.sent.map(m=>m.type),['PREPARE','START_AT','ABORT']);
  assert.equal(f.state.transaction,null);
  assert.equal(f.state.run.state,'cancelled');
  assert.equal(f.state.run.finished,true);
  assert.equal(f.closeCalls(),1);
  assert.equal(f.state.results.size,1);
  assert.ok(f.events.includes('exitRecording'));
});

test('finalización correcta conserva el registro y no lo duplica',async()=>{
  const f=fixture();
  f.controller.beginRun('run-42',104000,109000,5);
  await Promise.all([f.controller.finishRun(),f.controller.finishRun()]);
  assert.equal(f.state.run.state,'finished');
  assert.equal(f.state.run.finished,true);
  assert.equal(f.closeCalls(),1);
  assert.equal(f.state.results.get('host').id,'run-42');
  assert.equal(f.periodic.size,0);
  assert.ok(f.events.indexOf('exitRecording')<f.events.indexOf('finished'));
});

test('parada del maestro acorta fin y difunde STOP_AT',()=>{
  const f=fixture();
  f.controller.beginRun('run-42',104000,109000,5);
  f.state.run.state='recording'; // La orden STOP_AT solo se emite tras comenzar a registrar.
  f.advance(5200);
  f.controller.stopRun('manual');
  assert.equal(f.state.run.end,105200);
  assert.ok(f.sent.some(m=>m.type==='STOP_AT'&&m.end===105200));
  assert.ok(f.issues.some(i=>i.type==='stop'));
});

test('cancelación durante preparación notifica ABORT y finaliza',async()=>{
  const f=fixture();
  f.controller.beginRun('run-42',104000,109000,5);
  f.controller.stopRun('cancelado');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.state.run.state,'cancelled');
  assert.ok(f.sent.some(m=>m.type==='ABORT'));
});

test('sondeo de reloj durante el ensayo termina al finalizar',()=>{
  const f=fixture();
  f.controller.beginRun('run-42',104000,109000,5);
  f.periodic.values().next().value();
  assert.equal(f.periodicSync.length,1);
  assert.deepEqual(f.periodicSync[0],['mobile-2','during','run-42']);
  f.controller.stopDuringSync();
  assert.equal(f.periodic.size,0);
});

test('los participantes solicitan STOP_REQUEST, sin mutar al maestro',()=>{
  const f=fixture({role:'guest'});
  f.state.syncCalibration.correctionMs=2;
  f.controller.beginRun('run-42',104000,109000,5);
  f.controller.stopRun('manual');
  assert.ok(f.sent.some(m=>m.type==='SENT'));
  assert.equal(f.state.run.end,104000);
});

test('el módulo se expone como script clásico de navegador',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/joint/acquisition.js'),'utf8');
  const context={};
  vm.runInNewContext(source,context);
  assert.equal(typeof context.VWOMAAcquisition.createAcquisition,'function');
});
