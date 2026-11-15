'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ABC=require('../ice-candidates.js');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const js=read('test.js');
const labJs=fs.readFileSync(path.join(root,'../../webrtc-lab/test.js'),'utf8');
const laboratoryHelper=fs.readFileSync(path.join(root,'../../pruebas/src/joint/hotspot-ice.js'),'utf8');
const OFFER={type:'offer',sdp:
  'v=0\r\n'+
  'a=ice-ufrag:xyz\r\n'+
  'a=ice-pwd:secret123\r\n'+
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
  'a=candidate:9 1 udp 2122260223 abcdef.local 62161 typ host generation 0\r\n'+
  'a=candidate:10 1 udp 100 172.20.10.3 60595 typ host\r\n'+
  'a=candidate:11 1 tcp 50 tcp.local 9 typ host tcptype passive\r\n'+
  'a=end-of-candidates\r\n'};
const originalHost='a=candidate:9 1 udp 2122260223 abcdef.local 62161 typ host generation 0';
const targetHost='a=candidate:9 1 udp 2122260223 172.20.10.1 62161 typ host generation 0';
const HOSTIP='172.20.10.1';
function candidateLines(desc){
  return desc.sdp.split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
}
test('A: los candidatos y la descripción original se entregan sin alteración alguna',()=>{
  const a=ABC.transform(OFFER,'normal',HOSTIP);
  assert.strictEqual(a.description,OFFER);
  assert.deepEqual(a.changed,[]);
  assert.equal(a.mode,'normal');
  assert.equal(candidateLines(a.description).length,3);
});
test('B: adición con la misma foundation y prioridad 256 mayor, conservando mDNS',()=>{
  const b=ABC.transform(OFFER,'add',HOSTIP);
  assert.equal(b.mode,'add');
  assert.equal(b.changed.length,1);
  const c=b.changed[0];
  assert.equal(c.originalHost,'abcdef.local');
  assert.equal(c.originalPort,'62161');
  assert.equal(c.originalFoundation,'9');
  assert.equal(c.addedFoundation,'9');
  assert.equal(c.originalPriority,'2122260223');
  assert.equal(c.addedPriority,'2122260479');
  assert.match(b.description.sdp,/a=candidate:9 1 udp 2122260479 172\.20\.10\.1 62161 typ host generation 0/);
  assert.match(b.description.sdp,/a=candidate:9 1 udp 2122260223 abcdef\.local 62161 typ host generation 0/);
  assert.equal(candidateLines(b.description).length,4);
  assert.ok(b.description.sdp.indexOf('a=candidate:9 1 udp 2122260479')<b.description.sdp.indexOf(originalHost));
  assert.equal(OFFER.sdp.includes(originalHost),true);
  assert.ok(b.description.sdp.includes('a=ice-ufrag:xyz'));
  assert.ok(b.description.sdp.includes('a=ice-pwd:secret123'));
});
test('B: el nuevo candidato difiere SOLO en IP y prioridad; mantiene foundation, componente, puerto y atributos',()=>{
  const b=ABC.transform(OFFER,'add',HOSTIP);
  const oldParts=originalHost.slice('a=candidate:'.length).split(' ');
  const newParts=b.changed[0].addedCandidate.slice('a=candidate:'.length).split(' ');
  assert.equal(oldParts.length,newParts.length);
  for(let i=0;i<oldParts.length;i++){
    if(i===3){
      assert.equal(Number(newParts[i]),Number(oldParts[i])+256);
      assert.equal(Number(newParts[i])%256,Number(oldParts[i])%256);
    }else if(i===4){
      assert.equal(newParts[i],HOSTIP);
    }else{
      assert.equal(newParts[i],oldParts[i],'no alterar campo '+i);
    }
  }
  assert.equal(b.description.sdp.includes(originalHost),true);
  assert.equal(candidateLines(b.description).length,candidateLines(OFFER).length+1);
  assert.equal(OFFER.sdp.includes(originalHost),true);
});
test('C: reemplaza SOLO la IP y no duplica la foundation ni altera la prioridad',()=>{
  const c=ABC.transform(OFFER,'replace',HOSTIP);
  assert.equal(c.mode,'replace');
  assert.equal(c.changed.length,1);
  assert.equal(c.description.sdp,OFFER.sdp.replace(originalHost,targetHost));
  assert.equal(candidateLines(c.description).length,3);
  assert.equal(c.description.sdp.includes('abcdef.local'),false);
  assert.equal(c.description.sdp.includes('vh1'),false);
  assert.ok(c.description.sdp.includes('172.20.10.3 60595 typ host'));
});
test('C conserva literalmente el algoritmo del laboratorio funcional',()=>{
  assert.match(labJs,/function replaceRemoteMdnsWithIP\(description,address\)/);
  assert.match(js,/const result=replaceRemoteMdnsWithIP\(d,ip\)/);
  assert.match(js,/report\.mdnsExperiment\.replacements\.push/);
  const ours=read('ice-candidates.js');
  const sectionName='function replaceRemoteMdnsWithIP(description,address) {';
  const fromLab=labJs.substring(labJs.indexOf(sectionName),labJs.indexOf('function updateMdnsPanel(',labJs.indexOf(sectionName))).trim();
  const fromABC=ours.substring(ours.indexOf(sectionName),ours.indexOf('function addRemoteMdnsCandidates(',ours.indexOf(sectionName))).trim();
  assert.match(fromABC,/parts\[4\]=address/);
  assert.equal(fromABC.includes(fromLab),true);
});
test('B no altera TCP, direcciones numéricas ni otros puertos, y respeta m-lines',()=>{
  const offer={type:'offer',sdp:
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:1 1 udp 1100 a.local 40101 typ host\r\n'+
    'a=candidate:2 1 tcp 50 b.local 9 typ host tcptype passive\r\n'+
    'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'+
    'a=candidate:3 1 udp 2200 c.local 44111 typ host\r\n'+
    'a=candidate:4 1 udp 98 1.2.3.4 59000 typ srflx\r\n'};
  const b=ABC.transform(offer,'add',HOSTIP);
  assert.equal(b.changed.length,2);
  assert.match(b.description.sdp,/172\.20\.10\.1 40101 typ host/);
  assert.match(b.description.sdp,/172\.20\.10\.1 44111 typ host/);
  assert.match(b.description.sdp,/a=candidate:2 1 tcp 50 b\.local 9 typ host/);
  assert.match(b.description.sdp,/1\.2\.3\.4 59000 typ srflx/);
  assert.equal(candidateLines(b.description).length,6);
  const section2=b.description.sdp.split('m=video')[1];
  assert.match(section2,/172\.20\.10\.1 44111/);
  assert.doesNotMatch(section2,/172\.20\.10\.1 40101/);
});
test('No se inventa duplicado si ya existe el host IP:puerto en el mismo media section',()=>{
  const offer={type:'offer',sdp:
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:1 1 udp 100 m.local 40000 typ host\r\n'+
    'a=candidate:2 1 udp 200 172.20.10.1 40000 typ host\r\n'};
  assert.throws(()=>ABC.transform(offer,'add',HOSTIP),/No existen candidatos/);
});
test('B: no fabricar prioridades inválidas cuando el valor original supera el máximo permitido',()=>{
  const d={type:'offer',sdp:'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:1 1 udp 4294967295 example.local 40000 typ host\r\n'};
  assert.throws(()=>ABC.transform(d,'add',HOSTIP),/No existen candidatos/);
});

