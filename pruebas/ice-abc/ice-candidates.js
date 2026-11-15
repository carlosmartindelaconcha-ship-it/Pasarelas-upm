/* VWOMA ICE ABC - pure, testable candidates transformations.
 * A: original SDP. B: experiment retaining the original foundation,
 *    lowering only the new candidate priority by 256 and changing its IP.
 *    C: EXACT mDNS-replacement procedure
 *    copied from the working webrtc-lab/test.js.
 * No WebRTC network actions or browser storage here.
 */
(function registerIceABC(root) {
'use strict';
const VALID_MODES=Object.freeze(['normal','add','replace']);
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

function addRemoteMdnsCandidates(description,address) {
  if(!validIPv4(address))throw Error('Introduce una IPv4 válida.');
  if(!description || typeof description.sdp!=='string')throw Error('Descripción SDP inválida.');
  const lines=description.sdp.split(/\r?\n/);
  const newline=description.sdp.includes('\r\n')?'\r\n':'\n';
  const out=[], changed=[];
  let mediaSection=-1;
  const present=new Set();
  // If an IP:port already exists for this media section/component, do not
  // invent a third redundant candidate for the same socket.
  for(const line of lines){
    if(line.startsWith('m='))mediaSection++;
    if(!line.startsWith('a=candidate:'))continue;
    const p=line.slice(12).trim().split(/\s+/);
    if(p.length>=8 && p[2]?.toLowerCase()==='udp' &&
       p[4]===address && p[6]==='typ' && p[7]==='host')
      present.add([mediaSection,p[1],p[5]].join(':'));
  }
  mediaSection=-1;
  for(const line of lines){
    if(line.startsWith('m='))mediaSection++;
    if(!line.startsWith('a=candidate:')){out.push(line);continue;}
    const parts=line.slice(12).trim().split(/\s+/);
    const typ=parts.indexOf('typ');
    const priority=Number(parts[3]);
    if(parts.length<8 || typ<0 || parts[typ+1]!=='host' ||
       parts[2].toLowerCase()!=='udp' || !/\.local$/i.test(parts[4]) ||
       !Number.isSafeInteger(priority) || priority<=256 || priority>4294967295 ||
       !Number.isInteger(Number(parts[5])) || Number(parts[5])<1 || Number(parts[5])>65535){
       out.push(line);continue;
    }
    const key=[mediaSection,parts[1],parts[5]].join(':');
    if(!present.has(key)){
      const clone=parts.slice();
      // Same foundation as the original mDNS candidate (hypothesis under
      // test). Change only IP and priority; 256 preserves component bits.
      clone[3]=String(priority-256);
      clone[4]=address;
      const candidate='a=candidate:'+clone.join(' ');
      out.push(candidate);
      changed.push({
        originalHost:parts[4],replacementIP:address,originalPort:parts[5],
        originalFoundation:parts[0],addedFoundation:clone[0],
        originalPriority:parts[3],addedPriority:clone[3],
        originalCandidate:line,addedCandidate:candidate
      });
      present.add(key);
    }
    out.push(line);
  }
  if(!changed.length)throw Error('No existen candidatos UDP host .local nuevos para añadir.');
  return {description:{type:description.type,sdp:out.join(newline)},changed};
}
function transform(description,mode,address) {
  if(!VALID_MODES.includes(mode))throw Error('Estrategia ICE desconocida.');
  if(!description || !['offer','answer'].includes(description.type) || typeof description.sdp!=='string')
    throw Error('Descripción ICE remota no válida.');
  if(mode==='normal')return {description,changed:[],mode:'normal'};
  const result=mode==='add'
    ? addRemoteMdnsCandidates(description,address)
    : replaceRemoteMdnsWithIP(description,address);
  return {...result,mode};
}
const api=Object.freeze({VALID_MODES,validIPv4,replaceRemoteMdnsWithIP,addRemoteMdnsCandidates,transform});
if(typeof module==='object' && module.exports)module.exports=api;
else root.IceABC=api;
})(globalThis);
