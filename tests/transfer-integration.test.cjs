'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createTransfer}=require('../src/joint/record-transfer.js');

function network({samples=2400,dropChunkAck=false,disconnectAfter=null}={}) {
  const id='guest-1',runId='run-2',session='joint-session';
  const rows=Array.from({length:samples},(_,i)=>[
    i,1000+i*16.7,1000+i*16.7,0.12,0.15,9.81,16.7,1000+i*16.7,995+i*16.7
  ]);
  const record={
    schema:'pasarelas-upm-joint-v1',id:runId,
    device:{id,name:'Participante iPhone',role:'guest'},
    samples:rows,incidents:[],windowMasterMs:{start:995,end:995+samples*16.7}
  };
  const hostState={role:'host',id:'master',session,run:{id:runId,finished:true},results:new Map(),transfer:null};
  const guestState={role:'guest',id,session,run:{id:runId,finished:true},results:new Map(),transfer:null};
  const messages=[],errors=[],notices=[],renderEvents=[];
  const hostPeer={id,acks:new Map(),incoming:null,completedTransfer:null,channel:{readyState:'open'}};
  const guestPeer={id:'master',acks:new Map(),channel:{readyState:'open'}};
  guestState.peers=new Map([[guestPeer.id,guestPeer]]);
  hostState.peers=new Map([[hostPeer.id,hostPeer]]);
  let guest,host,ackDropped=false;
  const transmit=(from,msg)=>{
    const wire=JSON.stringify({...msg,v:4,session});
    const bytes=Buffer.byteLength(wire,'utf8');
    if(bytes>16384)throw Error('WebRTC Safari max-message-size exceeded: '+bytes);
    messages.push({from,type:msg.type,index:msg.index,bytes});
    if(disconnectAfter!==null&&messages.length>disconnectAfter) {
      guestPeer.channel.readyState='closed';hostPeer.channel.readyState='closed';
      return false;
    }
    if(dropChunkAck&&from==='host'&&msg.type==='TRANSFER_ACK'&&msg.index===1&&!ackDropped) {
      ackDropped=true;return true; // simula pérdida de un ACK, sin perder el bloque de datos
    }
    queueMicrotask(async()=>{
      try{
        if(from==='guest')await host.handleTransferMessage(hostPeer,structuredClone(msg));
        else await guest.handleTransferMessage(guestPeer,structuredClone(msg));
      }catch(e){errors.push(e);}
    });
    return true;
  };
  const args={MAX_SAMPLES:10000,finite:Number.isFinite,crypto:webcrypto,TextEncoder,Uint8Array};
  const create=(state,from)=>createTransfer({
    ...args,s:state,send:(_peer,msg)=>transmit(from,msg),
    renderResults:()=>renderEvents.push(from),localRecord:()=>record,
    uid:()=> 'transfer-123',tell:message=>notices.push(message),
    setTimeout,clearTimeout
  });
  host=create(hostState,'host');
  guest=create(guestState,'guest');
  return{guest,host,guestState,hostState,hostPeer,guestPeer,record,errors,messages,notices,renderEvents};
}

test('entrega automática integral de muchos bloques desde participante al maestro',async()=>{
  const n=network({samples:2400});
  assert.ok(JSON.stringify(n.record).length>12000*8);
  await n.guest.sendRecord();
  assert.deepEqual(n.errors,[]);
  assert.equal(n.guestState.run.transferred,true);
  const received=n.hostState.results.get('guest-1');
  assert.ok(received,'el maestro no recibió el registro');
  assert.equal(received.samples.length,n.record.samples.length);
  assert.deepEqual(received,n.record);
  assert.equal(n.hostPeer.incoming,null);
  assert.ok(n.hostPeer.completedTransfer);
  assert.ok(n.messages.some(m=>m.type==='TRANSFER_END'));
  assert.ok(n.renderEvents.includes('host'));
  assert.ok(n.messages.every(m=>m.bytes<=16384));
});

test('confirma correctamente chunks repetidos y envío final repetido',async()=>{
  const n=network({samples:120});
  await n.guest.sendRecord();
  const transferId=n.hostPeer.completedTransfer.id;
  const count=n.hostPeer.completedTransfer.count;
  await n.host.handleTransferMessage(n.hostPeer,{type:'TRANSFER_END',transferId});
  assert.ok(n.messages.some(m=>m.from==='host'&&m.type==='TRANSFER_ACK'&&m.index===count));
  assert.equal(n.hostState.results.size,1);
});

test('rechaza muestras corrompidas sin registrar un archivo inválido',async()=>{
  const n=network({samples:80});
  const text=JSON.stringify(n.record),hash=await n.guest.hashText(text);
  await n.host.handleTransferMessage(n.hostPeer,{type:'TRANSFER_BEGIN',transferId:'bad',runId:n.record.id,size:text.length,count:Math.ceil(text.length/12000),hash});
  await n.host.handleTransferMessage(n.hostPeer,{type:'TRANSFER_CHUNK',transferId:'bad',index:0,data:text.replace('"schema"','"schEma"').slice(0,12000)});
  for(let i=1;i<Math.ceil(text.length/12000);i++) {
    await n.host.handleTransferMessage(n.hostPeer,{type:'TRANSFER_CHUNK',transferId:'bad',index:i,data:text.slice(i*12000,(i+1)*12000)});
  }
  await assert.rejects(n.host.handleTransferMessage(n.hostPeer,{type:'TRANSFER_END',transferId:'bad'}),/integridad/);
  assert.equal(n.hostState.results.size,0);
});