test('D: reconoce la red 172.20.10.x sin cambiar el candidato original hasta decidir',()=>{
  const offer=JSON.parse(JSON.stringify(OFFER));
  const candidate='candidate:9 1 udp 2113937151 172.20.10.3 50513 typ host';
  const d=ABC.autoDecide(offer,[candidate]);
  assert.equal(d.action,'replace');
  assert.equal(d.address,'172.20.10.1');
  assert.equal(d.remoteMdns,true);
  assert.deepEqual(d.guestIPv4,['172.20.10.3']);
  assert.equal(ABC.replaceRemoteMdnsWithIP(OFFER,d.address).description.sdp,OFFER.sdp.replace(originalHost,targetHost));
  assert.equal(offer.sdp,OFFER.sdp);
});
test('D: Wi-Fi normal, mDNS ausente o dirección oculta no modifican el SDP',()=>{
  for(const address of ['192.168.1.30','10.0.0.12','172.20.11.3','172.20.10.1','172.20.10.15']){
    const d=ABC.autoDecide(OFFER,['a=candidate:1 1 udp 2113937151 '+address+' 50000 typ host']);
    assert.equal(d.action,'normal',address);
    assert.equal(d.address,null);
  }
  const noMdns={type:'offer',sdp:OFFER.sdp.replace(originalHost,targetHost)};
  assert.equal(ABC.autoDecide(noMdns,['candidate:1 1 udp 2113937151 172.20.10.3 50000 typ host']).action,'normal');
  assert.equal(ABC.autoDecide(OFFER,[]).action,'normal');
  assert.equal(ABC.autoDecide(OFFER,['candidate:1 1 udp 2113937151 guest.local 50000 typ host']).action,'normal');
});
test('D: si hay dos interfaces potencialmente distintas conserva el SDP',()=>{
  const d=ABC.autoDecide(OFFER,[
    'candidate:1 1 udp 2113937151 172.20.10.3 50513 typ host',
    'candidate:2 1 udp 2113937151 192.168.1.25 50515 typ host'
  ]);
  assert.equal(d.action,'normal');
  assert.match(d.reason,/ambiguas/);
  const duplicates=ABC.autoDecide(OFFER,[
    'candidate:1 1 udp 2113937151 172.20.10.3 50513 typ host',
    'a=candidate:1 1 udp 2113937151 172.20.10.3 50513 typ host'
  ]);
  assert.equal(duplicates.action,'replace');
  assert.equal(duplicates.guestIPv4.length,1);
});
test('D: conexión provisional recoge candidatos, no usa STUN/TURN y siempre se cierra',async()=>{
  const vm=require('node:vm');
  const code=js.slice(js.indexOf('async function probeLocalICECandidates('),js.indexOf('async function apply(){'));
  assert.match(code,/probe\.close\(\)/);
  let peer;
  class FakePC {
    constructor(config){this.config=config;this.iceGatheringState='new';this.closed=false;peer=this;}
    createDataChannel(label){this.label=label;return {};}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};}
    async setLocalDescription(offer){
      this.localDescription={...offer,sdp:offer.sdp+'a=candidate:9 1 udp 2113937151 172.20.10.3 50513 typ host\r\n'};
      this.onicecandidate({candidate:{candidate:'candidate:9 1 udp 2113937151 172.20.10.3 50513 typ host'}});
      this.iceGatheringState='complete';
    }
    close(){this.closed=true;}
  }
  const fn=vm.runInNewContext(code+'\nprobeLocalICECandidates',
    {RTCPeerConnection:FakePC,performance:{now:()=>10},Set,Promise,setTimeout,clearTimeout});
  const result=await fn();
  assert.equal(peer.closed,true);
  assert.deepEqual(peer.config.iceServers,[]);
  assert.equal(peer.label,'vwoma-auto-ice-probe');
  assert.equal(result.completed,true);
  assert.equal(result.candidateLines.length,2);
  assert.equal(ABC.autoDecide(OFFER,Array.from(result.candidateLines)).action,'replace');
});
test('D: error de Safari en preflight cierra el PeerConnection',async()=>{
  const vm=require('node:vm');
  const code=js.slice(js.indexOf('async function probeLocalICECandidates('),js.indexOf('async function apply(){'));
  let peer;
  class FakePC {
    constructor(){peer=this;this.iceGatheringState='new';}
    createDataChannel(){return {};}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};}
    async setLocalDescription(){throw Error('preflight error');}
    close(){this.closed=true;}
  }
  const fn=vm.runInNewContext(code+'\nprobeLocalICECandidates',
    {RTCPeerConnection:FakePC,performance:{now:()=>10},Set,Promise,setTimeout,clearTimeout});
  await assert.rejects(fn(),/preflight error/);
  assert.equal(peer.closed,true);
});
test('D: integra detección en apply y registra la decisión sin afectar A/B/C',()=>{
  assert.match(js,/mode==='auto'/);
  assert.match(js,/await probeLocalICECandidates\(\)/);
  assert.match(js,/IceABC\.autoDecide\(d,detected\)/);
  assert.match(js,/const result=replaceRemoteMdnsWithIP\(d,decision\.address\)/);
  assert.match(js,/autoProbe:null,autoDecision:null/);
  assert.match(js,/autoAction:report\.mdnsExperiment\.autoDecision/);
  assert.match(html,/<option value="auto" selected>/);
  assert.match(html,/A\/B\/C\/D/);
});

