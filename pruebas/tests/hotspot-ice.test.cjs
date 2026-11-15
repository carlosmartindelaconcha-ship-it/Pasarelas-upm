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
  const state={role,peers:new Map()};
  let applied=null,attempts=0;
  const transport=createTransport({
    s:state,VERSION:4,STUN_SERVERS:[],MAX_PEERS:8,MAX_TOKEN:50000,MAX_MESSAGE:90000,
    QR_CHUNK_SIZE:430,MAX_QR_PAGES:256,uid:()=> 'abc',now:()=>10,finite:Number.isFinite,
    $:()=>({value:'local'}),running:()=>false,tell:()=>{},incident:()=>{},
    guard:f=>f,tab:()=>{},open:()=>{},workspace:()=>{},requireHostEdit:()=>{},
    localStatus:()=>{},renderDevices:()=>{},savePlan:()=>{},renderPlan:()=>{},
    startSync:()=>{},onMessage:()=>{}
  });
  const p={id:'peer-1',network,createdAt:0,diagnostics:[],pc:{signalingState:'stable',
    async setRemoteDescription(d){
      attempts++;
      if(reject)throw Error('Safari rejected SDP');
      applied=d;
    }
  }};
  state.peers.set(p.id,p);
  return {p,state,transport,get applied(){return applied},get attempts(){return attempts}};
}

