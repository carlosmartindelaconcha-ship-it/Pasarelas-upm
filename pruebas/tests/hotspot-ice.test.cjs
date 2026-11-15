'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {IP,withHotspotCandidates}=require('../src/joint/hotspot-ice.js');
const {createTransport}=require('../src/joint/webrtc-transport.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../src/joint/webrtc-transport.js'),'utf8');
const sdp='v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
  'a=candidate:hostX 1 udp 2122260223 master.local 40101 typ host generation 0\r\n'+
  'a=candidate:hostY 1 udp 2122260223 10.210.217.193 43561 typ host\r\n'+
  'a=candidate:stun1 1 udp 1677729535 5.64.188.93 60173 typ srflx raddr 0.0.0.0 rport 0\r\n'+
  'a=end-of-candidates\r\n';
test('guarda el candidato mDNS original y añade una alternativa solo para su puerto real',()=>{
  const offer={type:'offer',sdp};
  const r=withHotspotCandidates(offer,true);
  assert.equal(r.added,1);
  assert.equal(r.eligible,1);
  assert.equal(r.status,'added');
  assert.match(r.description.sdp,/a=candidate:vh1 1 udp 2122260351 172\.20\.10\.1 40101 typ host generation 0/);
  assert.match(r.description.sdp,/a=candidate:hostX 1 udp 2122260223 master\.local 40101 typ host generation 0/);
  assert.match(r.description.sdp,/10\.210\.217\.193 43561 typ host/);
  assert.match(r.description.sdp,/5\.64\.188\.93 60173 typ srflx/);
  assert.ok(r.description.sdp.indexOf(IP+' 40101')<r.description.sdp.indexOf('master.local 40101'));
  assert.ok(r.description.sdp.indexOf('a=candidate:vh1')<r.description.sdp.indexOf('a=end-of-candidates'));
  assert.equal(offer.sdp,sdp,'no mutar la oferta recibida');
});
test('en WiFi con direcciones numéricas no inventa candidatos de hotspot',()=>{
  const normal={type:'offer',sdp:'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:host 1 udp 100 192.168.1.13 52000 typ host\r\n'};
  const r=withHotspotCandidates(normal,true);
  assert.equal(r.added,0);
  assert.equal(r.status,'no-mdns-host');
  assert.strictEqual(r.description,normal);
});
test('preserva todos los candidatos originales, ignora TCP, duplica sólo UDP host .local',()=>{
  const x='m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:a 1 udp 100 x.local 5000 typ host\r\n'+
    'a=candidate:b 1 tcp 99 y.local 9 typ host tcptype passive\r\n'+
    'a=candidate:c 1 udp 90 10.0.0.9 5100 typ host\r\n'+
    'a=candidate:d 1 udp 80 z.local 5200 typ host\r\n';
  const r=withHotspotCandidates({type:'answer',sdp:x},true);
  assert.equal(r.added,2);
  for(const original of x.split('\r\n').filter(y=>y.startsWith('a=candidate:')))
    assert.ok(r.description.sdp.includes(original));
  assert.match(r.description.sdp,/172\.20\.10\.1 5000 typ host/);
  assert.match(r.description.sdp,/172\.20\.10\.1 5200 typ host/);
  assert.doesNotMatch(r.description.sdp,/172\.20\.10\.1 9 typ host/);
  assert.equal((r.description.sdp.match(/a=candidate:/g)||[]).length,6);
});
test('respeta alternativas duplicadas y mantiene la descripción intacta cuando está desactivado',()=>{
  const original={type:'offer',sdp};
  assert.strictEqual(withHotspotCandidates(original,false).description,original);
  const x={type:'answer',sdp:'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:original 1 udp 100 xx.local 45000 typ host\r\n'+
    'a=candidate:gateway 1 udp 100 172.20.10.1 45000 typ host\r\n'};
  const r=withHotspotCandidates(x,true);
  assert.equal(r.added,0);
  assert.equal(r.status,'already-present');
});
function fixture(role='guest',network='local',reject=false){
  const s={role};
  let applied,attempts=0;
  const $=()=>({value:'local'});
  const tr=createTransport({
    s,VERSION:4,STUN_SERVERS:[],MAX_PEERS:8,MAX_TOKEN:32000,MAX_MESSAGE:90000,QR_CHUNK_SIZE:300,MAX_QR_PAGES:200,
    uid:()=> '123',now:()=>100,finite:Number.isFinite,$,
    running:()=>false,tell:()=>{},incident:()=>{},guard:f=>f,tab:()=>{},open:()=>{},workspace:()=>{},
    requireHostEdit:()=>{},localStatus:()=>{},renderDevices:()=>{},savePlan:()=>{},
    renderPlan:()=>{},startSync:()=>{},onMessage:()=>{}
  });
  const p={network,createdAt:100,diagnostics:[],pc:{
    async setRemoteDescription(x) {
      attempts++;
      if(reject && attempts===1)throw Error('unsupported candidate');
      applied=x;
    }
  }};
  return {s,p,tr,get applied(){return applied},get attempts(){return attempts}};
}
test('solo el participante que recibe la oferta utiliza la IP alternativa automáticamente',async()=>{
  const old=globalThis.VWOMAIceHotspot;
  globalThis.VWOMAIceHotspot={IP,withHotspotCandidates};
  try{
    const guest=fixture();
    await guest.tr.setRemoteDescriptionWithHotspot(guest.p,{type:'offer',sdp});
    assert.equal(guest.p.hotspotAlternativeStatus,'added');
    assert.equal(guest.p.hotspotAlternatives,1);
    assert.ok(guest.applied.sdp.includes('172.20.10.1 40101'));
    assert.ok(guest.p.diagnostics.some(d=>d.event==='alternativa IP directa automática'));
    for(const [role,network,type] of [['host','local','answer'],['guest','stun','offer'],['guest','local','answer']]){
      const a=fixture(role,network),desc={type,sdp};
      await a.tr.setRemoteDescriptionWithHotspot(a.p,desc);
      assert.strictEqual(a.applied,desc);
    }
  }finally{globalThis.VWOMAIceHotspot=old;}
});
test('si WebRTC rechaza el SDP adicional se reintenta el original',async()=>{
  const old=globalThis.VWOMAIceHotspot;
  globalThis.VWOMAIceHotspot={IP,withHotspotCandidates};
  try{
    const testPeer=fixture('guest','local',true);
    const desc={type:'offer',sdp};
    await testPeer.tr.setRemoteDescriptionWithHotspot(testPeer.p,desc);
    assert.equal(testPeer.attempts,2);
    assert.strictEqual(testPeer.applied,desc);
    assert.equal(testPeer.p.hotspotAlternativeStatus,'rejected');
  }finally{globalThis.VWOMAIceHotspot=old;}
});
test('no exige modo ni IP explícitos; preserva el emparejamiento por QR',()=>{
  assert.doesNotMatch(html,/id="jointMdnsMode"|id="jointMdnsIP"/);
  assert.equal((source.match(/await setRemoteDescriptionWithHotspot\(p,t\.sdp\);/g)||[]).length,2);
  assert.match(source,/s\.role==='guest' && p\.network==='local'/);
  assert.ok(html.indexOf('hotspot-ice.js')<html.indexOf('webrtc-transport.js'));
  assert.match(html,/No necesitas seleccionar el tipo de móvil ni introducir una IP/);
});
