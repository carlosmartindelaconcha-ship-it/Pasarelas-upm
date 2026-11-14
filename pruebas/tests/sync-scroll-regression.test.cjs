'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createController}=require('../src/joint/calibration-controller.js');
function fixture(role){
 let t=1000;const reveals=[],scheduled=[],sent=[],elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',value:0,attrs:{},classList:{add(){},remove(){},toggle(){}},getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;}});return elements.get(id);};
 const peer={id:role==='host'?'guest':'host',name:'Otro móvil',channel:{readyState:'open'},status:{sensor:true,calibrated:true,visible:true}};
 const s={role,id:role,name:role,sensor:true,sensorEnabled:true,peers:new Map([[peer.id,peer]]),
 calibration:{complete:true,map:{x:{raw:0,sign:1},y:{raw:1,sign:1},z:{raw:2,sign:1}}},
 syncModel:{offset:2000,drift:0,reference:0,count:200,rtt:5},
 syncCalibration:{phase:'gesture-ready',id:'sync1',results:{[role]:{axes:{}}},accepted:false,gesture:null,models:{},peerIds:[peer.id],correctionMs:0}};
 const ctl=createController({s,$,escape:x=>String(x),now:()=>t,toMaster:(x,m)=>x-(m?.offset||0),
 finite:Number.isFinite,sampleRate:()=>60,tell(){},renderDevices(){},tab(){},requireHostEdit(){},
 localStatus:()=>({sensor:true}),startSync:async()=>{},pause:async()=>{},clockFit:()=>null,
 send:(_,m)=>sent.push(m),broadcast:m=>sent.push(m),uid:()=> 'sync1',
 structuredClone:x=>JSON.parse(JSON.stringify(x)),setTimeout:(_,ms)=>scheduled.push(ms),median:()=>0,
 math:{},revealActionTarget:id=>reveals.push(id)});
 return {s,ctl,$,reveals,scheduled};
}
test('after calibration the host sees gesture buttons immediately',()=>{
 const f=fixture('host');f.ctl.beginSyncGuide(f.s.syncCalibration);
 assert.equal(f.s.syncCalibration.guidePhase,'ready');
 assert.equal(f.$('jointSyncGestureActions').hidden,false);
 assert.deepEqual(f.scheduled,[]);
 assert.deepEqual(f.reveals,[]);
});
test('remote Android gesture does not change scroll',()=>{
 const f=fixture('guest');f.ctl.receiveSyncGuide('sync1');
 assert.equal(f.s.syncCalibration.guidePhase,'ready');
 assert.equal(f.$('jointSyncGestureActions').hidden,false);
 f.ctl.armSyncGesture({id:'sync1',axis:'x',start:4000,end:10000},f.s.syncModel);
 assert.deepEqual(f.reveals,[]);
 assert.equal(f.s.syncCalibration.gesture.end,10000);
});
test('host explicit gesture click reveals once and keeps 3+6 second capture',()=>{
 const f=fixture('host');f.ctl.beginSyncGuide(f.s.syncCalibration);
 f.ctl.startSyncGesture('z');
 assert.deepEqual(f.reveals,['jointSyncAnimation']);
 assert.equal(f.s.syncCalibration.gesture.start,4000);
 assert.equal(f.s.syncCalibration.gesture.end,10000);
});
test('completed calibration renders without moving the viewport',()=>{
 const f=fixture('guest');f.ctl.renderCalibration();
 assert.deepEqual(f.reveals,[]);
});
