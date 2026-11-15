/* VWOMA | Automatic iPhone Personal Hotspot ICE compatibility.
 * When a participant receives an offer whose host ICE candidate has a
 * privacy-preserving .local name, test an additional direct route to the
 * usual iPhone Personal Hotspot gateway without altering the original route.
 * The gateway address is a candidate, NOT a verified router address.
 * Never rewrite real IP candidates or synthesize UDP ports.
 */
(function registerHotspotIce(root) {
  'use strict';
  const IP='172.20.10.1',MAX_SDP_BYTES=100000,MAX_DIRECT=16;
  const CANDIDATE=/^a=candidate:([^\r\n]+)$/;
  function withHotspotCandidates(description,enabled) {
    if(!description || typeof description.sdp!=='string')
      return {description,added:0,status:'invalid'};
    if(!enabled)return {description,added:0,status:'disabled'};
    const sdp=description.sdp;
    const newline=sdp.includes('\r\n')?'\r\n':'\n';
    const lines=sdp.split(/\r?\n/),originals=new Set(),addedKeys=new Set();
    let section=-1;
    for(const line of lines){
      if(line.startsWith('m='))section++;
      const candidate=line.match(CANDIDATE);
      if(!candidate)continue;
      const parts=candidate[1].trim().split(/\s+/);
      if(parts.length<8 || parts[2]?.toLowerCase()!=='udp'||parts[4]!==IP||
          parts[6]!=='typ'||parts[7]!=='host')continue;
      originals.add(section+':'+parts[1]+':'+parts[5]);
    }
    const out=[];section=-1;let added=0,eligible=0;
    for(const line of lines){
      if(line.startsWith('m='))section++;
      const matched=line.match(CANDIDATE);
      if(!matched){out.push(line);continue;}
      const parts=matched[1].trim().split(/\s+/);
      if(parts.length<8||parts[2]?.toLowerCase()!=='udp'||
        parts[6]!=='typ'||parts[7]!=='host'||!/\.local$/i.test(parts[4])){
        out.push(line);continue;
      }
      const port=Number(parts[5]),priority=Number(parts[3]);
      if(!Number.isSafeInteger(port)||port<1||port>65535||
          !Number.isSafeInteger(priority)||priority<1||priority>4294967295){
        out.push(line);continue;
      }
      eligible++;
      const key=section+':'+parts[1]+':'+parts[5];
      if(originals.has(key)||addedKeys.has(key)||added>=MAX_DIRECT){
        out.push(line);continue;
      }
      addedKeys.add(key);added++;
      // Keep all original ICE credentials, candidate attributes and UDP port.
      // Give the direct host route a slightly higher priority, so that ICE
      // can try it early, but retain the .local route as a normal fallback.
      const direct=parts.slice();
      direct[0]='vh'+added;
      direct[3]=String(Math.min(4294967295,priority+128));
      direct[4]=IP;
      out.push('a=candidate:'+direct.join(' '));
      out.push(line);
    }
    if(!added)return {description,added:0,eligible,status:eligible?'already-present':'no-mdns-host'};
    const modified=out.join(newline);
    if(modified.length>MAX_SDP_BYTES)
      return {description,added:0,eligible,status:'too-large'};
    return {description:{...description,sdp:modified},added,eligible,status:'added',gateway:IP};
  }
  const api=Object.freeze({IP,withHotspotCandidates});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMAIceHotspot=api;
})(globalThis);
