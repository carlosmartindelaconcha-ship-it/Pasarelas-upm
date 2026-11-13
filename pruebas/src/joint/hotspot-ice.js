/* iPhone Personal Hotspot ICE fallback. Try every advertised remote UDP port
 * at the common gateway, without removing the original ICE candidates. */
(function registerHotspotIce(root) {
    'use strict';
    const IP='172.20.10.1';
    const SDP_SAFE_LIMIT=100000;
    const RE=/^a=candidate:\S+[ \t]+(\d+)[ \t]+udp[ \t]+(\d+)[ \t]+(\S+)[ \t]+(\d+)[ \t]+typ[ \t]+(host|srflx|prflx|relay)(?=[ \t]|$)/i;
    function withHotspotCandidates(description,enabled) {
        if(!description || typeof description.sdp!=='string')return {description,added:0,status:'invalid'};
        if(!enabled)return {description,added:0,status:'disabled'};
        const sdp=description.sdp;
        const newline=sdp.includes('\r\n')?'\r\n':'\n';
        const lines=sdp.split(/\r?\n/);
        // Candidate components/ports are scoped to their SDP media section.
        const already=new Set();let media=-1;
        for(const line of lines) {
            if(line.startsWith('m='))media++;
            const m=line.match(RE);
            if(m && m[3]===IP)already.add(media+':'+m[1]+':'+m[4]);
        }
        const seen=new Set(),expanded=[];let added=0,remotePorts=0;
        media=-1;
        for(const line of lines) {
            if(line.startsWith('m='))media++;
            expanded.push(line);
            const m=line.match(RE);
            if(!m)continue;
            const component=m[1],priority=Number(m[2]),port=Number(m[4]);
            if(!Number.isSafeInteger(port)||port<1||port>65535||
               !Number.isSafeInteger(priority)||priority<1||priority>4294967295)continue;
            const key=media+':'+component+':'+port;
            if(seen.has(key))continue;
            seen.add(key);remotePorts++;
            if(already.has(key))continue;
            // Use a fresh foundation. The old candidate remains untouched.
            expanded.push('a=candidate:ihot'+(++added)+' '+component+' udp '
                +Math.max(1,priority-1)+' '+IP+' '+port+' typ host');
        }
        if(!added)return {description,added:0,remotePorts,status:remotePorts?'already-present':'no-udp-ports'};
        const modified=expanded.join(newline);
        if(modified.length>SDP_SAFE_LIMIT)
            return {description,added:0,remotePorts,status:'too-large'};
        return {description:{...description,sdp:modified},added,remotePorts,status:'added'};
    }
    const api=Object.freeze({IP,withHotspotCandidates});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAIceHotspot=api;
})(globalThis);
