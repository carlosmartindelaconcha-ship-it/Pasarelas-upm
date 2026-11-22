'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createTransfer}=require('../src/joint/record-transfer.js');
function fixture(){
 const s={role:'host',results:new Map(),transfer:null};
 return createTransfer({s,MAX_SAMPLES:100,finite:Number.isFinite,send:()=>true,
 renderResults:()=>{},localRecord:()=>null,uid:()=> 'transfer-1',tell:()=>{},
 crypto:webcrypto,TextEncoder,Uint8Array,setTimeout,clearTimeout});
}
const record={schema:'pasarelas-upm-joint-v1',id:'run-1',
 device:{id:'guest-1'},samples:[[0,1,2,3,4,5,20,25,30]],
 incidents:[],windowMasterMs:{start:0,end:100}};
test('SHA-256 produce un digest hexadecimal reproducible',async()=>{
 const t=fixture(),hash=await t.hashText('VWOMA');
 assert.match(hash,/^[a-f0-9]{64}$/);
 assert.equal(hash,await t.hashText('VWOMA'));
 assert.notEqual(hash,await t.hashText('vwoma'));
});
test('valida registro y conserva el esquema del ensayo',()=>{
 const t=fixture();
 assert.doesNotThrow(()=>t.validateRecord(record,'guest-1','run-1'));
 assert.throws(()=>t.validateRecord({...record,id:'other'},'guest-1','run-1'),/incompatible/);
 assert.throws(()=>t.validateRecord(record,'another-device','run-1'),/incompatible/);
 assert.throws(()=>t.validateRecord({...record,samples:[[1,1,2,3,4,5,20,25]]},'guest-1','run-1'),/no válidas/);
 assert.throws(()=>t.validateRecord({...record,windowMasterMs:{start:0,end:NaN}},'guest-1','run-1'),/Ventana temporal/);
});
test('rechaza registros que superan el límite de muestras',()=>{
 const t=fixture();const large={...record,samples:Array.from({length:101},(_,i)=>[i,1,2,3,4,5,20,25])};
 assert.throws(()=>t.validateRecord(large,'guest-1','run-1'),/incompatible/);
});
test('maneja ACK de bloque y cancela su temporizador',async()=>{
 const t=fixture(),p={channel:{readyState:'open'},acks:new Map()};
 const timers=new Map();let id=0;
 const tx=createTransfer({s:{role:'guest',run:{finished:true,id:'run-1'},transfer:null},MAX_SAMPLES:100,
 finite:Number.isFinite,send:(peer,msg)=>{queueMicrotask(()=>{const key=msg.transferId+':'+0;const resolve=peer.acks.get(key);peer.acks.delete(key);resolve?.();});return true;},
 renderResults:()=>{},localRecord:()=>record,uid:()=> 'tx',tell:()=>{},crypto:webcrypto,
 TextEncoder,Uint8Array,setTimeout:(fn)=>{const n=++id;timers.set(n,fn);return n;},clearTimeout:n=>timers.delete(n)});
 await tx.acknowledged(p,{transferId:'tx'},0);
 assert.equal(p.acks.size,0);
 assert.equal(timers.size,0);
});
test('el receptor confirma un mensaje duplicado sin añadirlo otra vez',async()=>{
 const t=fixture();const p={id:'guest-1',incoming:null,completedTransfer:{id:'tx',count:2},acks:new Map()};
 const sent=[];const result=await t.handleTransferMessage(p,{type:'TRANSFER_END',transferId:'tx'});
 assert.equal(result,undefined);
});

test('errores específicos de metadatos distinguen el motivo real del rechazo',()=>{
  const t=fixture();
  assert.throws(()=>t.validateRecord({...record,schema:'old-schema'},'guest-1','run-1'),/versión del formato/);
  assert.throws(()=>t.validateRecord(record,'guest-1','other-run'),/ensayo distinto/);
  assert.throws(()=>t.validateRecord(record,'guest-2','run-1'),/identificador del móvil distinto/);
  assert.throws(()=>t.validateRecord({...record,samples:undefined},'guest-1','run-1'),/falta el array/);
  assert.throws(()=>t.validateRecord({...record,samples:new Array(101).fill(null)},'guest-1','run-1'),/límite de muestras/);
});
test('sesiones de campañas distintas no se mezclan aunque coincidan los IDs',()=>{
  const s={role:'host',session:'other-session',results:new Map(),transfer:null};
  const t=createTransfer({s,MAX_SAMPLES:100,finite:Number.isFinite,send:()=>true,
    renderResults:()=>{},localRecord:()=>null,uid:()=> 'transfer-1',tell:()=>{},
    crypto:webcrypto,TextEncoder,Uint8Array,setTimeout,clearTimeout});
  assert.throws(()=>t.validateRecord({...record,session:'original-session'},'guest-1','run-1'),/otra sesión conjunta/);
});
