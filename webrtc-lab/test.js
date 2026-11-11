'use strict';
/* VWOMA - isolated Safari/WebRTC diagnostic laboratory. No server signaling. */
const $ = id => document.getElementById(id);
const VERSION = 'webrtc-lab-3.0-simple-qr';
const MAX_SNAPSHOTS = 300;
let pc = null, channel = null, role = null, report = null;
let timer = null, pendingSnapshot = null, snapshotCount = 0;
let started = 0;
let probeSerial = 0;
let cameraStream = null;
let cameraGeneration = 0;
let qrPages = [], qrIndex = 0, qrTimer = null, qrStream = null, qrScanFrame = 0, qrScanFrameTime = 0, qrReadTransfer = null, qrReadPages = [];
let qrRenderGeneration = 0;
const QR_CHUNK_SIZE = 430, MAX_QR_PAGES = 30;
const pendingProbes = new Map();
const iso = () => new Date().toISOString();
const elapsed = () => started ? Math.round(performance.now() - started) : 0;
const str = x => String(x === undefined || x === null ? '' : x);
const errorInfo = error => ({ name:str(error && error.name), message:str(error && error.message || error), stack:str(error && error.stack), code:error && error.code });
function dataSafe(x) {
  try { return JSON.parse(JSON.stringify(x)); } catch (_) { return str(x); }
}
function environment() {
  const nav = navigator;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  return {
    dateTimeUTC:iso(), page:location.href, secureContext:isSecureContext,
    userAgent:nav.userAgent, platform:nav.platform, vendor:nav.vendor,
    language:nav.language, languages:dataSafe(nav.languages),
    cookieEnabled:nav.cookieEnabled, onlineReported:nav.onLine,
    visibility:document.visibilityState, crossOriginIsolated:window.crossOriginIsolated,
    hardwareConcurrency:nav.hardwareConcurrency ?? null,
    deviceMemory:nav.deviceMemory ?? null,
    networkInformation:connection ? {
      type:connection.type, effectiveType:connection.effectiveType, downlink:connection.downlink,
      rtt:connection.rtt, saveData:connection.saveData
    } : 'No disponible en este navegador',
    webRTCAvailable:typeof RTCPeerConnection === 'function',
    clipboardAvailable:!!(nav.clipboard && nav.clipboard.writeText),
    shareAvailable:typeof nav.share === 'function'
  };
}
function event(kind, message, details) {
  if (!report) return;
  const item = {ms:elapsed(), utc:iso(), kind, message};
  if (details !== undefined) item.details = dataSafe(details);
  report.events.push(item);
  const lines = report.events.slice(-90).map(e =>
    (e.ms / 1000).toFixed(3) + ' s · ' + e.kind + ' · ' + e.message
  );
  $('log').textContent = lines.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
  $('eventCount').textContent = report.events.length + ' eventos · ' + report.snapshots.length + ' muestras completas';
}
function state() {
  return pc ? {
    signalingState:pc.signalingState, iceGatheringState:pc.iceGatheringState,
    iceConnectionState:pc.iceConnectionState, connectionState:pc.connectionState,
    channelState:channel ? channel.readyState : 'ningún canal',
    sctp:pc.sctp ? {
      maxMessageSize:pc.sctp.maxMessageSize,
      state:pc.sctp.transport && pc.sctp.transport.state || null
    } : null,
    localDescriptionType:pc.localDescription && pc.localDescription.type || null,
    remoteDescriptionType:pc.remoteDescription && pc.remoteDescription.type || null,
    visibility:document.visibilityState
  } : null;
}
function setStatus(message) {
  $('status').textContent = message;
  event('estado',message,state());
  renderWizard();
}
function candidateList(sdp) {
  const result = []; let media = '(sin sección)';
  for (const line of str(sdp).split(/\r?\n/)) {
    if (line.startsWith('m=')) media = line;
    if (line.startsWith('a=candidate:')) {
      const v = line.slice('a=candidate:'.length).trim().split(/\s+/);
      const typeIndex = v.indexOf('typ');
      result.push({
        media, raw:line, foundation:v[0], component:v[1], protocol:v[2],
        priority:v[3], address:v[4], port:v[5],
        candidateType:typeIndex >= 0 ? v[typeIndex + 1] : null,
        mdns:!!(v[4] && v[4].endsWith('.local')),
        relatedAddress:v.includes('raddr') ? v[v.indexOf('raddr') + 1] : null,
        relatedPort:v.includes('rport') ? v[v.indexOf('rport') + 1] : null,
        tcpType:v.includes('tcptype') ? v[v.indexOf('tcptype') + 1] : null
      });
    }
  }
  return result;
}
function formatCandidateForDisplay(entry, index) {
  const c=entry.candidate;
  const address=c.address || '(dirección no expuesta)';
  const port=c.port || '(puerto no expuesto)';
  const kind=c.mdns ? 'mDNS .local' : (address.includes(':') ? 'IPv6' : 'IP / nombre');
  return (index+1)+'. +'+(entry.ms/1000).toFixed(3)+' s · '+(c.candidateType||'tipo desconocido')+
    ' · '+(c.protocol||'protocolo desconocido')+'\n   '+address+':'+port+
    ' ['+kind+']'+(entry.source?'\n   Origen: '+entry.source:'');
}
function renderLiveCandidates() {
  if(!report || !report.liveCandidates) return;
  for(const [which,elementId] of [['local','liveLocalCandidates'],['remote','liveRemoteCandidates']]) {
    const entries=report.liveCandidates[which];
    const target=$(elementId);
    if(!target)continue;
    target.textContent=entries.length ?
      entries.map(formatCandidateForDisplay).join('\n\n') :
      (which==='local'?'Esperando candidatos ICE propios…':'Esperando el SDP del otro móvil…');
  }
}
function liveCandidate(direction, candidate, source) {
  if(!report || !report.liveCandidates || !candidate || !candidate.raw) return;
  const entries=report.liveCandidates[direction];
  if(!entries || entries.some(x=>x.candidate.raw===candidate.raw))return;
  entries.push({ms:elapsed(),utc:iso(),candidate,source});
  renderLiveCandidates();
}
function liveFromDescription(info) {
  if(!info)return;
  const direction=info.phase.startsWith('remota')?'remote':'local';
  for(const candidate of info.candidates)liveCandidate(direction,candidate,info.phase);
}
function liveFromStats(summary) {
  if(!summary || !$('liveStatsCandidates'))return;
  const seen=new Set();
  const candidates=(summary.candidates||[]).filter(c=>{
    const key=[c.kind,c.address||'',c.port||'',c.protocol||'',c.candidateType||''].join('|');
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  $('liveStatsCandidates').textContent=candidates.length ?
    candidates.map((c,i)=>(i+1)+'. '+(c.kind==='local-candidate'?'Propia':'Remota')+
      ' · '+(c.candidateType||'tipo desconocido')+' · '+(c.protocol||'protocolo desconocido')+
      '\n   '+(c.address||'(Safari no expone la dirección)')+':'+(c.port||'?')).join('\n\n') :
    'Safari aún no expone direcciones adicionales en getStats().';
}
function candidateTextToCopy() {
  if(!report || !report.liveCandidates)return 'No se ha iniciado ninguna prueba.';
  return 'VWOMA · candidatos ICE · '+iso()+'\nRol: '+(role||'sin configurar')+
    '\n\nDIRECCIONES PROPIAS\n'+
    (report.liveCandidates.local.map(formatCandidateForDisplay).join('\n\n')||'Sin candidatos')+
    '\n\nDIRECCIONES REMOTAS\n'+
    (report.liveCandidates.remote.map(formatCandidateForDisplay).join('\n\n')||'Sin candidatos')+
    '\n\nDATOS ADICIONALES GETSTATS\n'+$('liveStatsCandidates').textContent+
    '\n\nLos nombres .local no se convierten en IP mediante JavaScript.';
}


/* Minimal guided flow: the QR contains only the already gathered SDP.
   A series of small QR pages is used because full SDP does not fit reliably
   into a single code. No signaling or STUN/TURN server is contacted. */
function stopQRCycle() {
  clearInterval(qrTimer);qrTimer=null;qrPages=[];qrIndex=0;
  const display=$('qrImage');if(display)display.replaceChildren();
}
function qrDraw(){
  if(!qrPages.length || !$('qrImage'))return;
  const el=$('qrImage');
  el.replaceChildren();
  if(typeof qrcode!=='function'){
    el.textContent='No se pudo cargar el generador QR. Abre la alternativa de copiar y pegar.';
    return;
  }
  try{
    const qr=qrcode(0,'L');qr.addData(qrPages[qrIndex]);qr.make();
    el.innerHTML=qr.createSvgTag({cellSize:4,margin:3,scalable:true});
    $('qrPageStatus').textContent='QR '+(qrIndex+1)+' de '+qrPages.length+
      (qrPages.length>1?' · las páginas cambian automáticamente':'');
    $('qrNav').hidden=qrPages.length<=1;
  }catch(error){
    el.textContent='No se pudo generar el código QR. Usa la alternativa de copiar y pegar.';
    event('error QR','Renderizado del QR',errorInfo(error));
  }
}
function pageQR(delta){
  if(!qrPages.length)return;
  qrIndex=(qrIndex+delta+qrPages.length)%qrPages.length;
  qrDraw();
}
function bytesToBase64Url(bytes){
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlToBytes(encoded){
  let b64=encoded.replace(/-/g,'+').replace(/_/g,'/');
  b64+='='.repeat((4-b64.length%4)%4);
  const raw=atob(b64);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function encodeQRDescription(raw){
  const original=new TextEncoder().encode(raw);
  let bytes=original, prefix='WL1.';
  if(typeof CompressionStream!=='undefined' && typeof DecompressionStream!=='undefined'){
    try{
      const zipped=await new Response(new Blob([original]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
      if(zipped.byteLength<original.byteLength){bytes=new Uint8Array(zipped);prefix='WL1z.';}
    }catch(error){event('aviso QR','Sin compresión',errorInfo(error));}
  }
  return prefix+bytesToBase64Url(bytes);
}
async function decodeQRDescription(token){
  const match=/^(WL1z|WL1)\.([\w-]+)$/.exec(token);
  if(!match)throw Error('El QR no contiene una descripción de WebRTC reconocida.');
  if(match[2].length>120000)throw Error('Código demasiado largo.');
  const bytes=base64UrlToBytes(match[2]);
  let decoded=bytes;
  if(match[1]==='WL1z'){
    if(typeof DecompressionStream==='undefined')throw Error('Este navegador no puede descomprimir el QR.');
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const parts=[];let total=0;
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      total+=value.length;
      if(total>100000){await reader.cancel();throw Error('QR excesivamente grande.');}
      parts.push(value);
    }
    decoded=new Uint8Array(total);let at=0;
    for(const part of parts){decoded.set(part,at);at+=part.length;}
  }
  const decodedText=new TextDecoder().decode(decoded);
  const obj=JSON.parse(decodedText);
  if(!obj || !['offer','answer'].includes(obj.type) || typeof obj.sdp!=='string' || obj.sdp.length>60000)
    throw Error('La oferta o respuesta del código QR es inválida.');
  return JSON.stringify({type:obj.type,sdp:obj.sdp});
}
async function renderOutboundQR(){
  const raw=$('out').value;
  if(!raw)return;
  const generation=++qrRenderGeneration;
  try {
    const encoded=await encodeQRDescription(raw);
    if(generation!==qrRenderGeneration || $('out').value!==raw)return;
    const transfer=(typeof crypto!=='undefined' && crypto.randomUUID) ?
      crypto.randomUUID().replace(/-/g,'').slice(0,8) : Math.random().toString(16).slice(2,10).padEnd(8,'0');
    const count=Math.ceil(encoded.length/QR_CHUNK_SIZE);
    if(count<1 || count>MAX_QR_PAGES)throw Error('Demasiadas páginas QR. Prueba la alternativa de copiar y pegar.');
    stopQRCycle();
    qrPages=Array.from({length:count},(_,index)=>
      'WQ1.'+transfer+'.'+(index+1)+'.'+count+'.'+encoded.slice(index*QR_CHUNK_SIZE,(index+1)*QR_CHUNK_SIZE)
    );
    $('qrOut').hidden=false;
    $('qrOutTitle').textContent=role==='host'?'Invitación del iPhone A':'Respuesta del iPhone B';
    qrDraw();
    if(count>1)qrTimer=setInterval(()=>pageQR(1),2300);
    event('QR','Mostrando '+count+' páginas QR · '+(role==='host'?'oferta':'respuesta'));
    renderWizard();
  }catch(error){
    $('qrOut').hidden=false;
    $('qrImage').textContent=error.message||String(error);
    event('error QR','Error al preparar la imagen QR',errorInfo(error));
  }
}
function stopQRScanner(){
  if(qrScanFrame)cancelAnimationFrame(qrScanFrame);
  qrScanFrame=0;
  const old=qrStream;qrStream=null;
  if(old)old.getTracks().forEach(track=>track.stop());
  const v=$('qrVideo');
  if(v){v.pause();v.srcObject=null;v.hidden=true;}
  $('stopScan').hidden=true;
  $('scanProgress').hidden=true;
}
function qrReceivePage(text){
  const match=/^WQ1\.([a-z0-9]{8})\.(\d{1,2})\.(\d{1,2})\.([\w.-]+)$/i.exec(text.trim());
  if(!match)return null;
  const [,transfer,iText,countText,part]=match;
  const index=Number(iText),count=Number(countText);
  if(count<1 || count>MAX_QR_PAGES || index<1 || index>count || part.length>QR_CHUNK_SIZE)throw Error('Página QR incorrecta.');
  if(qrReadTransfer!==transfer || qrReadPages.length!==count){
    qrReadTransfer=transfer;qrReadPages=Array(count).fill(null);
  }
  qrReadPages[index-1]=part;
  const read=qrReadPages.filter(Boolean).length;
  $('scanProgress').textContent='Leyendo QR: '+read+' de '+count+' páginas';
  if(read<count)return {complete:false};
  const joined=qrReadPages.join('');
  qrReadPages=[];qrReadTransfer=null;
  return {complete:true,token:joined};
}
async function completeQRScan(token){
  stopQRScanner();
  const received=await decodeQRDescription(token);
  $('incoming').value=received;
  event('QR','Código remoto completo y validado · '+JSON.parse(received).type);
  await apply();
  renderWizard();
}
async function startQRScanner(){
  if(!pc)throw Error('Pulsa antes el botón azul de preparar o crear la conexión.');
  if(typeof jsQR!=='function')throw Error('El lector QR no se ha cargado. Usa copiar y pegar.');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no puede acceder a la cámara.');
  stopQRScanner();
  qrReadTransfer=null;qrReadPages=[];
  $('scanProgress').hidden=false;
  $('scanProgress').textContent='Permite la cámara y apunta al QR del otro teléfono.';
  qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const v=$('qrVideo');
  v.srcObject=qrStream;v.hidden=false;
  $('stopScan').hidden=false;
  await v.play();
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  qrScanFrameTime=0;
  const scan=async(time)=>{
    if(!qrStream)return;
    try{
      if(time-qrScanFrameTime>125 && v.readyState>=2 && v.videoWidth>0){
        qrScanFrameTime=time;
        const factor=Math.min(1,760/v.videoWidth);
        canvas.width=Math.max(1,Math.round(v.videoWidth*factor));
        canvas.height=Math.max(1,Math.round(v.videoHeight*factor));
        ctx.drawImage(v,0,0,canvas.width,canvas.height);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        const read=jsQR(pixels.data,pixels.width,pixels.height);
        if(read && read.data){
          const fragment=qrReceivePage(read.data);
          if(fragment?.complete){await completeQRScan(fragment.token);return;}
          if(!fragment){$('scanProgress').textContent='Ese QR no es del laboratorio. Apunta al otro iPhone.';}
        }
      }
    }catch(error){
      stopQRScanner();
      handleError('leer QR',error);
      return;
    }
    if(qrStream)qrScanFrame=requestAnimationFrame(scan);
  };
  qrScanFrame=requestAnimationFrame(scan);
}
function renderWizard(){
  const selected=$('role').value,host=selected==='host';
  $('roleHost').classList.toggle('active',host);
  $('roleGuest').classList.toggle('active',!host);
  $('roleHost').setAttribute('aria-pressed',String(host));
  $('roleGuest').setAttribute('aria-pressed',String(!host));
  $('mdnsControls').hidden=host;
  $('mdnsIPWrap').hidden=host || $('mdnsMode').value!=='replace';
  $('start').textContent=host?'Crear o reiniciar invitación':'Preparar o reiniciar participante';
  $('scan').textContent=host?'Leer QR de respuesta del iPhone B':'Leer QR de invitación del iPhone A';
  $('scan').disabled=!pc || (host&&!$('out').value) || (!host && !!$('out').value);
  const live=channel?.readyState==='open';
  const failed=pc && (pc.iceConnectionState==='failed'||pc.connectionState==='failed');
  const result=$('connectionResult');
  result.classList.toggle('connected',!!live);
  result.classList.toggle('failed',!!failed);
  if(live){
    result.textContent='Conectados · canal de datos WebRTC abierto.';
    $('guide').textContent='Prueba completada. Puedes copiar el diagnóstico y las direcciones.';
  }else if(failed){
    result.textContent='ICE failed · no se ha abierto la conexión. Copia el diagnóstico para analizarlo.';
    $('guide').textContent='Registra el fallo y repite el ensayo con otra configuración (mDNS o IP directa).';
  }else if(!pc){
    result.textContent='Todavía no se ha intentado la conexión.';
    $('guide').textContent=host ?
      'Primero genera tu QR. Después el iPhone B leerá esa invitación y mostrará una respuesta para que la escanees aquí.' :
      'En este iPhone, elige primero Normal o IP directa. Después pulsa Preparar y lee el QR del iPhone A.';
  }else if(host){
    result.textContent=pc.remoteDescription?'Respuesta recibida; comprobando conexión ICE…':'Oferta creada; pendiente de la respuesta del iPhone B.';
    $('guide').textContent='Muestra el QR de invitación al iPhone B. Cuando el iPhone B muestre su respuesta, pulsa «Leer QR de respuesta» aquí.';
  }else if($('out').value){
    result.textContent='Respuesta preparada; esperando a que el iPhone A la lea.';
    $('guide').textContent='Muestra el QR de respuesta al iPhone A. Después espera el resultado de ICE.';
  }else{
    result.textContent='Participante preparado; esperando la invitación.';
    $('guide').textContent='Pulsa «Leer QR de invitación» y apunta al código del iPhone A. La respuesta se genera automáticamente.';
  }
}
function chooseRole(next){
  if(next!==$('role').value){
    stopQRScanner();stopQRCycle();++qrRenderGeneration;
    clearInterval(timer);timer=null;
    if(pc){pc.close();pc=null;}
    channel=null;report=null;role=null;
    $('out').value='';$('incoming').value='';
    $('qrOut').hidden=true;
    $('liveLocalCandidates').textContent='Esperando candidatos ICE…';
    $('liveRemoteCandidates').textContent='Esperando recibir su SDP…';
    $('status').textContent='Pulsa el botón azul para comenzar.';
  }
  $('role').value=next;
  renderWizard();
}
async function beginGuided(){
  if($('role').value==='guest'&&$('mdnsMode').value==='replace'&&!validIPv4($('mdnsIP').value.trim()))
    throw Error('Introduce la IP real del hotspot, la que figura como Router en el Wi-Fi del iPhone B.');
  stopQRScanner();stopQRCycle();++qrRenderGeneration;
  $('qrOut').hidden=true;
  await init();
  renderWizard();
}

function validIPv4(address) {
  const octets = address.split('.');
  return octets.length===4 && octets.every(x =>
    /^\d{1,3}$/.test(x) && Number(x)>=0 && Number(x)<=255 && String(Number(x))===x);
}
/* This is NOT an mDNS resolver. It changes an SDP host candidate's destination IP
   while keeping the candidate port, ICE priority and credentials unchanged.
   This intervention can reveal whether bypassing .local candidate handling helps. */
function replaceRemoteMdnsWithIP(description,address) {
  if(!validIPv4(address)) throw Error('Introduce una IPv4 válida; consulta «Router» en el Wi-Fi del participante');
  const changed=[];
  const modified=description.sdp.replace(/^a=candidate:([^\r\n]+)$/gm,(line,body)=>{
    const parts=body.trim().split(/\s+/);
    const typeIndex=parts.indexOf('typ');
    if(parts.length<8 || typeIndex<0 || parts[typeIndex+1]!=='host' ||
       !/\.local$/i.test(parts[4]) || parts[2].toLowerCase()!=='udp') return line;
    changed.push({
      originalHost:parts[4],replacementIP:address,originalPort:parts[5],
      protocol:parts[2],originalCandidate:line,
      modifiedCandidate:'a=candidate:'+parts.map((p,i)=>i===4?address:p).join(' ')
    });
    parts[4]=address;
    return 'a=candidate:'+parts.join(' ');
  });
  if(!changed.length)throw Error('El SDP remoto no contiene candidatos UDP host con nombre .local para sustituir. Esta prueba no es aplicable.');
  return {description:{type:description.type,sdp:modified},changed};
}
function updateMdnsPanel(snap=null) {
  if(!report) return;
  const loc=report.localDescriptions.at(-1);
  const rem=report.remoteDescriptions.at(-1);
  const localMdns=(loc?.candidates||[]).filter(c=>c.mdns).length;
  const remoteMdns=(rem?.candidates||[]).filter(c=>c.mdns).length;
  const pairs=(snap?.summary || report.snapshots.at(-1)?.summary)?.candidatePairs || [];
  const succeeded=pairs.filter(p=>p.state==='succeeded').length;
  const replies=pairs.reduce((sum,p)=>sum+(Number(p.responsesReceived)||0),0);
  const replaced=report.mdnsExperiment?.replacements?.length||0;
  const mode=report.mdnsExperiment?.mode==='replace'?'Prueba con IP directa':'Normal (mDNS original)';
  $('mdnsInfo').textContent=
    'Modo: '+mode+' · candidatos .local: propios '+localMdns+', remotos '+remoteMdns+
    ' · sustituidos '+replaced+' · pares ICE satisfactorios '+succeeded+
    ' · respuestas ICE '+replies+'\n'+
    'Safari no ofrece una API JavaScript para confirmar la resolución mDNS. '+
    'La prueba comparativa puede aportar evidencia, no una lectura directa de DNS.';
}
function descriptionInfo(description, phase) {
  if (!description) return null;
  const d = {ms:elapsed(), utc:iso(), phase, type:description.type, sdp:description.sdp,
    candidates:candidateList(description.sdp),
    mediaLines:description.sdp.split(/\r?\n/).filter(line => /^(m=|a=mid:|a=ice-options:|a=ice-ufrag:|a=ice-pwd:|a=fingerprint:|a=setup:|a=group:|a=rtcp-mux|a=sctp-port:|a=max-message-size:|a=end-of-candidates)/.test(line))
  };
  const destination = phase.startsWith('remota') ? report.remoteDescriptions : report.localDescriptions;
  destination.push(d);
  liveFromDescription(d);
  event('SDP',phase+' · '+description.type+' · '+d.candidates.length+' candidatos', {
    candidates:d.candidates, mediaLinesCount:d.mediaLines.length
  });
  updateMdnsPanel();
  return d;
}
function publishLocal() {
  if (!pc || !pc.localDescription) return;
  descriptionInfo(pc.localDescription,'local lista para enviar');
  $('out').value=JSON.stringify({type:pc.localDescription.type,sdp:pc.localDescription.sdp});
  renderOutboundQR().catch(error=>handleError('mostrar QR',error));
}
function summaryFromStats(all) {
  const pairs = all.filter(s => s.type === 'candidate-pair');
  const transports = all.filter(s => s.type === 'transport');
  const selectedIds = transports.map(s=>s.selectedCandidatePairId).filter(Boolean);
  const details = pairs.map(p=>({
    id:p.id, state:p.state, nominated:p.nominated, selected:selectedIds.includes(p.id),
    localCandidateId:p.localCandidateId, remoteCandidateId:p.remoteCandidateId,
    requestsSent:p.requestsSent, requestsReceived:p.requestsReceived,
    responsesSent:p.responsesSent, responsesReceived:p.responsesReceived,
    consentRequestsSent:p.consentRequestsSent,
    currentRoundTripTime:p.currentRoundTripTime, totalRoundTripTime:p.totalRoundTripTime,
    availableOutgoingBitrate:p.availableOutgoingBitrate, bytesSent:p.bytesSent,
    bytesReceived:p.bytesReceived, packetsSent:p.packetsSent, packetsReceived:p.packetsReceived
  }));
  const candidates = all.filter(s=>s.type==='local-candidate'||s.type==='remote-candidate');
  return {
    totalReports:all.length, typeCounts:all.reduce((r,s)=>(r[s.type]=(r[s.type]||0)+1,r),{}),
    selectedCandidatePairIds:selectedIds, candidatePairs:details,
    candidates:candidates.map(s=>({id:s.id,kind:s.type,candidateType:s.candidateType,
      address:s.address||s.ip,port:s.port,protocol:s.protocol,networkType:s.networkType,
      relayProtocol:s.relayProtocol,relatedAddress:s.relatedAddress,
      relatedPort:s.relatedPort,usernameFragment:s.usernameFragment})),
    transportReports:transports
  };
}
async function capture(label='automática') {
  if (!pc || !report) return;
  if (pendingSnapshot) return pendingSnapshot;
  const currentPC=pc, currentReport=report;
  pendingSnapshot=(async()=>{
    const snap={ms:elapsed(),utc:iso(),reason:label,states:state(),stats:[],summary:null};
    try {
      const stats=await currentPC.getStats();
      stats.forEach(item=>{
        const plain={};
        for(const key of Object.keys(item)) {
          try { plain[key]=dataSafe(item[key]); } catch (_) { plain[key]='[no serializable]'; }
        }
        if (!plain.id) plain.id=item.id;
        if (!plain.type) plain.type=item.type;
        snap.stats.push(plain);
      });
      snap.summary=summaryFromStats(snap.stats);
      if(currentReport===report)liveFromStats(snap.summary);
      if(currentReport!==report) return;
      const pairs=snap.summary.candidatePairs;
      const sent=pairs.reduce((n,p)=>n+(Number(p.requestsSent)||0),0);
      const received=pairs.reduce((n,p)=>n+(Number(p.responsesReceived)||0),0);
      $('liveStats').textContent='ICE '+snap.states.iceConnectionState+
        ' · pares '+pairs.length+' · comprobaciones '+sent+' · respuestas '+received+
        ' · canal '+snap.states.channelState;
      updateMdnsPanel(snap);
      renderWizard();
      if(label!=='automática') event('muestra ICE',label+' · '+pairs.length+' pares · '+sent+' solicitudes / '+received+' respuestas');
    } catch(error) {
      snap.error=errorInfo(error);
      if(currentReport===report) event('error getStats',label+' · '+snap.error.message,snap.error);
    }
    if(currentReport!==report) return;
    if(currentReport.snapshots.length<MAX_SNAPSHOTS) currentReport.snapshots.push(snap);
    else if(!currentReport.snapshotLimitReached) {
      currentReport.snapshotLimitReached=true;
      event('límite','Se han guardado las primeras '+MAX_SNAPSHOTS+' muestras; los eventos siguen registrándose');
    }
    $('eventCount').textContent = report.events.length+' eventos · '+report.snapshots.length+' muestras completas';
    return snap;
  })();
  try{return await pendingSnapshot;}finally{pendingSnapshot=null;}
}
function startSampling() {
  clearInterval(timer);
  let ticks=0;
  timer=setInterval(()=>{
    if(pc && report){
      capture('automática').catch(e=>event('error muestreo',str(e)));
      if(++ticks%2===0) sendProbe();
    }
  },2000);
}
function sendProbe(){
  if(!channel || channel.readyState!=='open' || !report) return;
  const id=++probeSerial;
  const at=performance.now();
  const packet={lab:'vwoma-webrtc-lab',type:'ping',id};
  pendingProbes.set(id,at);
  try {
    channel.send(JSON.stringify(packet));
    event('prueba RTT','PING #'+id+' transmitido');
  }catch(error){
    pendingProbes.delete(id);
    event('error prueba RTT',str(error),errorInfo(error));
  }
  if(pendingProbes.size>20) {
    const oldest=pendingProbes.keys().next().value;
    pendingProbes.delete(oldest);
    event('prueba RTT','PING #'+oldest+' sin respuesta (ventana agotada)');
  }
}
function gather() {
  return new Promise(resolve=>{
    if(pc.iceGatheringState==='complete')return resolve(true);
    const gatheringPC=pc; let timeout;
    const done=ok=>{clearTimeout(timeout);gatheringPC.removeEventListener('icegatheringstatechange',check);resolve(ok)};
    const check=()=>{if(gatheringPC.iceGatheringState==='complete')done(true)};
    gatheringPC.addEventListener('icegatheringstatechange',check);
    timeout=setTimeout(()=>{event('aviso','20 segundos sin completar ICE gathering');done(false)},20000);
  });
}
function wire(c) {
  channel=c;
  event('canal','Canal de datos disponible', {
    label:c.label,id:c.id,negotiated:c.negotiated,ordered:c.ordered,protocol:c.protocol,
    maxRetransmits:c.maxRetransmits,maxPacketLifeTime:c.maxPacketLifeTime,readyState:c.readyState
  });
  c.onopen=()=>{setStatus('CANAL ABIERTO');$('send').disabled=false;capture('canal abierto');sendProbe()};
  c.onclosing=()=>{event('canal','Cerrándose');capture('canal cerrándose')};
  c.onclose=()=>{setStatus('Canal cerrado');$('send').disabled=true;capture('canal cerrado')};
  c.onerror=e=>{event('error canal','Error de RTCDataChannel',{
    error:e.error ? errorInfo(e.error):null,message:e.message||null,type:e.type
  });capture('error canal')};
  c.onmessage=e=>{
    let packet=null;
    try { packet=JSON.parse(e.data); }catch(_){}
    if(packet && packet.lab==='vwoma-webrtc-lab' && packet.type==='ping'){
      event('prueba RTT','PING #'+packet.id+' recibido');
      try {c.send(JSON.stringify({lab:'vwoma-webrtc-lab',type:'pong',id:packet.id}));}
      catch(error){event('error prueba RTT','No se pudo responder PONG',errorInfo(error));}
      return;
    }
    if(packet && packet.lab==='vwoma-webrtc-lab' && packet.type==='pong'){
      const at=pendingProbes.get(packet.id);
      if(at!==undefined){
        const rttMs=+(performance.now()-at).toFixed(2);
        pendingProbes.delete(packet.id);
        report.probeRoundTrips.push({ms:elapsed(),id:packet.id,rttMs});
        event('prueba RTT','PING #'+packet.id+' RTT de datos: '+rttMs+' ms');
      } else event('prueba RTT','PONG inesperado #'+packet.id);
      return;
    }
    $('messages').textContent+='Recibido: '+str(e.data)+'\n';
    event('mensaje','Recibido', {data:str(e.data), size:str(e.data).length});
  };
  if(c.readyState==='open')c.onopen();
}
function handleError(context,error){
  const info=errorInfo(error);
  setStatus('ERROR · '+context+': '+info.message);
  event('EXCEPCIÓN',context,info);
  capture('excepción '+context).catch(()=>{});
}
function stopCamera(reason='detenida por el usuario') {
  cameraGeneration++;
  const previous=cameraStream;
  cameraStream=null;
  if(previous)previous.getTracks().forEach(track=>track.stop());
  $('stopCamera').disabled=true;
  $('cameraStatus').textContent='Cámara: detenida ('+reason+').';
  if(report && report.cameraTest) {
    report.cameraTest.stopReason=reason;
    report.cameraTest.stoppedAtMs=elapsed();
    if(previous)event('cámara','Flujo de cámara detenido: '+reason);
  }
}
async function init(){
  // Solicitar getUserMedia directamente desde la pulsación: en Safari importa
  // conservar el gesto del usuario antes de cualquier await de estadísticas.
  const cameraMode=$('cameraMode').value;
  stopCamera('reinicio del ensayo');
  const currentCameraGeneration=cameraGeneration;
  let cameraRequest=null;
  if(cameraMode==='before') {
    if(!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia!=='function')
      throw Error('Este navegador no dispone de getUserMedia para la prueba de cámara.');
    $('cameraStatus').textContent='Cámara: solicitando permiso previo a WebRTC…';
    // La llamada se inicia ANTES de crear RTCPeerConnection y antes del primer await.
    cameraRequest=navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  } else {
    $('cameraStatus').textContent='Cámara: prueba de control, no solicitada.';
  }
  clearInterval(timer);
  if(pc) {
    await capture('antes de reiniciar');
    pc.close();
  }
  qrReadTransfer=null;qrReadPages=[];
  started=performance.now();
  probeSerial=0;pendingProbes.clear();
  report={
    version:VERSION,createdUTC:iso(),role:$('role').value,
    environment:environment(),config:{iceServers:[],iceTransportPolicy:'all'},
    events:[],snapshots:[],localDescriptions:[],remoteDescriptions:[],
    iceCandidateEvents:[],sdpExchanges:[],probeRoundTrips:[],
    liveCandidates:{local:[],remote:[]},
    cameraTest:{mode:cameraMode, permissionRequested:cameraMode==='before', requestedBeforePeer:true,
      granted:false, activeDuringGathering:false, stoppedAtMs:null, stopReason:null, error:null},
    mdnsExperiment:{mode:$('mdnsMode').value, enteredAddress:$('mdnsIP').value.trim(),replacements:[],testApplied:false},
    warnings:['Datos limitados a lo que Safari expone en sus API. No demuestra por sí solo un bloqueo del hotspot.',
      'El informe contiene direcciones IP locales, candidatos y credenciales ICE en SDP: compartir con precaución.']
  };
  role=report.role;channel=null;
  $('log').textContent='';$('messages').textContent='';
  $('out').value='';$('incoming').value='';
  $('liveStats').textContent='Esperando primeras estadísticas…';
  $('mdnsInfo').textContent='Esperando candidatos y datos ICE…';
  $('liveStatsCandidates').textContent='Esperando estadísticas ICE…';
  renderLiveCandidates();
  $('send').disabled=true;
  try {
    if(cameraRequest) {
      event('cámara','Solicitada antes de crear RTCPeerConnection');
      try {
        const stream=await cameraRequest;
        if(currentCameraGeneration!==cameraGeneration) {
          stream.getTracks().forEach(track=>track.stop());
          throw Error('Se ha reiniciado la prueba mientras se solicitaba permiso de cámara.');
        }
        cameraStream=stream;
        report.cameraTest.granted=true;
        report.cameraTest.grantedAtMs=elapsed();
        report.cameraTest.activeDuringGathering=stream.getVideoTracks().some(track=>track.readyState==='live');
        $('cameraStatus').textContent='Cámara: permiso concedido; activa durante la búsqueda ICE.';
        $('stopCamera').disabled=false;
        stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{
          event('cámara','Safari ha terminado la pista de vídeo', {readyState:track.readyState});
          $('cameraStatus').textContent='Cámara: pista terminada por Safari.';
        }));
        event('cámara','Permiso obtenido ANTES de crear RTCPeerConnection',{
          tracks:stream.getTracks().map(track=>({kind:track.kind,readyState:track.readyState,label:track.label}))
        });
      }catch(error) {
        report.cameraTest.error=errorInfo(error);
        $('cameraStatus').textContent='Cámara: permiso no disponible · '+str(error.name||error.message);
        event('error cámara','No se ha podido iniciar prueba previa; WebRTC no se crea',errorInfo(error));
        throw error;
      }
    }else{
      event('cámara','Control sin solicitud de cámara previa');
    }
    pc=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all'});
    report.actualConfiguration=dataSafe(pc.getConfiguration());
    report.sessionId=iso()+'-'+Math.random().toString(36).slice(2,8);
    event('inicio','Conexión nueva · '+role,report.environment);
    event('prueba mDNS','Modo '+report.mdnsExperiment.mode+' (sustitución solo al aplicar SDP remoto)',report.mdnsExperiment);
    pc.onicecandidate=e=>{
      const candidate=e.candidate;
      const detail=candidate ? {
        candidate:candidate.candidate,sdpMid:candidate.sdpMid,
        sdpMLineIndex:candidate.sdpMLineIndex,usernameFragment:candidate.usernameFragment,
        json:typeof candidate.toJSON==='function'?candidate.toJSON():null
      } : {endOfCandidates:true};
      report.iceCandidateEvents.push({ms:elapsed(),utc:iso(),...detail});
      if(candidate && candidate.candidate){
        const raw=candidate.candidate.startsWith('a=') ? candidate.candidate : 'a='+candidate.candidate;
        const parsed=candidateList(raw)[0];
        if(parsed)liveCandidate('local',parsed,'evento ICE en tiempo real');
      }
      event('ICE candidato',candidate?candidate.candidate:'Fin de candidatos',detail);
    };
    pc.onicecandidateerror=e=> {
      const detail={errorCode:e.errorCode,errorText:e.errorText,url:e.url,
        address:e.address,port:e.port,hostCandidate:e.hostCandidate};
      event('ICE ERROR','Error ICE código '+e.errorCode+' · '+e.errorText,detail);
      capture('error icecandidate').catch(()=>{});
    };
    pc.onicegatheringstatechange=()=>{
      event('ICE gathering',pc.iceGatheringState);
      capture('cambio ICE gathering').catch(()=>{});
    };
    pc.oniceconnectionstatechange=()=>{
      setStatus('ICE: '+pc.iceConnectionState);
      capture('cambio ICE '+pc.iceConnectionState).catch(()=>{});
    };
    pc.onconnectionstatechange=()=>{
      event('conexión',pc.connectionState,state());
      capture('cambio conexión '+pc.connectionState).catch(()=>{});
    };
    pc.onsignalingstatechange=()=>{
      event('señalización',pc.signalingState,state());
      capture('cambio señalización '+pc.signalingState).catch(()=>{});
    };
    pc.onnegotiationneeded=()=>event('negociación','onnegotiationneeded',state());
    pc.ondatachannel=e=>wire(e.channel);
    startSampling();
    await capture('recién creado');
    if(role==='host'){
      wire(pc.createDataChannel('vwoma-test',{ordered:true}));
      event('operación','createOffer()');
      const offer=await pc.createOffer();
      report.sdpExchanges.push({ms:elapsed(),direction:'creada',type:'offer',sdp:offer.sdp});
      await pc.setLocalDescription(offer);
      descriptionInfo(pc.localDescription,'local tras setLocalDescription(offer)');
      const complete=await gather();
      if(cameraStream)stopCamera('candidatos de oferta recopilados');
      publishLocal();
      setStatus(complete ? 'Oferta completa: envíala al participante' :
        'Oferta preparada sin completar ICE: comprueba los candidatos antes de enviarla');
    } else setStatus('Participante preparado: pega la oferta del maestro');
    await capture('inicialización completada');
  }catch(error){if(cameraStream)stopCamera('error al iniciar la conexión');handleError('crear conexión',error)}
}
async function apply(){
  if(!pc)throw Error('Primero debes iniciar este teléfono');
  const raw=$('incoming').value.trim();
  let d;
  try{d=JSON.parse(raw)}catch(error){throw Error('JSON de oferta/respuesta incorrecto o incompleto')}
  if(!d || !['offer','answer'].includes(d.type) || typeof d.sdp!=='string')throw Error('Formato de descripción inválido');
  if((role==='host' && d.type!=='answer')||(role==='guest'&&d.type!=='offer'))
    throw Error('Se esperaba '+(role==='host'?'una respuesta':'una oferta'));
  report.sdpExchanges.push({ms:elapsed(),direction:'recibida',type:d.type,sdp:d.sdp});
  descriptionInfo(d,'remota original recibida antes de aplicar');
  let toApply=d;
  if(report.mdnsExperiment.mode==='replace') {
    const ip=report.mdnsExperiment.enteredAddress;
    const result=replaceRemoteMdnsWithIP(d,ip);
    toApply=result.description;
    report.mdnsExperiment.testApplied=true;
    report.mdnsExperiment.replacements.push(...result.changed);
    report.sdpExchanges.push({ms:elapsed(),direction:'modificada para diagnóstico',
      type:d.type,sdp:toApply.sdp});
    event('PRUEBA mDNS','Se sustituyeron '+result.changed.length+' candidatos .local por '+ip,
      result.changed);
    descriptionInfo(toApply,'remota modificada ANTES de aplicar');
  } else {
    event('PRUEBA mDNS','Se mantiene el SDP remoto original (control)');
  }
  event('operación','setRemoteDescription('+toApply.type+')');
  await pc.setRemoteDescription(toApply);
  descriptionInfo(pc.remoteDescription,'remota aplicada');
  await capture('SDP remoto aplicado');
  if(role==='guest'){
    event('operación','createAnswer()');
    const answer=await pc.createAnswer();
    report.sdpExchanges.push({ms:elapsed(),direction:'creada',type:'answer',sdp:answer.sdp});
    await pc.setLocalDescription(answer);
    descriptionInfo(pc.localDescription,'local tras setLocalDescription(answer)');
    const complete=await gather();
    if(cameraStream)stopCamera('candidatos de respuesta recopilados');
    publishLocal();
    setStatus(complete ? 'Respuesta completa: devuélvela al maestro' :
      'Respuesta preparada sin completar ICE: comprueba los candidatos');
  } else setStatus('Respuesta aplicada: esperando conexión ICE');
  await capture('intercambio SDP completado');
}
function send(){
  if(!channel || channel.readyState!=='open') return;
  const m=$('msg').value;
  try {
    channel.send(m);$('messages').textContent+='Enviado: '+m+'\n';
    event('mensaje','Enviado',{data:m,size:m.length,bufferedAmount:channel.bufferedAmount});
  } catch(error){handleError('enviar mensaje',error)}
}
function fullReport(){
  if(!report)return null;
  return {
    ...report,exportedUTC:iso(),elapsedMs:elapsed(),currentState:state(),
    liveLocalDescription:pc && pc.localDescription ? dataSafe(pc.localDescription) : null,
    liveRemoteDescription:pc && pc.remoteDescription ? dataSafe(pc.remoteDescription) : null,
    lastSnapshot:report.snapshots[report.snapshots.length-1] || null
  };
}
function diagnosticSummary(){
  if(!report)return 'No se ha iniciado ninguna prueba.';
  const latest=report.snapshots[report.snapshots.length-1];
  const parts=[
    'VWOMA WebRTC · informe '+VERSION,'Rol: '+role,
    'Inicio UTC: '+report.createdUTC,'Exportado UTC: '+iso(),
    'Navegador: '+report.environment.userAgent,
    'Configuración: '+JSON.stringify(report.actualConfiguration),
    'Estado actual: '+JSON.stringify(state()),
    'Ofertas y respuestas: '+report.localDescriptions.map(d=>
      d.phase+' ('+d.type+', '+d.candidates.length+' candidatos)').join('; '),
    'Remotas: '+report.remoteDescriptions.map(d=>
      d.phase+' ('+d.type+', '+d.candidates.length+' candidatos)').join('; '),
    'Candidatos locales: '+JSON.stringify(report.localDescriptions.at(-1)?.candidates||[]),
    'Candidatos remotos: '+JSON.stringify(report.remoteDescriptions.at(-1)?.candidates||[]),
    'Ensayo mDNS: '+JSON.stringify(report.mdnsExperiment),
    'Estadísticas finales: '+JSON.stringify(latest?.summary||{}),
    'Eventos ('+report.events.length+'):'
  ];
  report.events.forEach(e=>parts.push((e.ms/1000).toFixed(3)+' s · '+e.kind+' · '+e.message));
  parts.push('Nota: el JSON completo contiene todos los campos brutos que getStats() haya proporcionado.');
  return parts.join('\n');
}
async function copyText(t) {
  if(!t){event('aviso','Todavía no hay contenido para copiar');return}
  try {
    await navigator.clipboard.writeText(t);
    event('portapapeles','Contenido copiado ('+t.length+' caracteres)');
  } catch(error) {
    event('portapapeles','No se ha podido copiar automáticamente: '+errorInfo(error).message);
    if(t===$('out').value){$('out').focus();$('out').select()}
    else {$('summary').value=t;$('summary').hidden=false;$('summary').focus();$('summary').select()}
  }
}
function download(){
  if(!report){$('status').textContent='Inicia primero la prueba';return}
  const json=JSON.stringify(fullReport(),null,2);
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='VWOMA_WebRTC_'+role+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  event('exportación','Descarga JSON solicitada ('+json.length+' caracteres)');
}
function setupEvents() {
  document.addEventListener('visibilitychange',()=>event('visibilidad',document.visibilityState,state()));
  window.addEventListener('pagehide',e=>event('página','pagehide · persisted '+e.persisted,state()));
  window.addEventListener('pageshow',e=>event('página','pageshow · persisted '+e.persisted,state()));
  window.addEventListener('blur',()=>event('ventana','blur'));
  window.addEventListener('focus',()=>event('ventana','focus'));
  window.addEventListener('online',()=>event('red','navigator.onLine true (NO acredita conectividad P2P)'));
  window.addEventListener('offline',()=>event('red','navigator.onLine false'));
  window.addEventListener('error',e=>event('ERROR JS',e.message,{filename:e.filename,lineno:e.lineno,colno:e.colno,error:errorInfo(e.error)}));
  window.addEventListener('unhandledrejection',e=>event('PROMESA RECHAZADA',str(e.reason),errorInfo(e.reason)));
}
$('start').onclick=()=>beginGuided().catch(e=>handleError('iniciar',e));
$('roleHost').onclick=()=>chooseRole('host');
$('roleGuest').onclick=()=>chooseRole('guest');
$('mdnsMode').onchange=()=>{renderWizard();if(pc)$('status').textContent='Para cambiar de modo hay que pulsar de nuevo «Preparar participante».';};
$('qrPrev').onclick=()=>pageQR(-1);
$('qrNext').onclick=()=>pageQR(1);
$('scan').onclick=()=>startQRScanner().catch(error=>handleError('escaneo QR',error));
$('stopScan').onclick=()=>stopQRScanner();
$('stopCamera').onclick=()=>stopCamera('detenida manualmente');
$('apply').onclick=()=>apply().catch(e=>handleError('aplicar descripción',e));
$('copy').onclick=()=>copyText($('out').value);
$('send').onclick=send;
$('stats').onclick=()=>capture('solicitada manualmente').catch(e=>handleError('getStats',e));
$('export').onclick=download;
$('copySummary').onclick=()=>copyText(diagnosticSummary());
$('copyFull').onclick=()=>copyText(JSON.stringify(fullReport(),null,2));
$('copyCandidates').onclick=()=>copyText(candidateTextToCopy());
setupEvents();
renderWizard();
