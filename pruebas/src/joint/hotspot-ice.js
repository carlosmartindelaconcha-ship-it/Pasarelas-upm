/* VWOMA | Fase 1: reproducción literal del experimento mDNS/IP del laboratorio.
 * Solo se altera la DIRECCIÓN de los candidatos UDP host *.local del maestro.
 * El puerto, fundamento, prioridad y credenciales ICE permanecen idénticos.
 * No se añaden candidatos. Se aplica únicamente al participante al recibir
 * una oferta de conexión local; la IP fija es experimental.
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
  const api=Object.freeze({IP,validIPv4,replaceRemoteMdnsWithIP,useLabReplacement});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMAIceHotspot=api;
})(globalThis);
