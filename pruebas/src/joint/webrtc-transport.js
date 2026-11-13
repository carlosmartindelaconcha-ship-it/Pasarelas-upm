/* VWOMA | WebRTC data channels and manual QR/SDP signaling.
 * Retains the original ICE, STUN, timeout, diagnostics and pairing behavior.
 * Dependencies on application state, UI, clock synchronization and events
 * are injected by joint-app.js; no server and no bundler are required.
 */
(function registerTransport(root) {
    'use strict';
    function createTransport({ s, VERSION, STUN_SERVERS, MAX_PEERS, MAX_TOKEN, MAX_MESSAGE, QR_CHUNK_SIZE, MAX_QR_PAGES, uid, now, finite, $, running, tell, incident, guard, tab, open, workspace, requireHostEdit, localStatus, renderDevices, savePlan, renderPlan, startSync, onMessage, revealActionTarget=()=>{} }) {
    // Bidirectional manual signaling, compressible QR; never send SDP to a service.
    async function encodeToken(payload) {
        const bytes=new TextEncoder().encode(JSON.stringify(payload));
        let data=bytes, prefix='J1.';
        if(typeof CompressionStream!=='undefined') {
            data=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); prefix='J1z.';
        }
        return prefix+btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    async function decodeToken(raw) {
        let token=raw.trim();
        if(token.startsWith('https://')||token.startsWith('http://')) token=new URL(token).hash.replace(/^#joint=/,'');
        if(token.length>MAX_TOKEN || !/^J1z?\.[\w-]+$/.test(token)) throw Error('El código no es una invitación o respuesta válida.');
        const [prefix,b64]=token.split('.');
        const data=Uint8Array.from(atob(b64.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        let decoded=data;
        if(prefix==='J1z') {
            if(typeof DecompressionStream==='undefined') throw Error('Este navegador no admite códigos comprimidos. Actualiza el navegador.');
            const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
            const chunks=[]; let count=0;
            while(true) {const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>100000){await reader.cancel();throw Error('Código demasiado grande.');}chunks.push(value);}
            decoded=new Uint8Array(count);let offset=0;for(const chunk of chunks){decoded.set(chunk,offset);offset+=chunk.length;}
        }
        const t=JSON.parse(new TextDecoder().decode(decoded));
        if(t.v!==VERSION || !['offer','answer'].includes(t.kind) || typeof t.session!=='string' || typeof t.peer!=='string' || typeof t.host!=='string' || !t.sdp || t.sdp.type!==t.kind || typeof t.sdp.sdp!=='string' || t.sdp.sdp.length>60000 || !finite(t.expires) || Date.now()>t.expires) throw Error('Código caducado o incompatible. Genera una nueva invitación.');
        if(!['local','stun'].includes(t.network))throw Error('Modo de conexión incompatible. Recarga la web en ambos móviles y crea una invitación nueva.');
        // STUN discovers addresses; it does not relay measurement data or prove LAN routing.
        const candidates=t.sdp.sdp.split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
        const allowed=t.network==='local'?/ typ host(?: |$)/:/ typ (?:host|srflx|prflx)(?: |$)/;
        if(!candidates.length || candidates.some(l=>!allowed.test(l))) throw Error('El código no contiene direcciones admitidas para ese modo de conexión.');
        return t;
    }
    function stopQrCycle() {
        clearInterval(s.qrPageTimer);s.qrPageTimer=null;s.qrPages=[];s.qrPageIndex=0;
    }
    function qrTransferPages(code) {
        const transfer=uid().replace(/-/g,'').slice(0,12),pages=[];
        for(let index=0;index<code.length;index+=QR_CHUNK_SIZE)pages.push(code.slice(index,index+QR_CHUNK_SIZE));
        if(!pages.length||pages.length>MAX_QR_PAGES)throw Error('El código de conexión es demasiado grande para compartirlo por QR. Usa Copiar código.');
        return pages.map((chunk,index)=>'JQ1.'+transfer+'.'+(index+1)+'.'+pages.length+'.'+chunk);
    }
    function renderQrPage() {
        const pages=s.qrPages;if(!pages.length)return;
        const page=pages[s.qrPageIndex];$('jointQr').replaceChildren();
        if(typeof qrcode!=='function'){$('jointQr').textContent='El generador QR no se ha cargado. Utiliza Copiar código.';return;}
        try {
            const qr=qrcode(0,'L');qr.addData(page);qr.make();
            $('jointQr').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true})+'<p class="joint-help">QR '+(s.qrPageIndex+1)+' de '+pages.length+' · mantén la cámara enfocada hasta completar todos.</p>';
        } catch(e) {$('jointQr').textContent='No se pudo crear esta página QR. Utiliza Copiar código.';}
    }
    function acceptQrPage(raw) {
        const value=String(raw||'').trim();
        const match=value.match(/^JQ1\.([a-f0-9]{12})\.(\d{1,3})\.(\d{1,3})\.([.\w-]+)$/i);
        if(!match)return value;
        const [,transfer,indexText,totalText,chunk]=match,index=Number(indexText),total=Number(totalText);
        if(!Number.isInteger(index)||!Number.isInteger(total)||total<1||total>MAX_QR_PAGES||index<1||index>total||chunk.length>QR_CHUNK_SIZE)throw Error('Página QR de conexión no válida.');
        if(!s.qrInbound||s.qrInbound.transfer!==transfer||s.qrInbound.total!==total)s.qrInbound={transfer,total,pages:Array(total)};
        s.qrInbound.pages[index-1]=chunk;
        const received=s.qrInbound.pages.filter(Boolean).length;
        $('jointPairStatus').textContent='QR recibido: '+received+' de '+total+' páginas.';
        if(received!==total)return null;
        const complete=s.qrInbound.pages.join('');s.qrInbound=null;return complete;
    }
    async function showToken(payload) {
        const code=await encodeToken(payload);
        const link=payload.kind==='offer'?location.href.split('#')[0]+'#joint='+code:code;
        $('jointPairOutput').value=link; $('jointPairOutput').hidden=false; $('jointCopyCode').hidden=false;
        stopQrCycle();s.qrPages=qrTransferPages(code);renderQrPage();
        revealActionTarget('jointQr','center');
        if(s.qrPages.length>1)s.qrPageTimer=setInterval(()=>{s.qrPageIndex=(s.qrPageIndex+1)%s.qrPages.length;renderQrPage();},1800);
    }
    function openPair(mode='join') {
        $('jointPairTitle').textContent=mode==='offer'?'Invitar a un móvil':'Leer invitación o respuesta';
        $('jointPairHelp').textContent=mode==='offer'?'El participante lee esta invitación. Después, lee aquí su respuesta para completar la conexión.':'Escanea el QR o pega el código completo del otro móvil.';
        stopQrCycle();$('jointPairOutput').hidden=true; $('jointCopyCode').hidden=true; $('jointQr').replaceChildren(); $('jointPairInput').value=''; $('jointPairStatus').textContent='';
        $('jointGenerateAnswer').hidden=true;
        $('jointPairDiagnostics').hidden=true;$('jointPairDiagnosticsText').textContent='';
        $('jointNetworkMode').disabled=s.role==='guest';
        updateAndroidNearbyNotice();
        if(!$('jointPairDialog').open)$('jointPairDialog').showModal();
    }
    function browserLabel() {
        const ua=navigator.userAgent||'';
        if(/iPhone|iPad|iPod/.test(ua))return 'Safari/WebKit en iPhone o iPad';
        if(/Android/.test(ua)&&/Chrome\//.test(ua))return 'Chrome en Android';
        if(/Edg\//.test(ua))return 'Microsoft Edge en ordenador';
        if(/Firefox\//.test(ua))return 'Firefox en ordenador';
        if(/Chrome\//.test(ua))return 'Chrome en ordenador';
        if(/Safari\//.test(ua)&&!/Chrome\//.test(ua))return 'Safari/WebKit';
        return 'Navegador no identificado';
    }
    function isAndroidChrome() {
        const ua=navigator.userAgent||'';
        return /Android/.test(ua)&&/Chrome\//.test(ua)&&!/EdgA\//.test(ua)&&!/OPR\//.test(ua);
    }
    function updateAndroidNearbyNotice() {
        const notice=$('jointAndroidNearbyNotice');
        if(notice)notice.hidden=!isAndroidChrome();
    }
    function diagnosticEvent(p,event,detail='') {
        if(!p)return;
        if(!p.diagnostics)p.diagnostics=[];
        p.diagnostics.push({ms:Math.max(0,Math.round(now()-(p.createdAt||now()))),event:String(event),detail:String(detail).slice(0,240)});
        if(p.diagnostics.length>80)p.diagnostics.shift();
    }
    function diagnosticText(p,stage,error='') {
        const stunErrors=(p?.diagnostics||[]).filter(row=>row.event==='error STUN');
        const explanation=stunErrors.some(row=>/^701\b/.test(row.detail))?'El código 701 significa que este móvil no pudo alcanzar el servidor STUN.':'';
        const lines=[
            'Diagnóstico de conexión v4',
            'Etapa: '+stage,
            'Navegador: '+browserLabel(),
            'Modo: '+(p?.network||$('jointNetworkMode').value),
            'Alternativas hotspot: '+(p?.hotspotAlternativeStatus==='added'
                ?p.hotspotAlternatives+' rutas 172.20.10.1 (puertos UDP originales)'
                :p?.hotspotAlternativeStatus||'no evaluado'),
            'Permiso de cámara concedido en esta sesión: '+(s.capturePermission?'sí':'no o desconocido'),
            'Estado: '+(p?(p.failureDetails||pairingDetails(p)):'sin conexión creada'),
            ...(p?['Candidatos propios:',...candidateDetails(p.pc.localDescription).map(row=>'· '+row),'Candidatos del otro extremo:',...candidateDetails(p.pc.remoteDescription).map(row=>'· '+row)]:[]),
            error?'Error: '+error:'',
            explanation,
            ...(p?.iceStats?.pairs?.length?['', 'Pares ICE · última instantánea ('+p.iceStats.label+'):', ...p.iceStats.pairs.map(row=>'· '+row)]:[]),
            ...(p?.iceStats?.note?['', 'Pares ICE: '+p.iceStats.note]:[]),
            '',
            'Eventos:',
            ...(p?.diagnostics||[]).map(row=>'+'+row.ms+' ms · '+row.event+(row.detail?' · '+row.detail:''))
        ];
        return lines.filter((line,index)=>line||index>=8).join('\n').trim();
    }
    function showPairDiagnostic(p,stage,error='') {
        const value=diagnosticText(p,stage,error);s.lastPairDiagnostic=value;
        $('jointPairDiagnosticsText').textContent=value;$('jointPairDiagnostics').hidden=false;
        return value;
    }
    function pairingError(p,stage,message) {
        showPairDiagnostic(p,stage,message);
        const error=Error(message);error.pairDiagnostic=true;return error;
    }
    async function gather(pc) {
        const p=pc.__jointPeer;diagnosticEvent(p,'búsqueda ICE',pc.iceGatheringState);
        if(pc.iceGatheringState==='complete'){diagnosticEvent(p,'búsqueda ICE terminada',candidateSummary(pc.localDescription));return true;}
        return await new Promise((resolve,reject)=>{
            let settled=false;
            const finish=(value,error)=>{
                if(settled)return;settled=true;clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange',stateListener);
                pc.removeEventListener('icecandidate',candidateListener);
                if(error)reject(error);else resolve(value);
            };
            const enough=()=>{
                const sdp=pc.localDescription?.sdp||'';
                const srflx=/^a=candidate:.* typ srflx(?: |\r?$)/m.test(sdp);
                return p?.network==='stun'&&srflx;
            };
            const timer=setTimeout(()=>{
                if(p?.network==='local'){
                    finish(false,pairingError(p,'búsqueda de direcciones','La búsqueda de direcciones locales no terminó en 15 segundos. Se descarta este intento para no crear un QR incompleto. Reinicia el emparejamiento.'));
                    return;
                }
                // An unreachable STUN server must not discard usable local candidates.
                if(/^a=candidate:/m.test(pc.localDescription?.sdp||'')){
                    diagnosticEvent(p,'límite de 20 s',candidateSummary(pc.localDescription));finish(false);
                }else finish(false,pairingError(p,'búsqueda de direcciones','No se han encontrado direcciones de conexión. Abre el diagnóstico para comprobar si Safari ha filtrado las direcciones o si STUN ha devuelto un error.'));
            },p?.network==='local'?15000:20000);
            function stateListener(){
                diagnosticEvent(p,'estado de búsqueda ICE',pc.iceGatheringState);
                if(pc.iceGatheringState==='complete'){
                    if(p?.network==='local'&&!/^a=candidate:.* typ host(?: |\r?$)/m.test(pc.localDescription?.sdp||''))finish(false,pairingError(p,'búsqueda de direcciones','La búsqueda local terminó sin direcciones host utilizables. Reinicia el emparejamiento.'));
                    else {diagnosticEvent(p,'búsqueda ICE terminada',candidateSummary(pc.localDescription));finish(true);}
                }
            }
            function candidateListener(e){
                if(e.candidate&&enough()){
                    diagnosticEvent(p,'candidatos suficientes para el código',candidateSummary(pc.localDescription));finish(false);
                }
            }
            pc.addEventListener('icegatheringstatechange',stateListener);
            pc.addEventListener('icecandidate',candidateListener);stateListener();
        });
    }
    function candidateSummary(description) {
        const rows=(description?.sdp||'').split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
        const host=rows.filter(l=>/ typ host(?: |$)/.test(l));
        const mdns=host.filter(l=>/\.local(?: |$)/i.test(l)).length;
        const srflx=rows.filter(l=>/ typ srflx(?: |$)/.test(l)).length;
        return 'locales '+host.length+' (mDNS '+mdns+'), STUN '+srflx;
    }
    function parsedCandidates(description) {
        return (description?.sdp||'').split(/\r?\n/).filter(line=>line.startsWith('a=candidate:')).map(line=>{
            const match=line.match(/^a=candidate:\S+\s+\d+\s+(\S+)\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)(?:.*?\stcptype\s+(\S+))?/i);
            return match?{protocol:String(match[1]).toUpperCase(),address:String(match[2]),port:String(match[3]),type:String(match[4]).toLowerCase(),tcpType:String(match[5]||'').toLowerCase()}:null;
        }).filter(Boolean);
    }
    function candidateEndpoint(candidate) {
        const address=String(candidate?.address||candidate?.ip||'?'),port=candidate?.port??'?';
        return address.includes(':')?'['+address+']:'+port:address+':'+port;
    }
    function candidateLabel(candidate, fallbacks=[]) {
        if(!candidate)return 'sin candidato';
        const port=String(candidate.port??'');
        const protocol=String(candidate.protocol||'').toLowerCase();
        const type=String(candidate.candidateType||candidate.type||'').toLowerCase();
        const fallback=fallbacks.find(row=>String(row.port)===port&&String(row.protocol||'').toLowerCase()===protocol&&(!type||row.type===type));
        const display=(String(candidate.address||candidate.ip||'')&&String(candidate.address||candidate.ip||'')!=='?')?candidate:(fallback?{...candidate,address:fallback.address,port:fallback.port,type:fallback.type,tcpType:candidate.tcpType||fallback.tcpType}:candidate);
        return [String(display.protocol||'?').toUpperCase(),String(display.candidateType||display.type||'?').toLowerCase(),candidateEndpoint(display),display.tcpType].filter(Boolean).join(' · ');
    }
    function candidateDetails(description) {
        const rows=parsedCandidates(description);return rows.length?rows.map(row=>candidateLabel(row)):['ninguno'];
    }
    function icePairSnapshot(stats, localDescription, remoteDescription) {
        const reports=new Map();stats.forEach(report=>reports.set(report.id,report));
        const localFallbacks=parsedCandidates(localDescription),remoteFallbacks=parsedCandidates(remoteDescription);
        const rank={succeeded:0,'in-progress':1,inprogress:1,waiting:2,frozen:3,failed:4};
        const pairs=[];
        stats.forEach(report=>{
            if(report.type!=='candidate-pair')return;
            const state=String(report.state||'desconocido'),local=reports.get(report.localCandidateId),remote=reports.get(report.remoteCandidateId);
            const sent=Number.isFinite(report.requestsSent)?report.requestsSent:'—',received=Number.isFinite(report.responsesReceived)?report.responsesReceived:'—';
            pairs.push({rank:rank[state]??5,text:state+(report.nominated?' · nominada':'')+' · '+candidateLabel(local,localFallbacks)+' → '+candidateLabel(remote,remoteFallbacks)+' · comprobaciones '+sent+' / respuestas '+received});
        });
        return pairs.sort((a,b)=>a.rank-b.rank).slice(0,16).map(pair=>pair.text);
    }
    async function captureIceStats(p,label) {
        if(!p?.pc?.getStats||p.iceStatsPending)return;
        p.iceStatsPending=true;
        try {
            const pairs=icePairSnapshot(await p.pc.getStats(),p.pc.localDescription,p.pc.remoteDescription);
            // Algunos navegadores vacían getStats() al cerrar RTCPeerConnection.
            // Conservamos la última instantánea útil: es la que explica el fallo.
            if(pairs.length||!p.iceStats?.pairs?.length){
                p.iceStats={label,pairs,note:pairs.length?'':'El navegador no expuso parejas ICE todavía.'};
            }else{
                p.iceStats={...p.iceStats,note:'La consulta final ya no expuso parejas ICE; se conserva la última instantánea útil ('+p.iceStats.label+').'};
            }
            diagnosticEvent(p,'instantánea de pares ICE',label+' · '+pairs.length+' parejas');
        } catch(error) {p.iceStats={label,pairs:[],note:'No se pudieron consultar las parejas ICE: '+String(error?.name||'error')};}
        finally {
            p.iceStatsPending=false;
            if(p.pairFailed)showPairDiagnostic(p,p.failureStage||'apertura del canal',p.failureMessage||'');
        }
    }
    function scheduleIceStats(p) {
        if(p.iceStatsTimers)return;
        p.iceStatsTimers=[300,1200,3500,8000,14000].map(delay=>setTimeout(()=>{
            if(s.peers.get(p.id)===p&&!p.pairFailed&&!p.opened)captureIceStats(p,'muestra '+(delay/1000)+' s');
        },delay));
    }
    function pairingDetails(p) {
        return 'ICE: '+p.pc.iceConnectionState+' · enlace: '+p.pc.connectionState+' · canal: '+(p.channel?.readyState||'pendiente')+' · modo: '+p.network+' · este móvil: '+candidateSummary(p.pc.localDescription)+' · otro móvil: '+candidateSummary(p.pc.remoteDescription);
    }
    function pairStatus(p, message) {
        if(s.peers.get(p.id)!==p || p.pairFailed)return;
        p.pairStatus=message;
        // A background participant must not replace another invitation's status.
        if(s.role==='guest'||s.currentInvite===p.id)$('jointPairStatus').textContent=message;
    }
    function disposePeer(p) {
        clearTimeout(p.pairTimer);p.pairTimer=null;
        (p.iceStatsTimers||[]).forEach(clearTimeout);p.iceStatsTimers=null;
        p.pc.onconnectionstatechange=null;p.pc.oniceconnectionstatechange=null;
        p.pc.onicegatheringstatechange=null;p.pc.onsignalingstatechange=null;
        p.pc.onicecandidate=null;p.pc.onicecandidateerror=null;p.pc.ondatachannel=null;
        if(p.channel){p.channel.onopen=null;p.channel.onclose=null;p.channel.onerror=null;}
        p.pc.close();
    }
    function failPair(p, reason) {
        if(s.peers.get(p.id)!==p||p.pairFailed||p.opened)return;
        const next=p.network==='local'?'Prueba el modo Compatibilidad con punto de acceso (STUN), con Internet disponible.':'Si utilizas un punto de acceso, prueba ambos móviles en un router Wi-Fi común para comparar. STUN no puede superar todos los bloqueos; esta versión no dispone de retransmisión TURN.';
        p.failureDetails=pairingDetails(p);
        const message=reason+' ('+p.failureDetails+'). '+next+' Mantén ambas páginas abiertas. Pulsa Reiniciar emparejamiento y vuelve a intercambiar los dos códigos.';
        p.failureStage='apertura del canal';p.failureMessage=message;
        captureIceStats(p,'fallo');diagnosticEvent(p,'conexión fallida',reason);showPairDiagnostic(p,p.failureStage,message);
        pairStatus(p,message);p.pairFailed=true;disposePeer(p);
        if(s.role==='guest'||s.currentInvite===p.id)tell(message,true);
        renderDevices();
    }
    function watchPair(p, timeout=30000) {
        clearTimeout(p.pairTimer);
        if(p.opened||p.pairFailed||s.peers.get(p.id)!==p)return;
        p.pairTimer=setTimeout(()=>failPair(p,'No se ha abierto el canal en '+Math.round(timeout/1000)+' segundos'),timeout);
    }
    async function setRemoteDescriptionWithHotspot(p,description) {
        // Local-mode ICE only, and only in a browser running on iPhone/iPad.
        // Let the browser choose between all originals and the extra gateway paths.
        const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent||'');
        const enabled=isIOS && p.network==='local';
        const result=root.VWOMAIceHotspot?.withHotspotCandidates(description,enabled)
            || {description,added:0,status:'helper-unavailable'};
        p.hotspotAlternativeStatus=result.status;
        p.hotspotAlternatives=result.added;
        if(result.added)diagnosticEvent(p,'alternativas ICE hotspot',
            result.added+' candidatos 172.20.10.1 (puertos UDP remotos); originales conservados');
        if(!result.added)return p.pc.setRemoteDescription(description);
        try {
            return await p.pc.setRemoteDescription(result.description);
        } catch(error) {
            // WebKit can reject an unexpected candidate; restore normal signaling.
            diagnosticEvent(p,'hotspot no admitido',
                'reintentando SDP original: '+String(error?.name||'error'));
            p.hotspotAlternativeStatus='rejected';
            p.hotspotAlternatives=0;
            return p.pc.setRemoteDescription(description);
        }
    }
    function localDescription(p) {
        const description=p.pc.localDescription;
        const allowed=p.network==='local'?/^a=candidate:.* typ host(?: |\r?$)/m:/^a=candidate:.* typ (?:host|srflx|prflx)(?: |\r?$)/m;
        if(!description || !allowed.test(description.sdp))
            throw pairingError(p,'preparación del código de respuesta','El navegador no ha proporcionado direcciones utilizables. Abre el diagnóstico. En Safari puede ayudar pulsar «Preparar Safari/iPhone» antes de leer de nuevo la invitación.');
        return {type:description.type,sdp:description.sdp};
    }
    async function prepareSafariConnection() {
        if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no permite solicitar acceso a la cámara.');
        $('jointPairStatus').textContent='Solicitando permiso de cámara…';
        let stream;
        try {
            stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});s.capturePermission=true;
            $('jointPairStatus').textContent='Cámara autorizada y detenida. No se está grabando. Lee ahora una invitación nueva.';
        }catch(e){
            const message=e?.name==='NotAllowedError'?'No se ha concedido el permiso de cámara. Safari puede seguir filtrando las direcciones locales.':'No se pudo preparar Safari: '+(e.message||e);
            $('jointPairStatus').textContent=message;throw Error(message);
        }finally{if(stream)stream.getTracks().forEach(track=>track.stop());}
    }
    async function pairingAction(action) {
        if(s.pairBusy)throw Error('Espera a que termine la operación de emparejamiento.');
        s.pairBusy=true;$('jointReadCode').disabled=true;$('jointRetryPair').disabled=true;
        try{return await action();}finally{s.pairBusy=false;$('jointReadCode').disabled=false;$('jointRetryPair').disabled=false;}
    }
    async function retryPair() {
        if(s.pairBusy||running()||s.transaction)throw Error('Espera a que termine la operación actual.');
        await stopScan();
        for(const [id,p] of s.peers)if(p.channel?.readyState!=='open'){
            disposePeer(p);s.peers.delete(id);
            if(s.role==='host')for(const point of s.plan.points)if(point.device===id)point.device=null;
        }
        s.currentInvite=null;s.pendingOffer=null;$('jointGenerateAnswer').hidden=true;
        if(s.role==='host'){savePlan();return pairingAction(invite);}
        if(s.peers.size)throw Error('La conexión ya está abierta. Cierra este cuadro para continuar.');
        s.role=null;s.session=null;s.id=uid();
        $('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        openPair();$('jointPairStatus').textContent='Pide al maestro una invitación nueva. No reutilices la respuesta anterior.';
    }
    function wirePeer(p) {
        const changed=()=>{
            if(s.peers.get(p.id)!==p||p.pairFailed)return;
            diagnosticEvent(p,'estado de conexión','ICE '+p.pc.iceConnectionState+'; enlace '+p.pc.connectionState);
            if(['checking','failed','disconnected'].includes(p.pc.iceConnectionState)||['connecting','failed'].includes(p.pc.connectionState))captureIceStats(p,'estado '+p.pc.iceConnectionState+'/'+p.pc.connectionState);
            if(p.pc.connectionState==='failed'||p.pc.iceConnectionState==='failed'){
                if(s.role==='guest'&&!p.opened){
                    if(p.answerShown)failPair(p,'La conexión local ha fallado antes de abrir el canal. La respuesta no se regenerará automáticamente: crea una invitación nueva para evitar que el maestro lea un código antiguo.');
                    else {diagnosticEvent(p,'fallo ICE aplazado','la respuesta todavía se está preparando');pairStatus(p,'Preparando respuesta; todavía no cierres esta página.');}
                }else failPair(p,'La conexión directa ha fallado');
            }
            else if(!p.opened&&p.answerAccepted)pairStatus(p,'Estableciendo conexión… '+pairingDetails(p));
            if(['disconnected','failed','closed'].includes(p.pc.connectionState)) {
                if(s.run) incident('connection',p.name+': '+p.pc.connectionState);
            }
            renderDevices();
        };
        p.pc.onconnectionstatechange=changed;p.pc.oniceconnectionstatechange=changed;
        p.pc.onicegatheringstatechange=()=>diagnosticEvent(p,'estado ICE',p.pc.iceGatheringState);
        p.pc.onsignalingstatechange=()=>diagnosticEvent(p,'señalización',p.pc.signalingState);
        p.pc.onicecandidate=e=>{
            if(!e.candidate){diagnosticEvent(p,'fin de candidatos');return;}
            const line=e.candidate.candidate||'',type=e.candidate.type||line.match(/ typ (\w+)/)?.[1]||'desconocido';
            const protocol=e.candidate.protocol||line.split(' ')[2]||'protocolo desconocido';
            diagnosticEvent(p,'candidato',type+' · '+protocol);
        };
        p.pc.onicecandidateerror=e=>{
            const code=Number(e.errorCode)||0;
            const meaning=code===701?'no se pudo alcanzar el servidor STUN':String(e.errorText||'error de servidor ICE');
            diagnosticEvent(p,'error STUN',code+' · '+meaning);
            showPairDiagnostic(p,'búsqueda de direcciones',meaning);
        };
        p.pc.ondatachannel=e=>wireChannel(p,e.channel);
    }
    function newPeer(id, network=$('jointNetworkMode').value) {
        if(typeof RTCPeerConnection==='undefined') throw Error('WebRTC no está disponible en este navegador.');
        if(!['local','stun'].includes(network))throw Error('Selecciona un modo de conexión válido.');
        const pc=new RTCPeerConnection({iceServers:network==='stun'?STUN_SERVERS:[]});
        const p={id,network,name:'Móvil '+(s.peers.size+1),pc,createdAt:now(),diagnostics:[],requests:new Map(),samples:[],status:null,model:null,route:null,lastSeen:now(),incoming:null,acks:new Map()};
        pc.__jointPeer=p;diagnosticEvent(p,'conexión creada',network);
        s.peers.set(id,p);wirePeer(p);return p;
    }
    function send(p,msg) {
        if(p.channel?.readyState!=='open') return false;
        try {p.channel.send(JSON.stringify({...msg,v:VERSION,session:s.session}));return true;} catch(e){incident('send',e.message);return false;}
    }
    function broadcast(msg) {for(const p of s.peers.values()) send(p,msg);}
    function wireChannel(p,channel) {
        p.channel=channel;
        channel.onopen=()=>{
            if(p.opened||p.pairFailed||s.peers.get(p.id)!==p)return;
            p.opened=true;clearTimeout(p.pairTimer);p.pairTimer=null;diagnosticEvent(p,'canal de datos','abierto');
            s.pendingOffer=null;$('jointGenerateAnswer').hidden=true;stopQrCycle();
            pairStatus(p,'Conexión establecida. Canal de datos abierto.');
            if(s.role==='guest'||s.currentInvite===p.id){
                if($('jointPairDialog').open)$('jointPairDialog').close();
                stopScan();tab('Devices');
            }
            p.lastSeen=now();send(p,{type:'HELLO',id:s.id,name:s.name,status:localStatus()});
            if(s.role==='host'){send(p,{type:'PLAN',plan:s.plan});startSync(p);}
            tell('Canal de datos establecido. Asigna el móvil a un punto y activa su acelerómetro.');
            checkRoute(p);renderDevices();renderPlan();
        };
        channel.onclose=()=>{incident('connection','Canal cerrado: '+p.name);if(!p.opened)failPair(p,'El canal se ha cerrado antes de conectar');else tell('Se ha cerrado la conexión con '+p.name+'.',true);renderDevices();};
        channel.onerror=()=>{incident('connection','Error de canal: '+p.name);if(!p.opened)failPair(p,'No se ha podido abrir el canal de datos');};
        channel.onmessage=e=>{
            const received=now();
            try {
                if(typeof e.data!=='string'||e.data.length>MAX_MESSAGE) throw Error('Mensaje no admitido.');
                const msg=JSON.parse(e.data);if(msg.v!==VERSION||msg.session!==s.session)return;
                p.lastSeen=received;
                Promise.resolve(onMessage(p,msg,received)).catch(error=>{incident('protocol',error.message);tell(error.message,true);});
            } catch(error){incident('protocol',error.message);}
        };
        // The remote data channel can already be open when datachannel is delivered.
        if(channel.readyState==='open')channel.onopen();
    }
    async function checkRoute(p) {
        try {
            const stats=await p.pc.getStats();let pair;
            stats.forEach(r=>{if(r.type==='transport'&&r.selectedCandidatePairId)pair=stats.get(r.selectedCandidatePairId);});
            if(!pair)stats.forEach(r=>{if(r.type==='candidate-pair'&&r.state==='succeeded'&&r.nominated)pair=r;});
            const a=pair&&stats.get(pair.localCandidateId),b=pair&&stats.get(pair.remoteCandidateId);
            if(a&&b){
                const types=[a.candidateType,b.candidateType];
                p.route=types.includes('relay')?'Ruta con retransmisión TURN':types.every(t=>t==='host')?'Ruta entre candidatos locales (host)':types.some(t=>t==='srflx'||t==='prflx')?'Ruta directa con descubrimiento de direcciones; no certifica recorrido por Wi-Fi':'Ruta no verificable con las estadísticas disponibles';
            }else p.route='Ruta no verificable con las estadísticas disponibles';
        }catch(e){p.route='Ruta pendiente de verificación';}
        renderDevices();
    }
    async function invite() {
        requireHostEdit();
        for(const [id,p] of s.peers) if(p.channel?.readyState!=='open' && p.pc.connectionState!=='connecting'){disposePeer(p);s.peers.delete(id);}
        if(s.peers.size>=MAX_PEERS)throw Error('Máximo 8 participantes en este prototipo.');
        openPair('offer'); $('jointPairStatus').textContent='Preparando invitación…';
        const p=newPeer(uid());s.currentInvite=p.id;wireChannel(p,p.pc.createDataChannel('upm-joint',{ordered:true}));
        try {
            await p.pc.setLocalDescription(await p.pc.createOffer());p.gatherComplete=await gather(p.pc);
            const expires=Date.now()+10*60*1000; p.expires=expires;
            if(s.peers.get(p.id)!==p)return;
            await showToken({v:VERSION,kind:'offer',network:p.network,session:s.session,host:s.id,peer:p.id,name:s.name,expires,sdp:localDescription(p)});
            pairStatus(p,'Invitación válida durante 10 minutos. Esperando respuesta del participante. Direcciones: '+candidateSummary(p.pc.localDescription)+(p.gatherComplete?'':'. Búsqueda limitada a 20 s; se utilizan las direcciones disponibles.'));
            watchPair(p,10*60*1000);
        }catch(e){if(!e.pairDiagnostic)showPairDiagnostic(p,'creación de invitación',e.message||String(e));disposePeer(p);s.peers.delete(p.id);throw e;}
    }
    async function createGuestAnswer() {
        const t=s.pendingOffer;
        if(s.role!=='guest'||!t)throw Error('Primero lee una invitación del maestro.');
        for(const [id,old] of s.peers){if(old.channel?.readyState!=='open'){disposePeer(old);s.peers.delete(id);}}
        const p=newPeer(t.host,t.network);p.name=String(t.name||'Maestro').slice(0,40);
        $('jointGenerateAnswer').disabled=true;$('jointGenerateAnswer').hidden=true;
        $('jointPairOutput').hidden=true;$('jointCopyCode').hidden=true;$('jointQr').replaceChildren();
        try {
            pairStatus(p,'Generando respuesta local completa…');
            await setRemoteDescriptionWithHotspot(p,t.sdp);
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            scheduleIceStats(p);
            p.gatherComplete=await gather(p.pc);
            if(s.peers.get(p.id)!==p||p.pairFailed)return;
            if(['failed','closed'].includes(p.pc.iceConnectionState)||['failed','closed'].includes(p.pc.connectionState)){
                diagnosticEvent(p,'respuesta descartada','ICE falló antes de mostrar el código');
                throw pairingError(p,'creación de respuesta','La conexión ha fallado antes de poder mostrar una respuesta utilizable. Reinicia el emparejamiento.');
            }
            $('jointPairHelp').textContent='Muestra inmediatamente esta respuesta a la cámara que ya está abierta en el maestro. Mantén ambas páginas abiertas.';
            await showToken({v:VERSION,kind:'answer',network:p.network,session:s.session,host:t.host,peer:t.peer,expires:t.expires,sdp:localDescription(p)});
            p.answerShown=true;diagnosticEvent(p,'respuesta mostrada','ICE completo; lista para que la lea el maestro');
            if(!p.opened)pairStatus(p,'Respuesta completa preparada. Muéstrala ahora a la cámara del maestro. Direcciones: '+candidateSummary(p.pc.localDescription)+'.');
            watchPair(p,120000);
        }catch(e){
            if(!e.pairDiagnostic)showPairDiagnostic(p,'creación de respuesta',e.message||String(e));
            if(s.peers.get(p.id)===p){disposePeer(p);s.peers.delete(p.id);}
            throw e;
        }finally{$('jointGenerateAnswer').disabled=false;}
    }
    async function readCode(raw=$('jointPairInput').value) {
        if(running()||s.transaction)throw Error('No se pueden incorporar móviles durante un ensayo.');
        const t=await decodeToken(raw);
        if(t.kind==='offer') {
            if(s.role==='host')throw Error('El maestro debe leer una respuesta, no otra invitación.');
            if(s.peers.size)throw Error('Ya existe una conexión. Sal de la sesión antes de unirte a otra.');
            s.role='guest';s.id=t.peer;s.session=t.session;s.name='Participante';
            $('jointNetworkMode').value=t.network;$('jointNetworkMode').disabled=true;
            s.pendingOffer=t;workspace();
            $('jointPairOutput').hidden=true;$('jointCopyCode').hidden=true;$('jointQr').replaceChildren();
            $('jointPairHelp').textContent='Invitación guardada. Ahora abre «Escanear QR» en el maestro. Cuando su cámara ya muestre imagen, vuelve aquí y pulsa el botón azul.';
            $('jointPairStatus').textContent='Todavía no se ha creado ninguna conexión: así evitamos que la respuesta caduque mientras preparas el otro móvil.';
            $('jointGenerateAnswer').textContent='El maestro ya está escaneando: generar respuesta';$('jointGenerateAnswer').hidden=false;
        } else {
            if(s.role!=='host'||t.session!==s.session||t.host!==s.id)throw Error('Esta respuesta pertenece a otra sesión.');
            const p=s.peers.get(t.peer);if(!p || p.pc.signalingState!=='have-local-offer')throw Error('Invitación no disponible o ya utilizada.');
            if(t.network!==p.network)throw Error('La respuesta usa otro modo de conexión. Genera una invitación nueva.');
            s.currentInvite=p.id;p.answerAccepted=true;watchPair(p);
            try {
                await setRemoteDescriptionWithHotspot(p,t.sdp);
                scheduleIceStats(p);
                if(!p.opened)pairStatus(p,'Respuesta aceptada. Estableciendo conexión… '+pairingDetails(p));
            }catch(e){failPair(p,'No se pudo aceptar la respuesta: '+e.message);throw e;}
        }
    }
    async function stopScan() {if(s.scanFrame)cancelAnimationFrame(s.scanFrame);s.scanFrame=null;if(s.scan)s.scan.getTracks().forEach(t=>t.stop());s.scan=null;$('jointScanner').srcObject=null;$('jointScanner').hidden=true;$('jointStopScan').hidden=true;}
    async function scanCode() {
        if(typeof jsQR!=='function')throw Error('El lector QR no se ha cargado. Puedes pegar el código.');
        await stopScan();
        s.scan=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});s.capturePermission=true;
        const video=$('jointScanner');video.srcObject=s.scan;video.hidden=false;$('jointStopScan').hidden=false;await video.play();
        // Keep the live preview in view, scrolling the dialog, not the page behind it.
        revealActionTarget('jointScanner','center');
        if(s.role==='host'&&s.currentInvite){
            const p=s.peers.get(s.currentInvite);if(p)pairStatus(p,'Cámara preparada. En el participante pulsa ahora «El maestro ya está escaneando: generar respuesta».');
        }
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
        const frame=()=>{
            if(!s.scan)return;
            if(video.readyState>=2) {
                const scale=Math.min(1,1000/video.videoWidth);canvas.width=video.videoWidth*scale;canvas.height=video.videoHeight*scale;
                ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(img.data,img.width,img.height);
                if(result){
                    try {
                        const complete=acceptQrPage(result.data);if(complete){$('jointPairInput').value=complete;stopScan();guard(()=>pairingAction(()=>readCode(complete)))();return;}
                    } catch(error) {stopScan();tell(error.message||String(error),true);$('jointPairStatus').textContent=error.message||String(error);return;}
                }
            }
            s.scanFrame=requestAnimationFrame(frame);
        };frame();
    }


        return Object.freeze({
            encodeToken, decodeToken, stopQrCycle, qrTransferPages, renderQrPage, acceptQrPage, showToken, openPair, browserLabel, isAndroidChrome, updateAndroidNearbyNotice, diagnosticEvent, diagnosticText, showPairDiagnostic, pairingError, gather, candidateSummary, parsedCandidates, candidateEndpoint, candidateLabel, candidateDetails, icePairSnapshot, captureIceStats, scheduleIceStats, pairingDetails, pairStatus, disposePeer, failPair, watchPair, localDescription, prepareSafariConnection, pairingAction, retryPair, wirePeer, newPeer, send, broadcast, wireChannel, checkRoute, invite, createGuestAnswer, readCode, stopScan, scanCode
        });
    }
    const api = Object.freeze({ createTransport });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMATransport = api;
    }
})(globalThis);
