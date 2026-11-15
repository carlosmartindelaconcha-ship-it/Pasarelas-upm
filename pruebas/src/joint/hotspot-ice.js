/* VWOMA | ICE D (detección automática): conserva el experimento C validado.
 * En modo local, el participante inspecciona sus propios candidatos ICE con
 * una RTCPeerConnection provisional, cerrada antes de negociar la definitiva.
 * Si se reconoce la red 172.20.10.0/28 y una oferta mDNS, sustituye .local
 * por 172.20.10.1, preservando el puerto, foundation, prioridad y credenciales.
 * Si la red no puede identificarse con seguridad, no altera la oferta.
 * El modo STUN, el maestro y las respuestas quedan completamente intactos.
 */
(function registerHotspotIce(root) {
  'use strict';
  const IP='172.20.10.1';
  function validIPv4(address) {
    const octets=address.split('.');
    return octets.length===4 && octets.every(x=>
      /^\d{1,3}$/.test(x) && Number(x)>=0 && Number(x)<=255 && String(Number(x))===x);
  }
  // Copiado del procedimiento probado en webrtc-lab/test.js.
  function replaceRemoteMdnsWithIP(description,address) {
    if(!validIPv4(address))throw Error('Introduce una IPv4 válida; consulta «Router» en el Wi-Fi del participante');
    const changed=[];
    const modified=description.sdp.replace(/^a=candidate:([^\r\n]+)$/gm,(line,body)=>{
      const parts=body.trim().split(/\s+/);
      const typeIndex=parts.indexOf('typ');
      if(parts.length<8 || typeIndex<0 || parts[typeIndex+1]!=='host' ||
         !/\.local$/i.test(parts[4]) || parts[2].toLowerCase()!=='udp')return line;
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
  // Probado en el laboratorio ICE D: el detector no modifica el SDP.
  function autoDecide(description,localCandidateLines) {
    if(!description || description.type!=='offer' || typeof description.sdp!=='string')
      throw Error('D necesita una oferta SDP válida.');
    const remoteCandidates=description.sdp.split(/\r?\n/).filter(line=>line.startsWith('a=candidate:'));
    const remoteMdns=remoteCandidates.some(line=>{
      const p=line.slice('a=candidate:'.length).trim().split(/\s+/);
      const i=p.indexOf('typ');
      return p.length>=8 && p[2]?.toLowerCase()==='udp' &&
        i>=0 && p[i+1]==='host' && /\.local$/i.test(p[4]);
    });
    const guestIPv4=[];
    for(const item of (Array.isArray(localCandidateLines)?localCandidateLines:[])){
      const line=typeof item==='string'?item.trim():'';
      const raw=line.startsWith('a=candidate:')?line.slice('a=candidate:'.length):
        line.startsWith('candidate:')?line.slice('candidate:'.length):null;
      if(raw===null)continue;
      const p=raw.split(/\s+/),i=p.indexOf('typ');
      if(p.length<8 || p[1]!=='1' || p[2]?.toLowerCase()!=='udp' ||
         i<0 || p[i+1]!=='host' || !validIPv4(p[4]))continue;
      if(!guestIPv4.includes(p[4]))guestIPv4.push(p[4]);
    }
    const hotspotIPs=guestIPv4.filter(ip=>{
      const m=/^172\.20\.10\.(\d+)$/.exec(ip);
      return m && Number(m[1])>=2 && Number(m[1])<=14;
    });
    const otherIPs=guestIPv4.filter(ip=>!hotspotIPs.includes(ip));
    let reason,action='normal',address=null;
    if(!remoteMdns){
      reason='La oferta no contiene candidatos UDP host .local; no hace falta sustituir nada.';
    }else if(hotspotIPs.length===1 && otherIPs.length===0){
      action='replace';address='172.20.10.1';
      reason='Participante con IP '+hotspotIPs[0]+' en la red 172.20.10.0/28 y oferta mDNS: aplicar sustitución C hacia '+address+'.';
    }else if(hotspotIPs.length>0 && (hotspotIPs.length!==1 || otherIPs.length>0)){
      reason='Varias direcciones locales o interfaces potencialmente ambiguas: conservar el SDP original.';
    }else{
      reason='No se reconoce la red 172.20.10.0/28 en los candidatos propios: conservar el SDP original.';
    }
    return {action,address,reason,remoteMdns,guestIPv4,hotspotIPs};
  }

  // Sonda de red provisional sin servidores ICE; se cierra incluso si falla.
  async function probeLocalICECandidates(timeoutMs=2400){
    const probe=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all'});
    const candidates=[];
    const start=performance.now();
    let finishedBy='complete';
    try {
      probe.onicecandidate=e=>{
        if(e.candidate?.candidate)candidates.push(e.candidate.candidate);
      };
      probe.createDataChannel('vwoma-auto-ice-probe');
      const offer=await probe.createOffer();
      await probe.setLocalDescription(offer);
      if(probe.iceGatheringState!=='complete'){
        finishedBy=await new Promise(resolve=>{
          let settled=false,timeout;
          const finish=why=>{
            if(settled)return;
            settled=true;
            clearTimeout(timeout);
            probe.removeEventListener('icegatheringstatechange',check);
            resolve(why);
          };
          const check=()=>{if(probe.iceGatheringState==='complete')finish('complete');};
          probe.addEventListener('icegatheringstatechange',check);
          timeout=setTimeout(()=>finish('timeout'),timeoutMs);
          check();
        });
      }
      const fromSDP=probe.localDescription?.sdp?.split(/\r?\n/)
        .filter(line=>line.startsWith('a=candidate:'))||[];
      return {
        candidateLines:[...new Set([...candidates,...fromSDP])],
        completed:finishedBy==='complete',finishedBy,
        durationMs:Math.round(performance.now()-start),
        gatheringState:probe.iceGatheringState
      };
    } finally {
      probe.onicecandidate=null;
      probe.close();
    }
  }

  // En una oferta sin candidatos mDNS, conservar la negociación normal.
  function useLabReplacement(description,enabled) {
    if(!description || typeof description.sdp!=='string')
      return {description,replaced:0,status:'invalid'};
    if(!enabled)return {description,replaced:0,status:'disabled'};
    const eligible=description.sdp.split(/\r?\n/).some(line=>{
      if(!line.startsWith('a=candidate:'))return false;
      const parts=line.slice(12).trim().split(/\s+/);
      const typeIndex=parts.indexOf('typ');
      return parts.length>=8 && typeIndex>=0 && parts[typeIndex+1]==='host' &&
        /\.local$/i.test(parts[4]) && parts[2].toLowerCase()==='udp';
    });
    if(!eligible)return {description,replaced:0,status:'no-mdns-host'};
    const result=replaceRemoteMdnsWithIP(description,IP);
    return {...result,replaced:result.changed.length,status:'replaced'};
  }
  const api=Object.freeze({IP,validIPv4,replaceRemoteMdnsWithIP,useLabReplacement,autoDecide,probeLocalICECandidates});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMAIceHotspot=api;
})(globalThis);
