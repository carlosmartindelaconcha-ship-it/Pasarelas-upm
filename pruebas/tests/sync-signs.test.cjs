'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createMath}=require('../src/joint/calibration-math.js');
const {createController}=require('../src/joint/calibration-controller.js');
const {createExports}=require('../src/joint/exports.js');

const finite=Number.isFinite;
const median=values=>{
  const v=values.filter(finite).sort((a,b)=>a-b);
  return v.length?(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null;
};
const actualMath=createMath({finite,median,sampleRate:()=>60});
const signs=map=>Object.fromEntries(['x','y','z'].map(axis=>[axis,map[axis].sign]));
const baseCalibration=()=>({complete:true,map:{
  x:{raw:0,sign:1,manual:true},y:{raw:1,sign:-1,manual:true},z:{raw:2,sign:1,manual:true}
}});
function fixture({polarities={x:-1,y:1,z:-1},lost=false}={}) {
  const messages=[],notifications=[],timers=[],elements=new Map();
  const dom=id=>{
    if(!elements.has(id))elements.set(id,{
      id,hidden:false,disabled:false,textContent:'',innerHTML:'',value:0,alt:'',
      attrs:{},classList:{add(){},remove(){},toggle(){}},
      getAttribute(key){return this.attrs[key]??null;},
      setAttribute(key,value){this.attrs[key]=value;},
      closest(){return {classList:{toggle(){}}};}
    });
    return elements.get(id);
  };
  const guestCalibration=baseCalibration();
  const masterCalibration={complete:true,map:{
    x:{raw:0,sign:-1},y:{raw:1,sign:-1},z:{raw:2,sign:-1}
  }};
  const peer={id:'guest',name:'Participante',channel:{readyState:'open'},
    status:{sensor:true,visible:true,calibrated:true},samples:[]};
  const s={role:'host',id:'host',name:'Maestro',sensorEnabled:true,
    calibration:masterCalibration,peers:new Map([['guest',peer]]),
    syncCalibration:{
      id:'sync-42',phase:'gesture',accepted:false,peerIds:['guest'],
      results:{
        host:{axes:{x:{axis:'x',lag:0,correlation:1},y:{axis:'y',lag:0,correlation:1}}},
        guest:{accepted:false,
          axes:{
            x:{axis:'x',lag:17,correlation:.96,rawCorrelation:-.96,polarity:polarities.x},
            y:{axis:'y',lag:18,correlation:.96,rawCorrelation:.96,polarity:polarities.y}
          },
          windows:{z:[[4010,2,3,4]]},
          calibration:guestCalibration
        }
      },
      gesture:{id:'sync-42',axis:'z',start:4000,end:10000,
        samples:[[4010,2,3,4]]}
    }
  };
  const math={...actualMath,estimateGestureAxis:(_master,_guest,axis)=>({
    axis,lag:19,correlation:.96,rawCorrelation:polarities[axis]<0?-.96:.96,
    polarity:polarities[axis],rms:.5
  })};
  let accepted=0;
  const ctl=createController({
    s,$:dom,escape:String,now:()=>11000,toMaster:t=>t,
    finite,sampleRate:()=>60,median,math,structuredClone,
    tell:(message,error)=>notifications.push({message,error}),
    renderDevices(){},tab(){},requireHostEdit(){},localStatus:()=>({sensor:true}),
    startSync:async()=>{},pause:async()=>{},clockFit:()=>null,
    send:(p,m)=>messages.push({to:p.id,...m}),broadcast(){},uid:()=> 'sync-42',
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    onSyncAccepted:()=>{accepted++;}
  });
  const apply=()=>messages.find(m=>m.type==='SYNC_GESTURE_APPLY');
  const ack=map=>ctl.confirmSyncApplied('guest','sync-42',map||apply().calibrationSigns);
  return {s,peer,ctl,math,guestCalibration,masterCalibration,dom,
    messages,notifications,timers,apply,ack,accepted:()=>accepted};
}

test('una correlación negativa fuerte conserva el desfase y detecta inversión',()=>{
  const wave=t=>2.2*Math.exp(-(((t-190)/58)**2))-2.7*Math.exp(-(((t-365)/65)**2))+1.8*Math.exp(-(((t-560)/75)**2));
  const master=Array.from({length:100},(_,i)=>{const t=i*12;return [t,wave(t),0,0];});
  const guest=Array.from({length:100},(_,i)=>{const t=i*12;return [t,-wave(t-18),0,0];});
  const r=actualMath.estimateGestureAxis(master,guest,'x',null,null,110,720);
  assert.equal(r.error,undefined);
  assert.equal(r.polarity,-1);
  assert.ok(r.correlation>.9);
  assert.ok(r.rawCorrelation<-.9);
  assert.ok(Math.abs(r.lag-18)<=6);
});
test('en X/Z invertidos y Y correcto se envían coeficientes absolutos, sin tocar al maestro',()=>{
  const f=fixture();
  const before=structuredClone(f.s.calibration);
  f.ctl.finalizeSyncGesture('sync-42','z');
  assert.equal(f.s.syncCalibration.phase,'applying');
  assert.equal(f.s.syncCalibration.accepted,false,'no validar antes del ACK');
  assert.equal(f.accepted(),0);
  assert.deepEqual(f.apply().calibrationSigns,{x:-1,y:-1,z:-1});
  assert.deepEqual(f.apply().signInversions,['x','z']);
  assert.equal(f.apply().correctionMs,18);
  assert.deepEqual(f.s.calibration,before,'el maestro mantiene sus referencias');
  assert.deepEqual(signs(f.guestCalibration.map),{x:1,y:-1,z:1},'la calibración de origen permanece');
  assert.equal(f.peer.syncCalibration,undefined,'no afirmar recepción sin ACK');
  assert.match(f.dom('jointSyncSummary').innerHTML,/−1/);
  assert.equal(f.ack(),true);
  assert.equal(f.s.syncCalibration.phase,'accepted');
  assert.equal(f.s.syncCalibration.accepted,true);
  assert.equal(f.accepted(),1);
  assert.deepEqual(f.peer.syncCalibration.calibrationSigns,{x:-1,y:-1,z:-1});
  assert.equal(f.ack(),false,'el ACK duplicado no vuelve a validar');
  assert.equal(f.accepted(),1);
  for(const timer of f.timers)timer.fn();
  assert.equal(f.s.syncCalibration.phase,'accepted','timeout antiguo inocuo');
});
test('un ACK con signos distintos es rechazado y no permite medir',()=>{
  const f=fixture();
  f.ctl.finalizeSyncGesture('sync-42','z');
  assert.equal(f.ack({x:1,y:-1,z:-1}),false);
  assert.equal(f.s.syncCalibration.phase,'failed');
  assert.equal(f.s.syncCalibration.accepted,false);
  assert.equal(f.accepted(),0);
});
test('sin ACK se conserva el fallo: no se supone que el participante aplicó signos',()=>{
  const f=fixture();
  f.ctl.finalizeSyncGesture('sync-42','z');
  assert.equal(f.timers.find(x=>x.ms===7000)?.ms,7000);
  f.timers.find(x=>x.ms===7000).fn();
  assert.equal(f.s.syncCalibration.phase,'failed');
  assert.equal(f.s.syncCalibration.accepted,false);
  assert.match(f.s.syncCalibration.lastFeedback,/No se confirmó/);
});
test('el protocolo del participante aplica signos absolutos y confirma con ACK',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../src/joint/joint-app.js'),'utf8');
  const logic=js.slice(js.indexOf("if(m.type==='SYNC_GESTURE_APPLY'"),
    js.indexOf("if(m.type==='PLAN'",js.indexOf("if(m.type==='SYNC_GESTURE_APPLY'")));
  assert.match(logic,/calibrationMath\.applyAlignedSigns\(s\.calibration,m\.calibrationSigns\)/);
  assert.match(logic,/s\.calibration=calibration/);
  assert.match(logic,/send\(p,\{type:'SYNC_SIGNS_ACK'/);
  assert.match(logic,/renderCalibration\(\)/);
  assert.match(logic,/confirmSyncApplied\(p\.id,m\.id,m\.calibrationSigns\)/);
  assert.match(logic,/SYNC_SIGNS_REJECT/);
  assert.doesNotMatch(logic,/s\.calibration\.map\[axis\]\.sign\s*\*=/,
    'no multiplicar coeficientes cada vez que se reciba un APPLY');
});
test('las exportaciones estructurales aplican los signos alineados, preservando datos brutos',()=>{
  const original=baseCalibration();
  const axes={x:{polarity:-1},y:{polarity:1},z:{polarity:-1}};
  const corrected=actualMath.applyAlignedSigns(original,actualMath.alignedSigns(original,axes));
  const raw=[0,100,100,2,-3,4,16,100,100],rawCopy=[...raw];
  const exp=createExports({s:{},finite,median,MAX_PEERS:8,toMaster:t=>t,validModel:()=>true,
    correctedVector:actualMath.correctedVector,localRecord:()=>null,
    document:{},Blob,URL,setTimeout});
  const record={device:{calibration:corrected}};
  assert.deepEqual([0,1,2].map(i=>exp.structuralValue(raw,record,i)),[-2,3,-4]);
  assert.deepEqual(raw,rawCopy,'el JSON y CSV brutos deben conservar muestras originales');
  assert.deepEqual(signs(original.map),{x:1,y:-1,z:1});
});
