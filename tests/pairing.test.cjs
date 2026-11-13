const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/joint/joint-app.js'),'utf8');
const sdp='v=0\r\na=candidate:1 1 udp 123 192.168.1.2 5000 typ host\r\n';
function setup(options={}) {
 const elements=new Map(),timers=new Map();let nextTimer=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{id,textContent:'',value:'',hidden:false,disabled:false,open:false,dataset:{},style:{},setAttribute(){},addEventListener(){},replaceChildren(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)};
 class PC {
  constructor(config){this.config=config;this.connectionState='new';this.iceConnectionState='new';this.iceGatheringState='complete';this.signalingState='stable';this.listeners=new Map()}
  close(){this.connectionState='closed';this.iceConnectionState='closed'}
  createDataChannel(){return {readyState:'connecting',send(){}}}
  async createOffer(){return {type:'offer',sdp:options.noCandidates?'v=0\r\n':sdp}}
  async createAnswer(){return {type:'answer',sdp}}
  async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable'}
  async setRemoteDescription(d){if(options.rejectRemote)throw Error('Invalid SDP');this.remoteDescription=d;this.signalingState=d.type==='offer'?'have-remote-offer':'stable';if(options.openOnAnswer&&d.type==='answer'){this.peer.channel.readyState='open';this.peer.channel.onopen()}}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn)}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn)}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event)}
 }
 const ctx={console,TextEncoder,TextDecoder,Uint8Array,Blob,Response,Map,Set,Date,JSON,Number,Math,Promise,Error,structuredClone,crypto:webcrypto,performance:{now:()=>100},RTCPeerConnection:PC,atob,btoa,
 document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},window:{addEventListener(){},removeEventListener(){}},location:{hash:'',href:'https://test.example/app',pathname:'/app',search:''},
 setInterval:()=>0,clearInterval(){},setTimeout:(f,ms)=>{const id=++nextTimer;timers.set(id,{f,ms});return id},clearTimeout:id=>timers.delete(id),cancelAnimationFrame(){},history:{replaceState(){}},localStorage:{setItem(){}},navigator:{userAgent:options.userAgent||''},};
 ctx.window.document=ctx.document;
 let block=source.slice(source.indexOf('(() => {',source.indexOf('MEDIDA CONJUNTA')));
 const end=block.lastIndexOf('})();');
 block=block.slice(0,end)+`renderDevices=()=>{}; startSync=()=>{}; checkRoute=()=>{}; workspace=()=>{}; globalThis.testApi={s,newPeer,wireChannel,watchPair,failPair,retryPair,invite,readCode,createGuestAnswer,pairingAction,localDescription,decodeToken,gather,candidateSummary,candidateDetails,icePairSnapshot,qrTransferPages,acceptQrPage,isAndroidChrome,updateAndroidNearbyNotice};`+block.slice(end);
 // Load the browser plan controller before evaluating the joint application.
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/plan-controller.js'),'utf8'),ctx);
 // The pairing suite tests transport, not the SVG/DOM plan renderer.
 // Stub the controller's UI callbacks instead of reassigning immutable bindings.
 const createPlanController = ctx.VWOMAPlan.createController;
 ctx.VWOMAPlan = {createController:deps=>({...createPlanController(deps),renderPlan:()=>{},savePlan:()=>{}})};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/webrtc-transport.js'),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/clock-model.js'),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/persistence.js'),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/acquisition.js'),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/calibration-math.js'),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/calibration-controller.js'),'utf8'),ctx);
 for(const name of ['exports.js','record-transfer.js','results-view.js','session-state.js','ui-events.js'])
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/joint/'+name),'utf8'),ctx);
 vm.runInNewContext(block,ctx);
 el('jointNetworkMode').value='stun';const a=ctx.testApi;a.s.role='host';a.s.session='session';a.s.id='host';
 const peer=(id='guest')=>{const p=a.newPeer(id);p.pc.peer=p;a.s.currentInvite=id;a.wireChannel(p,p.pc.createDataChannel());return p};
 const answer=p=>'J1.'+btoa(JSON.stringify({v:4,network:p.network,kind:'answer',host:'host',peer:p.id,session:'session',expires:Date.now()+60000,sdp:{type:'answer',sdp}})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return {a,el,timers,peer,answer};
}
test('channel open closes the pairing modal, updates status and cancels timeout',()=>{
 const {a,el,timers,peer}=setup();const p=peer();el('jointPairDialog').open=true;a.watchPair(p);p.channel.readyState='open';p.channel.onopen();
 assert.equal(el('jointPairDialog').open,false);assert.match(el('jointPairStatus').textContent,/Conexión establecida/);assert.equal(timers.size,0);assert.equal(el('jointPanelDevices').hidden,false);
 p.channel.onopen();assert.equal(timers.size,0);
});
test('already-open incoming data channel is initialized immediately',()=>{
 const {a,el}=setup();a.s.role='guest';const p=a.newPeer('host');a.wireChannel(p,{readyState:'open',send(){}});assert.equal(p.opened,true);assert.match(el('jointPairStatus').textContent,/establecida/);
});
test('Chrome Android receives the nearby-devices reminder, other browsers do not',()=>{
 const android=setup({userAgent:'Mozilla/5.0 (Linux; Android 17) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36'});android.el('jointAndroidNearbyNotice').hidden=true;assert.equal(android.a.isAndroidChrome(),true);android.a.updateAndroidNearbyNotice();assert.equal(android.el('jointAndroidNearbyNotice').hidden,false);
 const other=setup({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});other.el('jointAndroidNearbyNotice').hidden=false;assert.equal(other.a.isAndroidChrome(),false);other.a.updateAndroidNearbyNotice();assert.equal(other.el('jointAndroidNearbyNotice').hidden,true);
});
test('accepting an answer cannot overwrite immediate successful connection',async()=>{
 const {a,el,peer,answer}=setup({openOnAnswer:true});const p=peer();p.pc.signalingState='have-local-offer';await a.readCode(answer(p));assert.match(el('jointPairStatus').textContent,/Conexión establecida/);assert.doesNotMatch(el('jointPairStatus').textContent,/Estableciendo/);
});
test('timeout closes pending peer and offers actionable retry',()=>{
 const {a,el,timers,peer}=setup();const p=peer();a.watchPair(p);const timer=[...timers.values()][0];assert.equal(timer.ms,30000);timer.f();assert.equal(p.pc.connectionState,'closed');assert.equal(p.pairFailed,true);assert.match(el('jointPairStatus').textContent,/30 segundos/);assert.match(el('jointPairStatus').textContent,/Reiniciar/);assert.equal(timers.size,0);
});
test('ICE failure ends waiting before timer expires',()=>{
 const {a,el,timers,peer}=setup();const p=peer();a.watchPair(p);p.pc.iceConnectionState='failed';p.pc.oniceconnectionstatechange();assert.equal(p.pairFailed,true);assert.equal(timers.size,0);assert.match(el('jointPairStatus').textContent,/ICE: failed/);
});
test('participant ICE failure is deferred until its answer can be shown',()=>{
 const {a,el,peer}=setup();a.s.role='guest';const p=peer();p.pc.iceConnectionState='failed';p.pc.connectionState='failed';p.pc.oniceconnectionstatechange();
 assert.equal(p.pairFailed,undefined);assert.notEqual(p.pc.connectionState,'closed');assert.match(el('jointPairStatus').textContent,/todavía no cierres/);assert.match(p.diagnostics.at(-1).event,/aplazado/);
});
test('guest retry removes failed peer and allows a new invitation',async()=>{
 const {a,el,peer}=setup();const p=peer();a.s.role='guest';a.failPair(p,'Test');await a.retryPair();assert.equal(a.s.peers.size,0);assert.equal(a.s.role,null);assert.equal(el('jointLanding').hidden,false);assert.match(el('jointPairStatus').textContent,/invitación nueva/);
});
test('host retry preserves connected participants',async()=>{
 const {a,peer}=setup();const connected=peer('kept');connected.channel.readyState='open';const bad=peer('failed');a.failPair(bad,'Test');await a.retryPair();assert.equal(a.s.peers.get('kept'),connected);assert.equal(a.s.peers.has('failed'),false);assert.equal(a.s.peers.size,2);
});
test('missing local candidates produces no unusable invitation and cleans peer',async()=>{
 const {a,el}=setup({noCandidates:true});await assert.rejects(a.invite(),/direcciones utilizables/);assert.equal(a.s.peers.size,0);assert.equal(el('jointPairDiagnostics').hidden,false);assert.match(el('jointPairDiagnosticsText').textContent,/creación de invitación|preparación del código/);
});
test('pairing action prevents overlapping submissions and releases controls on failure',async()=>{
 const {a,el}=setup();let release;const task=a.pairingAction(()=>new Promise(resolve=>release=resolve));await assert.rejects(a.pairingAction(()=>{}),/Espera/);release();await task;await assert.rejects(a.pairingAction(()=>{throw Error('test')}),/test/);assert.equal(a.s.pairBusy,false);assert.equal(el('jointRetryPair').disabled,false);
});
test('rejected answer closes peer rather than leaving an indefinite wait',async()=>{
 const {a,peer,answer,timers}=setup({rejectRemote:true});const p=peer();p.pc.signalingState='have-local-offer';await assert.rejects(a.readCode(answer(p)),/Invalid SDP/);assert.equal(p.pairFailed,true);assert.equal(timers.size,0);
});
function token(payload){return 'J1.'+btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function offer(network='stun',candidate=sdp){return {v:4,network,kind:'offer',host:'master',peer:'guest',session:'new-session',expires:Date.now()+60000,sdp:{type:'offer',sdp:candidate}}}
const srflx='v=0\r\na=candidate:2 1 udp 123 198.51.100.2 6000 typ srflx raddr 0.0.0.0 rport 0\r\n';
test('STUN mode configures app-owned discovery servers; local mode configures none',()=>{
 const {a}=setup();const stun=a.newPeer('a','stun'),local=a.newPeer('b','local');assert.equal(stun.pc.config.iceServers[0].urls[0],'stun:stun.l.google.com:19302');assert.equal(local.pc.config.iceServers.length,0);assert.throws(()=>a.newPeer('x','unknown'),/modo/);
});
test('STUN-only candidates are accepted in STUN mode and rejected in local mode',async()=>{
 const {a}=setup();assert.equal((await a.decodeToken(token(offer('stun',srflx)))).network,'stun');await assert.rejects(a.decodeToken(token(offer('local',srflx))),/direcciones admitidas/);
 const p=a.newPeer('x','stun');p.pc.localDescription={type:'offer',sdp:srflx};assert.equal(a.localDescription(p).sdp,srflx);
});
test('old tokens fail before changing session state',async()=>{
 const {a}=setup();const old=offer();old.v=1;delete old.network;await assert.rejects(a.readCode(token(old)),/incompatible/);assert.equal(a.s.session,'session');assert.equal(a.s.peers.size,0);
});
test('participant stores the offer and only creates its answer after the master scanner is ready',async()=>{
 const {a,el}=setup();a.s.role=null;el('jointNetworkMode').value='stun';await a.readCode(token(offer('local')));
 assert.equal(a.s.peers.size,0);assert.equal(a.s.pendingOffer.network,'local');assert.equal(el('jointGenerateAnswer').hidden,false);assert.equal(el('jointPairOutput').hidden,true);
 await a.createGuestAnswer();const p=a.s.peers.get('master');assert.equal(p.network,'local');assert.equal(p.pc.config.iceServers.length,0);assert.equal(el('jointNetworkMode').disabled,true);assert.equal((await a.decodeToken(el('jointPairOutput').value)).network,'local');
});
test('participant never replaces a visible answer automatically after local ICE fails',async()=>{
 const {a,el,timers}=setup();a.s.role=null;await a.readCode(token(offer('local')));await a.createGuestAnswer();const p=a.s.peers.get('master');
 p.pc.iceConnectionState='failed';p.pc.connectionState='failed';p.pc.oniceconnectionstatechange();
 assert.equal(p.pairFailed,true);assert.equal(timers.size,0);assert.match(el('jointPairStatus').textContent,/no se regenerará automáticamente/);
});
test('response mode must match pending invitation',async()=>{
 const {a,peer,answer}=setup();const p=peer();p.pc.signalingState='have-local-offer';const t=await a.decodeToken(answer(p));t.network='local';await assert.rejects(a.readCode(token(t)),/otro modo/);assert.equal(p.answerAccepted,undefined);
});
test('gather timeout preserves usable candidates if STUN is unreachable',async()=>{
 const {a,peer,timers}=setup();const p=peer();p.pc.iceGatheringState='gathering';p.pc.localDescription={type:'offer',sdp};const work=a.gather(p.pc);const timer=[...timers.values()][0];assert.equal(timer.ms,20000);timer.f();assert.equal(await work,false);
});
test('STUN gathering returns as soon as a reflexive candidate can be put in the QR',async()=>{
 const {a,peer,timers}=setup();const p=peer();p.pc.iceGatheringState='gathering';p.pc.localDescription={type:'answer',sdp:sdp};const work=a.gather(p.pc);
 p.pc.localDescription={type:'answer',sdp:sdp+srflx};p.pc.emit('icecandidate',{candidate:{type:'srflx'}});
 assert.equal(await work,false);assert.equal(timers.size,0);assert.match(p.diagnostics.at(-1).event,/candidatos suficientes/);
});
test('local gathering waits for complete instead of serializing the first host candidate',async()=>{
 const {a,peer,timers}=setup();const p=peer();p.network='local';p.pc.iceGatheringState='gathering';p.pc.localDescription={type:'offer',sdp};const work=a.gather(p.pc);
 assert.equal([...timers.values()][0].ms,15000);p.pc.emit('icecandidate',{candidate:{type:'host'}});assert.equal(timers.size,1);
 p.pc.iceGatheringState='complete';p.pc.emit('icegatheringstatechange');assert.equal(await work,true);assert.equal(timers.size,0);
});
test('QR transfer pages reassemble the complete connection code before it is read',()=>{
 const {a,el}=setup();const code='J1z.'+'a'.repeat(500),pages=a.qrTransferPages(code);assert.ok(pages.length>1);let complete=null;
 for(const page of [...pages].reverse())complete=a.acceptQrPage(page);
 assert.equal(complete,code);assert.match(el('jointPairStatus').textContent,/páginas/);
});
test('gather timeout without candidates rejects instead of generating unusable QR',async()=>{
 const {a,peer,timers}=setup();const p=peer();p.pc.iceGatheringState='gathering';const work=a.gather(p.pc);[...timers.values()][0].f();await assert.rejects(work,/No se han encontrado direcciones/);
});
test('diagnostic summaries expose counts without revealing addresses',()=>{
 const {a}=setup();const summary=a.candidateSummary({sdp:sdp+srflx+'a=candidate:3 1 udp 123 secret.local 5000 typ host\r\n'});assert.equal(summary,'locales 2 (mDNS 1), STUN 1');assert.doesNotMatch(summary,/192\.168|198\.51|secret/);
});
test('detailed candidates retain endpoint, protocol and type for diagnosis',()=>{
 const {a}=setup();const details=a.candidateDetails({sdp:sdp+'a=candidate:2 1 tcp 123 2001:db8::3 9 typ host tcptype active\r\n'});
 assert.deepEqual(Array.from(details),['UDP · host · 192.168.1.2:5000','TCP · host · [2001:db8::3]:9 · active']);
});
test('ICE pair snapshot includes attempted endpoints and response counters',()=>{
 const {a}=setup();const stats=new Map([
  ['l',{id:'l',type:'local-candidate',candidateType:'host',protocol:'udp',address:'pc.local',port:5000}],
  ['r',{id:'r',type:'remote-candidate',candidateType:'host',protocol:'udp',address:'192.168.1.7',port:6000}],
  ['p',{id:'p',type:'candidate-pair',state:'failed',localCandidateId:'l',remoteCandidateId:'r',requestsSent:7,responsesReceived:0}]
 ]);const pairs=a.icePairSnapshot(stats);
 assert.match(pairs[0],/failed/);assert.match(pairs[0],/pc\.local:5000 → UDP · host · 192\.168\.1\.7:6000/);assert.match(pairs[0],/comprobaciones 7 \/ respuestas 0/);
});
test('STUN 701 is translated and kept in the visible diagnostic',()=>{
 const {el,peer}=setup();const p=peer();p.pc.onicecandidateerror({errorCode:701,errorText:'STUN host lookup received error'});
 assert.equal(el('jointPairDiagnostics').hidden,false);
 assert.match(el('jointPairDiagnosticsText').textContent,/701 · no se pudo alcanzar el servidor STUN/);
 assert.match(el('jointPairDiagnosticsText').textContent,/El código 701 significa/);
 assert.doesNotMatch(el('jointPairDiagnosticsText').textContent,/192\.168\.1\.2/);
});
test('connection failure preserves candidate events in diagnostic',()=>{
 const {el,peer}=setup();const p=peer();p.pc.onicecandidate({candidate:{candidate:'candidate:1 1 udp 123 192.168.1.2 5000 typ host',type:'host',protocol:'udp'}});p.pc.iceConnectionState='failed';p.pc.oniceconnectionstatechange();
 const diagnostic=el('jointPairDiagnosticsText').textContent;
 assert.match(diagnostic,/candidato · host · udp/);assert.match(diagnostic,/conexión fallida/);assert.doesNotMatch(diagnostic,/192\.168\.1\.2/);
});