test('Las IP inválidas y las estrategias no previstas se rechazan antes de negociar',()=>{
  for(const ip of ['172.20.10.999','172.020.10.1','bad','172.20.10.1\nextra','']){
    assert.equal(ABC.validIPv4(ip),false);
    assert.throws(()=>ABC.transform(OFFER,'add',ip),/IPv4 válida/);
    assert.throws(()=>ABC.transform(OFFER,'replace',ip),/IPv4 válida/);
  }
  assert.throws(()=>ABC.transform(OFFER,'unknown',HOSTIP),/Estrategia ICE desconocida/);
});
test('Interfaz con A/B/C/D, historial, exportación JSON y lectura QR intacta',()=>{
  for(const v of ['normal','add','replace','auto'])assert.match(html,new RegExp('<option value="'+v+'"'));
  for(const id of ['roleHost','roleGuest','qrImage','scan','mdnsMode','mdnsIP',
    'saveTrial','copyComparison','clearComparison','abcRows','abcCount','copyFull','export','liveStats','qrVideo'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/const ABC_STORAGE_KEY = 'vwoma-ice-abcd-results-v4'/);
  assert.match(js,/webrtc-ice-abcd-20261115-auto-v4/);
  assert.match(js,/B · Se conserva la foundation original/);
  assert.ok(html.includes('B · Adición: misma foundation, prioridad +256'));
  assert.match(html,/ice-candidates\.js\?v=ice-abc-20261115-v4/);
  assert.match(html,/test\.js\?v=ice-abc-20261115-v4/);
  assert.match(js,/const QR_CHUNK_SIZE = 430, MAX_QR_PAGES = 30/);
  assert.match(js,/if\(count>1\)qrTimer=setInterval\(\(\)=>pageQR\(1\),2300\)/);
  assert.match(js,/IceABC\.addRemoteMdnsCandidates\(d,ip\)/);
  assert.match(js,/mode:role==='host'\?'normal':\$\('mdnsMode'\)\.value/);
  assert.match(js,/if\(role==='guest' && report\.mdnsExperiment\.mode==='replace'\)/);
  assert.match(js,/else if\(role==='guest' && report\.mdnsExperiment\.mode==='add'\)/);
});
test('Métricas: distingue pareja seleccionada, nominación y duración real del canal',()=>{
  assert.match(js,/selectedCandidatePairId/);
  assert.match(js,/nominated:p\.nominated/);
  assert.match(js,/responsesReceived:p\.responsesReceived/);
  assert.match(js,/channelTrial:\{everOpened:false/);
  assert.match(js,/c\.onopen=\(\)=>\{/);
  assert.match(js,/c\.onclose=\(\)=>\{/);
  assert.match(js,/t\.maxOpenMs=Math\.max\(t\.maxOpenMs/);
  assert.match(js,/p\.selected===true/);
  assert.match(js,/abcDuration\(\)/);
  assert.match(js,/probeRoundTrips/);
  assert.match(js,/abcSaveTrial/);
  assert.match(js,/localStorage\.setItem\(ABC_STORAGE_KEY/);
  assert.match(js,/abcComparisonText/);
});
test('La comparación guarda solo métricas, nunca las credenciales del SDP',()=>{
  const begin=js.indexOf('function abcTrialSummary(){');
  const end=js.indexOf('function abcEscape(',begin);
  assert.ok(begin>=0&&end>begin);
  const summary=js.slice(begin,end);
  assert.doesNotMatch(summary,/sdp|ice-pwd|ice-ufrag|fingerprint/);
  assert.match(summary,/longestOpenSec/);
  assert.match(summary,/selectedPair/);
  assert.match(summary,/responses/);
  assert.match(js,/abcHistory\.push\(r\)/);
});

test('La página experimental inicia en un DOM simulado y permite elegir A, B, C o D',()=>{
  const vm=require('node:vm');
  const elements=new Map();
  function el(id){
    if(!elements.has(id)){
      const obj={id,value:id==='role'?'host':id==='mdnsMode'?'replace':id==='mdnsIP'?'172.20.10.1':'',
        hidden:false,disabled:false,textContent:'',innerHTML:'',scrollTop:0,
        classList:{toggle(){}},setAttribute(){},addEventListener(){},replaceChildren(){this.innerHTML='';},
        pause(){},select(){},focus(){}};
      elements.set(id,obj);
    }
    return elements.get(id);
  }
  const document={getElementById:el,addEventListener(){},visibilityState:'visible'};
  const window={addEventListener(){}};
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  const ctx={document,window,localStorage,navigator:{},IceABC:ABC,console,
    Date,Math,JSON,Number,Set,Map,Promise,TextEncoder,TextDecoder,
    performance:{now:()=>1000},clearInterval(){},clearTimeout(){},
    setInterval(){return 1},setTimeout(){return 1},confirm:()=>true};
  assert.doesNotThrow(()=>vm.runInNewContext(js,ctx,{timeout:3000}));
  assert.match(el('abcRows').innerHTML,/A · Original/);
  assert.match(el('abcRows').innerHTML,/B · Adición/);
  assert.match(el('abcRows').innerHTML,/C · Sustitución/);
  assert.match(el('abcRows').innerHTML,/D · Automático/);
  assert.equal(el('saveTrial').disabled,true,'no guardar ensayo antes de conectar');
  assert.doesNotThrow(()=>el('roleGuest').onclick());
  assert.equal(el('mdnsControls').hidden,false);
  assert.equal(el('mdnsIPWrap').hidden,false);
  el('mdnsMode').value='add';
  assert.doesNotThrow(()=>el('mdnsMode').onchange());
  assert.match(el('modeWarning').textContent,/B ·/);
  el('mdnsMode').value='auto';
  el('mdnsMode').onchange();
  assert.equal(el('mdnsIPWrap').hidden,true);
  assert.match(el('modeWarning').textContent,/D ·/);
  el('mdnsMode').value='normal';
  el('mdnsMode').onchange();
  assert.equal(el('mdnsIPWrap').hidden,true);
});