const guestHost='candidate:1 1 udp 2113937151 172.20.10.3 50513 typ host generation 0';
const guestWifi='candidate:1 1 udp 2113937151 192.168.1.45 50513 typ host generation 0';
function withProbe(candidateLines,options={}){
  let probes=0;
  const helper={...lab,async probeLocalICECandidates(){
    probes++;
    if(options.fail)throw Error('ICE gathering bloqueado');
    return {candidateLines,completed:true,finishedBy:'complete',durationMs:130,
      gatheringState:'complete'};
  }};
  return {helper,probes:()=>probes};
}
async function withAutoHelper(helper,fn) {
  const old=globalThis.VWOMAIceHotspot;
  globalThis.VWOMAIceHotspot=helper;
  try{return await fn()}finally{globalThis.VWOMAIceHotspot=old}
}
test('ICE D: reemplazo automático solo en participante de red local conocida',async()=>{
  const x=fixture(),probe=withProbe([guestHost]);
  await withAutoHelper(probe.helper,async()=>x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer));
  assert.equal(probe.probes(),1);
  assert.equal(x.p.hotspotAlternativeStatus,'auto-replaced');
  assert.equal(x.p.hotspotReplacements,1);
  assert.equal(x.p.hotspotAlternatives,0);
  assert.equal(x.p.hotspotAutoDecision.action,'replace');
  assert.deepEqual(x.p.hotspotAutoDecision.guestIPv4,['172.20.10.3']);
  assert.equal(x.p.hotspotAutoProbe.completed,true);
  assert.equal(x.applied.sdp,lab.replaceRemoteMdnsWithIP(originalOffer,lab.IP).description.sdp);
  assert.equal(x.attempts,1,'solo un setRemoteDescription');
  assert.equal((x.applied.sdp.match(/a=candidate:/g)||[]).length,4,'sin adición ni candidatos duplicados');
  assert.equal(x.applied.sdp.includes('.local 62161 typ host'),false);
  assert.ok(x.p.diagnostics.some(d=>d.event==='ICE D · sustitución mDNS por IP directa'));
});
test('ICE D: Wi-Fi normal conserva SDP exactamente, incluyendo el .local',async()=>{
  const x=fixture(),probe=withProbe([guestWifi]);
  await withAutoHelper(probe.helper,async()=>x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer));
  assert.equal(probe.probes(),1);
  assert.equal(x.p.hotspotAlternativeStatus,'auto-original');
  assert.equal(x.p.hotspotReplacements,0);
  assert.equal(x.p.hotspotAutoDecision.action,'normal');
  assert.strictEqual(x.applied,originalOffer);
  assert.equal(x.applied.sdp.includes('.local 62161 typ host'),true);
});
test('ICE D: red ambigua con dos interfaces conserva SDP original',async()=>{
  const x=fixture(),probe=withProbe([guestWifi,guestHost]);
  await withAutoHelper(probe.helper,async()=>x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer));
  assert.equal(x.p.hotspotAlternativeStatus,'auto-original');
  assert.equal(x.p.hotspotAutoDecision.action,'normal');
  assert.equal(x.p.hotspotAutoDecision.guestIPv4.length,2);
  assert.strictEqual(x.applied,originalOffer);
});
test('ICE D: IP no disponible o error de sonda no fuerza 172.20.10.1',async()=>{
  for(const probe of [withProbe([]),withProbe([],{fail:true})]){
    const x=fixture();
    await withAutoHelper(probe.helper,async()=>x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer));
    assert.equal(x.p.hotspotAlternativeStatus,'auto-original');
    assert.equal(x.p.hotspotReplacements,0);
    assert.strictEqual(x.applied,originalOffer);
    assert.equal(x.attempts,1);
    assert.equal(probe.probes(),1);
  }
});
test('ICE D: sin mDNS no crea sonda y entrega el SDP sin modificar',async()=>{
  const x=fixture(),probe=withProbe([guestHost]);
  const offer={type:'offer',sdp:originalOffer.sdp.replace(
    'c793652c-a409-40b3-978a-6176140b5cec.local','192.168.1.9')};
  await withAutoHelper(probe.helper,async()=>x.transport.setRemoteDescriptionWithHotspot(x.p,offer));
  assert.equal(probe.probes(),0);
  assert.equal(x.p.hotspotAlternativeStatus,'no-mdns-host');
  assert.strictEqual(x.applied,offer);
});
test('ICE D: no modifica maestro, respuestas ni modo STUN',async()=>{
  const probe=withProbe([guestHost]);
  await withAutoHelper(probe.helper,async()=>{
    for(const [role,network,type] of [['host','local','answer'],['guest','stun','offer'],['guest','local','answer']]){
      const other=fixture(role,network);
      const original={type,sdp:originalOffer.sdp};
      await other.transport.setRemoteDescriptionWithHotspot(other.p,original);
      assert.strictEqual(other.applied,original);
      assert.equal(other.p.hotspotReplacements,0);
      assert.equal(other.p.hotspotAlternativeStatus,'disabled');
      assert.equal(other.p.hotspotAutoDecision,null);
    }
  });
  assert.equal(probe.probes(),0);
});
test('ICE D: SDP rechazado no se vuelve a negociar con candidatos antiguos',async()=>{
  const x=fixture('guest','local',true),probe=withProbe([guestHost]);
  await withAutoHelper(probe.helper,async()=>{
    await assert.rejects(
      x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer),
      /Safari rejected SDP/
    );
  });
  assert.equal(x.attempts,1);
  assert.equal(x.p.hotspotAlternativeStatus,'auto-replaced');
  assert.ok(x.p.diagnostics.some(d=>d.event==='error al aplicar SDP ICE D'));
});
test('ICE D: no aplica el SDP si el usuario reinicia el emparejamiento durante la sonda',async()=>{
  const x=fixture();
  const mocked={...lab,async probeLocalICECandidates(){
    x.state.peers.delete(x.p.id);
    return {candidateLines:[guestHost],completed:true,finishedBy:'complete',durationMs:160};
  }};
  await withAutoHelper(mocked,async()=>{
    await assert.rejects(
      x.transport.setRemoteDescriptionWithHotspot(x.p,originalOffer),
      /reiniciado durante la detección ICE/
    );
  });
  assert.equal(x.attempts,0);
});
test('ICE D: el detector usa los mismos criterios y preflight que el laboratorio A/B/C/D',async()=>{
  const labD=require('../ice-abc/ice-candidates.js');
  const offer={type:'offer',sdp:originalOffer.sdp};
  for(const candidates of [
    [guestHost],[guestWifi],[guestHost,guestWifi],[],
    ['candidate:1 1 udp 2113937151 unknown.local 50513 typ host']
  ]){
    const expected=labD.autoDecide(offer,candidates);
    const actual=lab.autoDecide(offer,candidates);
    assert.deepEqual(actual,expected);
  }
  const abcd=fs.readFileSync(path.join(__dirname,'../ice-abc/test.js'),'utf8');
  const probeCode=abcd.slice(abcd.indexOf('async function probeLocalICECandidates('),abcd.indexOf('async function apply(){')).trim();
  const helperCode=fs.readFileSync(path.join(__dirname,'../src/joint/hotspot-ice.js'),'utf8');
  assert.ok(helperCode.replace(/\s+/g,'').includes(probeCode.replace(/\s+/g,'')));
});

test('ICE D no modifica códigos QR, temporizadores o formato de señalización',()=>{
  assert.match(html,/src\/joint\/hotspot-ice\.js\?v=20261115-auto-ice-d-v1/);
  assert.match(html,/src\/joint\/webrtc-transport\.js\?v=20261115-auto-ice-d-v1/);
  assert.match(html,/Conexión local automática/);
  assert.doesNotMatch(html,/id="jointMdnsIP"|id="jointMdnsMode"/);
  assert.match(transportSource,/const enabled=s\.role==='guest' && p\.network==='local'/);
  assert.match(transportSource,/await helper\.probeLocalICECandidates\(\)/);
  assert.match(transportSource,/helper\.autoDecide\(description,detected\)/);
  assert.equal((transportSource.match(/await setRemoteDescriptionWithHotspot\(p,t\.sdp\);/g)||[]).length,2);
  assert.match(transportSource,/s\.qrPageTimer=setInterval\(\(\)=>\{s\.qrPageIndex=[\s\S]*?2300\)/);
  assert.match(transportSource,/generatedAt:Date\.now\(\)/);
  assert.doesNotMatch(transportSource,/withHotspotCandidates|const isIOS=/);
});
