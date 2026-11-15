'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lab=require('../src/joint/hotspot-ice.js');
const {createTransport}=require('../src/joint/webrtc-transport.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const transportSource=fs.readFileSync(path.join(__dirname,'../src/joint/webrtc-transport.js'),'utf8');
const originalLabSource=fs.readFileSync(path.join(__dirname,'../../webrtc-lab/test.js'),'utf8');
const originalOffer={
  type:'offer',
  sdp:'v=0\r\n'+
      'a=ice-ufrag:abc123\r\n'+
      'a=ice-pwd:verySecretWord\r\n'+
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
      'a=candidate:host1 1 udp 2122260223 c793652c-a409-40b3-978a-6176140b5cec.local 62161 typ host generation 0\r\n'+
      'a=candidate:host2 1 udp 2122260223 10.210.217.193 43561 typ host\r\n'+
      'a=candidate:srflx 1 udp 1677729535 5.64.188.93 60173 typ srflx raddr 0.0.0.0 rport 0\r\n'+
      'a=candidate:tcp1 1 tcp 100 autre.local 9 typ host tcptype passive\r\n'+
      'a=end-of-candidates\r\n'
};
test('fase 1: sustitución literal mDNS → 172.20.10.1 con puerto y parámetros idénticos',()=>{
  const result=lab.useLabReplacement(originalOffer,true);
  assert.equal(lab.IP,'172.20.10.1');
  assert.equal(result.status,'replaced');
  assert.equal(result.replaced,1);
  assert.equal(result.changed[0].originalPort,'62161');
  const exactBefore='a=candidate:host1 1 udp 2122260223 c793652c-a409-40b3-978a-6176140b5cec.local 62161 typ host generation 0';
  const exactAfter='a=candidate:host1 1 udp 2122260223 172.20.10.1 62161 typ host generation 0';
  assert.equal(result.description.sdp,originalOffer.sdp.replace(exactBefore,exactAfter));
  assert.equal(result.description.type,'offer');
  assert.equal(originalOffer.sdp.includes(exactBefore),true,'la oferta original no debe mutarse');
  assert.equal((result.description.sdp.match(/a=candidate:/g)||[]).length,4,'no se añaden rutas ni pares duplicados');
  assert.ok(result.description.sdp.includes('a=ice-ufrag:abc123'));
  assert.ok(result.description.sdp.includes('a=ice-pwd:verySecretWord'));
  assert.ok(result.description.sdp.includes('10.210.217.193 43561 typ host'));
  assert.ok(result.description.sdp.includes('5.64.188.93 60173 typ srflx'));
  assert.ok(result.description.sdp.includes('autre.local 9 typ host'));
  assert.equal(result.description.sdp.includes('c793652c-a409-40b3-978a-6176140b5cec.local'),false);
});
test('el algoritmo coincide con la regla de reemplazo del laboratorio existente',()=>{
  assert.match(originalLabSource,/function replaceRemoteMdnsWithIP\(description,address\)/);
  assert.match(originalLabSource,/parts\[4\]=address;/);
  assert.match(originalLabSource,/parts\[typeIndex\+1\]!=='host'/);
  assert.match(originalLabSource,/parts\[2\]\.toLowerCase\(\)!=='udp'/);
  assert.match(originalLabSource,/!\s*\/\\\.local\$\/i\.test\(parts\[4\]\)/);
  const replacement=lab.replaceRemoteMdnsWithIP(originalOffer,lab.IP);
  assert.equal(replacement.description.sdp,lab.useLabReplacement(originalOffer,true).description.sdp);
});
test('un SDP sin host UDP .local no se altera ni crea candidatos',()=>{
  const d={type:'offer',sdp:'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:host1 1 udp 2122260223 192.168.1.5 44444 typ host\r\n'};
  const x=lab.useLabReplacement(d,true);
  assert.equal(x.status,'no-mdns-host');
  assert.equal(x.replaced,0);
  assert.strictEqual(x.description,d);
  assert.strictEqual(lab.useLabReplacement(originalOffer,false).description,originalOffer);
});
test('todas las direcciones .local UDP host se sustituyen, sin tocar sus puertos',()=>{
  const d={type:'offer',sdp:'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:a 1 udp 100 a.local 41000 typ host\r\n'+
    'a=candidate:b 1 udp 90 b.local 42000 typ host\r\n'+
    'a=candidate:c 1 tcp 80 c.local 9 typ host tcptype passive\r\n'};
  const result=lab.useLabReplacement(d,true);
  assert.equal(result.replaced,2);
  assert.match(result.description.sdp,/a=candidate:a 1 udp 100 172\.20\.10\.1 41000 typ host/);
  assert.match(result.description.sdp,/a=candidate:b 1 udp 90 172\.20\.10\.1 42000 typ host/);
  assert.match(result.description.sdp,/a=candidate:c 1 tcp 80 c\.local 9 typ host/);
  assert.equal((result.description.sdp.match(/a=candidate:/g)||[]).length,3);
});
function fixture(role='guest',network='local',reject=false){
  const state={role};
  let applied=null,attempts=0;
  const transport=createTransport({
    s:state,VERSION:4,STUN_SERVERS:[],MAX_PEERS:8,MAX_TOKEN:50000,MAX_MESSAGE:90000,
    QR_CHUNK_SIZE:430,MAX_QR_PAGES:256,uid:()=> 'abc',now:()=>10,finite:Number.isFinite,
    $:()=>({value:'local'}),running:()=>false,tell:()=>{},incident:()=>{},
    guard:f=>f,tab:()=>{},open:()=>{},workspace:()=>{},requireHostEdit:()=>{},
    localStatus:()=>{},renderDevices:()=>{},savePlan:()=>{},renderPlan:()=>{},
    startSync:()=>{},onMessage:()=>{}
  });
  const p={network,createdAt:0,diagnostics:[],pc:{
    async setRemoteDescription(d){
      attempts++;
      if(reject)throw Error('Safari rejected SDP');
      applied=d;
    }
  }};
  return {p,transport,get applied(){return applied},get attempts(){return attempts}};
}
test('solo el participante recibe la oferta sustituida; maestro, respuestas y STUN inalterados',async()=>{
  const prev=globalThis.VWOMAIceHotspot;
  globalThis.VWOMAIceHotspot=lab;
  try{
    const guest=fixture();
    await guest.transport.setRemoteDescriptionWithHotspot(guest.p,originalOffer);
    assert.equal(guest.p.hotspotAlternativeStatus,'replaced');
    assert.equal(guest.p.hotspotReplacements,1);
    assert.equal(guest.p.hotspotAlternatives,0);
    assert.equal(guest.applied.sdp.includes('172.20.10.1 62161 typ host'),true);
    assert.equal(guest.applied.sdp.includes('.local 62161 typ host'),false);
    assert.ok(guest.p.diagnostics.some(d=>d.event==='sustitución mDNS por IP directa (laboratorio)'));
    for(const [role,network,type] of [['host','local','answer'],['guest','stun','offer'],['guest','local','answer']]){
      const other=fixture(role,network);
      const original={type,sdp:originalOffer.sdp};
      await other.transport.setRemoteDescriptionWithHotspot(other.p,original);
      assert.strictEqual(other.applied,original);
      assert.equal(other.p.hotspotReplacements,0);
    }
  }finally{globalThis.VWOMAIceHotspot=prev;}
});
test('rechazo del SDP no se oculta mediante fallback a candidatos antiguos',async()=>{
  const prev=globalThis.VWOMAIceHotspot;
  globalThis.VWOMAIceHotspot=lab;
  try{
    const guest=fixture('guest','local',true);
    await assert.rejects(
      guest.transport.setRemoteDescriptionWithHotspot(guest.p,originalOffer),
      /Safari rejected SDP/
    );
    assert.equal(guest.attempts,1);
    assert.ok(guest.p.diagnostics.some(d=>d.event==='error al aplicar SDP de fase 1'));
  }finally{globalThis.VWOMAIceHotspot=prev;}
});
test('la fase 1 no modifica códigos QR, temporizadores o formato de señalización',()=>{
  assert.match(html,/src\/joint\/hotspot-ice\.js\?v=20261115-fase1-lab-replacement-v1/);
  assert.match(html,/src\/joint\/webrtc-transport\.js\?v=20261115-fase1-lab-replacement-v1/);
  assert.match(html,/Fase 1 experimental/);
  assert.doesNotMatch(html,/id="jointMdnsIP"|id="jointMdnsMode"/);
  assert.match(transportSource,/const enabled=s\.role==='guest' && p\.network==='local'/);
  assert.equal((transportSource.match(/await setRemoteDescriptionWithHotspot\(p,t\.sdp\);/g)||[]).length,2);
  assert.match(transportSource,/s\.qrPageTimer=setInterval\(\(\)=>\{s\.qrPageIndex=[\s\S]*?2300\)/);
  assert.match(transportSource,/generatedAt:Date\.now\(\)/);
  assert.doesNotMatch(transportSource,/withHotspotCandidates|const isIOS=/);
});
