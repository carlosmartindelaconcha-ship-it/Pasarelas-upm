'use strict';
/* VWOMA - isolated Safari/WebRTC diagnostic laboratory. No server signaling. */
const $ = id => document.getElementById(id);
const VERSION = 'webrtc-lab-diagnostics-2.3-live-candidates';
const MAX_SNAPSHOTS = 300;
let pc = null, channel = null, role = null, report = null;
let timer = null, pendingSnapshot = null, snapshotCount = 0;
let started = 0;
let probeSerial = 0;
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
async function init(){
  clearInterval(timer);
  if(pc) {
    await capture('antes de reiniciar');
    pc.close();
  }
  started=performance.now();
  probeSerial=0;pendingProbes.clear();
  report={
    version:VERSION,createdUTC:iso(),role:$('role').value,
    environment:environment(),config:{iceServers:[],iceTransportPolicy:'all'},
    events:[],snapshots:[],localDescriptions:[],remoteDescriptions:[],
    iceCandidateEvents:[],sdpExchanges:[],probeRoundTrips:[],
    liveCandidates:{local:[],remote:[]},
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
      publishLocal();
      setStatus(complete ? 'Oferta completa: envíala al participante' :
        'Oferta preparada sin completar ICE: comprueba los candidatos antes de enviarla');
    } else setStatus('Participante preparado: pega la oferta del maestro');
    await capture('inicialización completada');
  }catch(error){handleError('crear conexión',error)}
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
$('start').onclick=()=>init().catch(e=>handleError('iniciar',e));
$('apply').onclick=()=>apply().catch(e=>handleError('aplicar descripción',e));
$('copy').onclick=()=>copyText($('out').value);
$('send').onclick=send;
$('stats').onclick=()=>capture('solicitada manualmente').catch(e=>handleError('getStats',e));
$('export').onclick=download;
$('copySummary').onclick=()=>copyText(diagnosticSummary());
$('copyFull').onclick=()=>copyText(JSON.stringify(fullReport(),null,2));
$('copyCandidates').onclick=()=>copyText(candidateTextToCopy());
setupEvents();
