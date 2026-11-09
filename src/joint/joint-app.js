/* =========================================================
   MEDIDA CONJUNTA — prototipo estático sin servidor de señalización.
   Relojes de página y eventos DOM, NO timestamps hardware certificados.
   Invitación + respuesta; STUN opcional, sin servidor de retransmisión TURN.
   Todas las duraciones y marcas internas están expresadas en ms.
   ========================================================= */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const root = $('jointApp');
    if (!root) return;
    const VERSION = 4;
    // Only these app-owned endpoints are used; invitation codes cannot inject servers.
    const STUN_SERVERS = [{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
    const MAX_PEERS = 8, MAX_POINTS = 64, MAX_SAMPLES = 500000, MAX_SYNC_SAMPLES = 25000;
    const MAX_TOKEN = 50000, MAX_MESSAGE = 90000, QR_CHUNK_SIZE = 175, MAX_QR_PAGES = 256;
    const activeStates = new Set(['preparing', 'armed', 'recording']);
    const uid = () => {
        if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
        const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
        return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    };
    const now = () => performance.now();
    const finite = Number.isFinite;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const s = {
        id: uid(), name: 'Mi móvil', role: null, session: null, peers: new Map(),
        plan: {length:30, width:3, name:'Ensayo multipunto', points:[]}, selected:null,
        sensor:false, sensorEnabled:false, sensorSource:'', lastSample:0, recent:[], rateTimes:[],
        calibration:{map:{},active:null,complete:false},
        run:null, pending:null, results:new Map(), preview:[], transfer:null,
        scan:null, scanFrame:null, currentInvite:null, pairBusy:false, capturePermission:false,
        pendingOffer:null, qrPages:[], qrPageIndex:0, qrPageTimer:null, qrInbound:null,
        lastPairDiagnostic:'', drag:null, planView:null, planPan:null, planPointers:new Map(), planPinch:null, planTapStart:null, lastPlanTap:null, rowSwipe:null,
        syncModel:{offset:0, drift:0, reference:0, rtt:null, count:0, updated:0},
        syncLog:[], incidents:[], db:null, writeChain:Promise.resolve(), persistedCount:0,
        storageFailed:false, uiTick:0, wake:null, returnTo:null, transaction:null,
        compareExport:null, compareCharts:[], jointCharts:{time:null,spectrum:null},
        syncCharts:[], syncView:{bins:12,focus:{}},
        syncCalibration:{phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0},
        duringSyncTimer:null
    };
    const running = () => s.run && activeStates.has(s.run.state);
    function tell(message, error=false) { $('jointNotice').textContent=message; $('jointNotice').dataset.error=String(error); }
    function incident(kind, detail) {
        const item={kind, detail:String(detail), time:now()}; s.incidents.push(item);
        if (s.run) s.run.incidents.push(item);
    }
    function guard(fn) { return async (...args) => {try {await fn(...args);} catch(e) {tell(e.message || String(e),true); $('jointPairStatus').textContent=e.message || String(e);}}; }
    function download(name, value, mime='application/json') {
        const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:mime});
        const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name;
        document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    function tab(name) {
        for (const n of ['Plan','Devices','Sync','Measure','Results','Compare']) {
            $('jointPanel'+n).hidden=n!==name; $('jointTab'+n).setAttribute('aria-selected',String(n===name));
        }
        if(name==='Compare') renderComparison();
    }
    function open() {
        if (typeof isRecording!=='undefined' && isRecording) throw Error('Detén primero el ensayo individual.');
        if (root.hidden) {
            s.returnTo=[...document.querySelectorAll('main > section, main > form')].find(el=>el!==root && getComputedStyle(el).display!=='none');
            for (const el of document.querySelectorAll('main > section, main > form')) if(el!==root) el.style.display='none';
        }
        root.hidden=false; window.scrollTo({top:0});
    }
    function workspace() {
        $('jointLanding').hidden=true; $('jointWorkspace').hidden=false;
        $('jointRole').textContent=s.role==='host'?'Maestro':'Participante';
        $('jointPair').hidden=s.role!=='host'; $('jointSessionLabel').textContent=s.session.slice(0,8);
        $('jointDeviceName').value=s.name;
        renderPlan(); renderDevices(); tab('Plan');
    }
    function requireHostEdit() {
        if (s.role!=='host') throw Error('El plano lo edita el maestro.');
        if (running() || s.transaction) throw Error('El plano queda bloqueado durante el ensayo.');
    }
    /* Plane and point management are isolated from WebRTC/clock synchronization.
       Keep injected callbacks wired to this application's existing state. */
    const { checkPlan, savePlan, pointFor, deviceName, deviceCode, planViewport, geometry, niceMetricStep, planGridStep, planLabelStep, snapPlanPosition, resetPlanView, planPointScale, pointLabelPlacement, renderPlan, svgPosition, zoomPlanAt, suggestedPointPosition, addPoint, updatePlanPoint, deletePlanPoint } = globalThis.VWOMAPlan.createController({
        s, finite, MAX_POINTS, running, $, tell, broadcast: (...args) => broadcast(...args), escape, requireHostEdit, renderDevices
    });
    function localStatus() {return {id:s.id,name:s.name,sensor:s.sensor && now()-s.lastSample<2000,rate:sampleRate(),visible:document.visibilityState==='visible',point:pointFor()?.id||null,state:s.run?.state||'idle',calibrated:s.calibration.complete};}
    function sampleRate() {const a=s.rateTimes; return a.length>2?(a.length-1)*1000/(a[a.length-1]-a[0]):0;}
    function renderDevices() {
        const local=localStatus();
        let html=`<article class="joint-device-card"><strong>${escape(s.name)} · ${s.role==='host'?'Maestro':'Este móvil'}</strong><p>${local.sensor?'Sensor activo':'Sensor sin datos recientes'} · ${local.rate?local.rate.toFixed(1)+' Hz':'— Hz'} · ${escape(pointFor()?.name||'Sin punto asignado')}</p><small>${local.calibrated?'Ejes calibrados':'Calibración de ejes pendiente'} · ${local.visible?'Página visible':'Página oculta'}</small></article>`;
        for(const p of s.peers.values()) {
            const st=p.status||{},m=p.model;
            html+=`<article class="joint-device-card"><strong>${escape(p.name||'Conectando…')}</strong><p>${p.channel?.readyState==='open'?'Conectado':'Desconectado'} · ${st.sensor?'Sensor activo':'Sensor sin confirmar'} · ${finite(st.rate)?st.rate.toFixed(1)+' Hz':'— Hz'}</p><p>${escape(pointFor(p.id)?.name||'Sin punto asignado')} · ${escape(p.route||'Ruta pendiente de comprobar')}</p><small>${st.calibrated?'Ejes calibrados':'Calibración pendiente'} · ${m?.count?'RTT mínimo: '+m.rtt.toFixed(2)+' ms · desfase estimado: '+m.offset.toFixed(2)+' ms · '+m.count+' intercambios':'Relojes pendientes de estimación'}</small></article>`;
        }
        if(s.role==='guest'&&s.syncModel.count) html+=`<p class="joint-help">Mi reloj respecto al maestro: ${s.syncModel.offset.toFixed(2)} ms (estimado). RTT mínimo: ${s.syncModel.rtt.toFixed(2)} ms.</p>`;
        $('jointDevices').innerHTML=html;
        $('jointStart').hidden=s.role!=='host'; $('jointSync').hidden=s.role!=='host';
        $('jointStart').disabled=!!running()||!!s.transaction||!s.syncCalibration.accepted;
        $('jointDuration').disabled=s.role!=='host'||!!running()||!!s.transaction;
        $('jointEnableSensor').disabled=s.sensorEnabled;
        $('jointStop').disabled=!running()&&!s.transaction;
        $('jointPair').disabled=!!running()||!!s.transaction;
        renderSyncCalibration();
    }

    /* WebRTC transport and QR signaling are separate from acquisition and clocks.
       Keep method bindings writable for the existing diagnostic test harness. */
    let { encodeToken, decodeToken, stopQrCycle, qrTransferPages, renderQrPage, acceptQrPage, showToken, openPair, browserLabel, isAndroidChrome, updateAndroidNearbyNotice, diagnosticEvent, diagnosticText, showPairDiagnostic, pairingError, gather, candidateSummary, parsedCandidates, candidateEndpoint, candidateLabel, candidateDetails, icePairSnapshot, captureIceStats, scheduleIceStats, pairingDetails, pairStatus, disposePeer, failPair, watchPair, localDescription, prepareSafariConnection, pairingAction, retryPair, wirePeer, newPeer, send, broadcast, wireChannel, checkRoute, invite, createGuestAnswer, readCode, stopScan, scanCode } = globalThis.VWOMATransport.createTransport({
        s, VERSION, STUN_SERVERS, MAX_PEERS, MAX_TOKEN, MAX_MESSAGE, QR_CHUNK_SIZE, MAX_QR_PAGES, uid, now, finite, $, running, tell, incident, guard, tab, open, workspace, requireHostEdit, localStatus, renderDevices, savePlan, renderPlan, startSync, onMessage
    });

    // Four timestamps. Network asymmetry remains an unobservable error source.
    function clockFit(samples) {
        if(!samples.length)return null;
        const recent=samples.slice(-240),sorted=[...recent].sort((a,b)=>a.rtt-b.rtt);
        const cutoff=sorted[Math.max(0,Math.ceil(sorted.length*.3)-1)].rtt;
        const chosen=recent.filter(v=>v.rtt<=cutoff);
        const reference=median(chosen.map(v=>v.local));
        const span=Math.max(...chosen.map(v=>v.local))-Math.min(...chosen.map(v=>v.local));
        const slopes=[];
        if(span>=20000&&chosen.length>=6)for(let i=0;i<chosen.length;i++)for(let j=i+1;j<chosen.length;j++){
            const dt=chosen[j].local-chosen[i].local;if(Math.abs(dt)>=50)slopes.push((chosen[j].offset-chosen[i].offset)/dt);
        }
        const drift=slopes.length?median(slopes):0;
        // Offset at the reference instant. Median makes isolated path asymmetries harmless.
        const offset=median(chosen.map(v=>v.offset-drift*(v.local-reference)));
        // Grossly implausible fits are not used to schedule an acquisition.
        if(!finite(drift)||Math.abs(drift)>.005)return null;
        const residual=Math.sqrt(chosen.reduce((a,v)=>a+(v.offset-offset-drift*(v.local-reference))**2,0)/chosen.length);
        return {reference,offset,drift,rtt:sorted[0].rtt,residual,count:samples.length,selectedCount:chosen.length,rttCutoff:cutoff,rttMedian:median(chosen.map(v=>v.rtt)),span,method:'mediana del 30 % de RTT menor; deriva Theil–Sen',updated:now()};
    }
    const toMaster=(t,m=s.syncModel)=>t-m.offset-m.drift*(t-m.reference);
    const fromMaster=(t,m)=> (t+m.offset-m.drift*m.reference)/(1-m.drift);
    function syncOnce(p,phase='idle',runId=null) {
        if(p.channel?.readyState!=='open')return;
        const id=uid(),t1=now();p.requests.set(id,{time:t1,phase,runId});send(p,{type:'SYNC_REQUEST',id,t1});
        for(const [key,request] of p.requests)if(t1-request.time>10000)p.requests.delete(key);
    }
    async function startSync(p,count=24,spacing=100,phase='connection',runId=null) {
        if(p.syncing&&p.syncPromise)await p.syncPromise;
        p.syncing=true;
        p.syncPromise=(async()=>{
            try {for(let i=0;i<count&&p.channel?.readyState==='open';i++){syncOnce(p,phase,runId);await pause(spacing);}}
            finally {p.syncing=false;p.syncPromise=null;}
        })();
        return p.syncPromise;
    }

    async function onMessage(p,m,received) {
        if(m.type==='HELLO') {
            if(m.id!==p.id)throw Error('Identificador de dispositivo inesperado.');
            p.name=String(m.name||'Móvil').slice(0,40);p.status=m.status;renderPlan();renderDevices();return;
        }
        if(m.type==='STATUS'){p.status=m.status;p.name=String(m.status?.name||p.name).slice(0,40);return;}
        if(m.type==='SYNC_REQUEST'&&s.role==='guest') {
            if(typeof m.id!=='string'||!finite(m.t1))return;
            send(p,{type:'SYNC_REPLY',id:m.id,t1:m.t1,t2:received,t3:now()});return;
        }
        if(m.type==='SYNC_REPLY'&&s.role==='host') {
            const request=p.requests.get(m.id);if(request===undefined)return;p.requests.delete(m.id);
            const t1=request.time;
            if(!finite(m.t2)||!finite(m.t3)||m.t3<m.t2)return;
            const rtt=(received-t1)-(m.t3-m.t2);if(rtt<0||rtt>2000)return;
            const row={t1,t2:m.t2,t3:m.t3,t4:received,rtt,offset:((m.t2-t1)+(m.t3-received))/2,local:(m.t2+m.t3)/2,phase:request.phase,runId:request.runId};
            p.samples.push(row);if(p.samples.length>MAX_SYNC_SAMPLES)p.samples.shift();p.model=clockFit(p.samples);
            if(p.model){send(p,{type:'CLOCK_MODEL',model:p.model,exchange:row});}
            return;
        }
        if(m.type==='CLOCK_MODEL'&&s.role==='guest') {
            if(!validModel(m.model))return;
            s.syncModel={...m.model,updated:now()};p.model=m.model;
            if(m.exchange){s.syncLog.push(m.exchange);if(s.syncLog.length>MAX_SYNC_SAMPLES)s.syncLog.shift();}
            return;
        }
        if(m.type==='SYNC_GESTURE_ARM'&&s.role==='guest') {
            if(typeof m.id!=='string'||!finite(m.start)||!finite(m.end)||m.end-m.start<6000||!localStatus().sensor||!s.calibration.complete){send(p,{type:'SYNC_GESTURE_REJECT',id:m.id,reason:'Sensor o calibración de ejes no disponibles.'});return;}
            armSyncGesture(m,s.syncModel);send(p,{type:'SYNC_GESTURE_READY',id:m.id});tell('Prueba física preparada. Sigue la cuenta atrás junto al maestro.');return;
        }
        if(m.type==='SYNC_GESTURE_READY'&&s.role==='host')return;
        if(m.type==='SYNC_GESTURE_REJECT'&&s.role==='host'){if(s.syncCalibration.id===m.id){s.syncCalibration.phase='failed';tell(p.name+': '+String(m.reason||'no pudo preparar la prueba.'),true);renderSyncCalibration();}return;}
        if(m.type==='SYNC_GESTURE_RESULT'&&s.role==='host') {
            // Conserva incluso las ventanas cortas para diagnosticar por qué falló el iPhone.
            if(s.syncCalibration.id!==m.id||!Array.isArray(m.samples)||m.samples.length>1800)return;
            if(!m.calibration?.map)return;
            if(!['x','y','z'].includes(m.axis))return;
            const result=s.syncCalibration.results[p.id]||{windows:{},axes:{},calibration:m.calibration,accepted:false};
            result.windows[m.axis]=m.samples;result.calibration=m.calibration;s.syncCalibration.results[p.id]=result;renderSyncCalibration();return;
        }
        if(m.type==='SYNC_GESTURE_APPLY'&&s.role==='guest') {
            if(s.syncCalibration.gesture?.id!==m.id||!finite(m.correctionMs)||!m.axes)return;
            s.syncCalibration.results[s.id]={axes:m.axes,correctionMs:m.correctionMs,accepted:true};s.syncCalibration.correctionMs=m.correctionMs;s.syncCalibration.accepted=true;s.syncCalibration.phase='accepted';
            tell('Sincronización física validada: corrección fija '+m.correctionMs.toFixed(2)+' ms.');renderSyncCalibration();renderDevices();return;
        }
        if(m.type==='PLAN'&&s.role==='guest'&&!running()) {s.plan=checkPlan(m.plan);s.selected=pointFor()?.id||s.plan.points[0]?.id;renderPlan();return;}
        if(m.type==='PREPARE'&&s.role==='guest') {
            let reason='';
            if(running())reason='Ya hay un ensayo activo.';
            else if(s.run?.finishing)reason='El ensayo anterior todavía se está cerrando.';
            else if(!localStatus().sensor||document.hidden)reason='Sensor sin datos o página oculta.';
            else if(!pointFor())reason='Falta asignación a un punto.';
            // La ráfaga y el gesto ya han fijado la corrección del ensayo. El reloj
            // puede llevar más de 15 s sin mensajes porque el gesto físico dura 12 s.
            else if(!s.syncCalibration.accepted||s.syncModel.count<8)reason='Falta una sincronización física válida.';
            else if(typeof m.runId!=='string'||!finite(m.duration)||m.duration<5||m.duration>1800)reason='Duración no válida.';
            if(!reason)s.pending={id:m.runId,duration:m.duration,expires:now()+15000};
            send(p,{type:'READY',runId:m.runId,ok:!reason,reason});tell(reason||'Preparado. Esperando confirmación del maestro.',!!reason);return;
        }
        if(m.type==='READY'&&s.role==='host') {
            if(s.transaction?.id===m.runId){s.transaction.ready.set(p.id,{ok:m.ok===true,reason:String(m.reason||'')});}return;
        }
        if(m.type==='START_AT'&&s.role==='guest') {
            if(s.run?.id===m.runId){send(p,{type:'START_ACK',runId:m.runId});return;}
            if(!s.pending||s.pending.id!==m.runId||s.pending.expires<now()||!finite(m.start)||!finite(m.end)||m.end-m.start!==s.pending.duration*1000||m.start-toMaster(now())<500||!localStatus().sensor) {send(p,{type:'START_REJECT',runId:m.runId});return;}
            beginRun(m.runId,m.start,m.end,s.pending.duration);s.pending=null;send(p,{type:'START_ACK',runId:m.runId});return;
        }
        if(m.type==='START_ACK'&&s.role==='host'){if(s.transaction?.id===m.runId)s.transaction.acks.add(p.id);return;}
        if(m.type==='START_REJECT'&&s.role==='host'){if(s.transaction?.id===m.runId)s.transaction.error='Un participante no pudo programar el inicio.';return;}
        if(m.type==='STOP_REQUEST'&&s.role==='host'){stopRun('Solicitud de '+p.name);return;}
        if(m.type==='STOP_AT'&&s.role==='guest') {
            if(s.run?.id===m.runId&&running()&&finite(m.end)){s.run.end=Math.max(s.run.start,Math.min(s.run.end,m.end));incident('stop','Parada anticipada del maestro');}return;
        }
        if(m.type==='ABORT'&&s.role==='guest') {if(s.pending?.id===m.runId)s.pending=null;if(s.run?.id===m.runId&&running()){s.run.state='cancelled';incident('cancel',m.reason||'Ensayo cancelado');await finishRun(true);}return;}
        if(m.type==='TRANSFER_BEGIN'&&s.role==='host') {
            if(!s.run||s.run.id!==m.runId||!Number.isInteger(m.size)||m.size<1||m.size>80000000||!Number.isInteger(m.count)||m.count!==Math.ceil(m.size/12000)||typeof m.hash!=='string')throw Error('Transferencia no válida.');
            p.incoming={id:m.transferId,runId:m.runId,size:m.size,count:m.count,hash:m.hash,parts:[],length:0,next:0};
            send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:-1});return;
        }
        if(m.type==='TRANSFER_CHUNK'&&s.role==='host') {
            const t=p.incoming;if(!t||t.id!==m.transferId)return;
            if(m.index<t.next){send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;}
            if(m.index!==t.next||typeof m.data!=='string'||m.data.length>12000||t.length+m.data.length>t.size)throw Error('Bloque de datos no válido.');
            t.parts.push(m.data);t.length+=m.data.length;t.next++;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;
        }
        if(m.type==='TRANSFER_END'&&s.role==='host') {
            const t=p.incoming;
            if(!t||t.id!==m.transferId){if(p.completedTransfer?.id===m.transferId)send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:p.completedTransfer.count});return;}
            if(t.length!==t.size||t.next!==t.count)throw Error('Registro incompleto. Solicita el reenvío.');
            const text=t.parts.join('');if(await hashText(text)!==t.hash)throw Error('La comprobación de integridad no coincide. Reenvía el registro.');
            const record=JSON.parse(text);validateRecord(record,p.id,t.runId);
            s.results.set(p.id,record);p.completedTransfer={id:t.id,count:t.count};p.incoming=null;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:t.count});renderResults();return;
        }
        if(m.type==='TRANSFER_ACK') {const key=m.transferId+':'+m.index,resolve=p.acks.get(key);if(resolve){p.acks.delete(key);resolve();}return;}
    }
    function validModel(m) {return m&&['offset','drift','reference','count','rtt'].every(k=>finite(m[k]))&&Math.abs(m.drift)<=.005&&m.count>=1;}

    // Local durable chunks. Sensor callbacks only push to memory; storage is batched.
    async function db() {
        if(s.db)return s.db;
        s.db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('upm-joint-v1',1);
            req.onupgradeneeded=()=>{req.result.createObjectStore('runs',{keyPath:'key'});req.result.createObjectStore('chunks',{keyPath:'key'});};
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        });return s.db;
    }
    async function storeBatch(run,rows,index) {
        const database=await db();
        await new Promise((resolve,reject)=>{
            const tx=database.transaction(['runs','chunks'],'readwrite');
            tx.objectStore('runs').put({key:run.id+':'+run.device.id,meta:runMeta(run)});
            if(rows.length)tx.objectStore('chunks').put({key:run.id+':'+run.device.id+':'+String(index).padStart(8,'0'),rows});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Guardado interrumpido'));
        });
    }
    function persist(run=s.run) {
        if(!run)return s.writeChain;
        if(run.device.role==='guest') run.sync=structuredClone(s.syncLog);
        const start=run.persisted||0,rows=run.samples.slice(start);run.persisted=run.samples.length;
        const index=run.chunkIndex||0;run.chunkIndex=index+1;
        s.writeChain=s.writeChain.then(()=>storeBatch(run,rows,index)).catch(e=>{
            if(!s.storageFailed){s.storageFailed=true;incident('storage','Guardado local fallido: '+e.message);tell('No se pudo guardar en el navegador. Conserva la página abierta y descarga el registro.',true);}
        });return s.writeChain;
    }
    async function persistBeforeClosing(run) {
        // IndexedDB puede quedar pendiente en móviles cuando el navegador cambia de
        // estado. Nunca debe impedir cerrar bien un ensayo ni arrancar el siguiente.
        let timer;
        try {
            await Promise.race([
                persist(run),
                new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('El guardado local tardó demasiado.')),8000);})
            ]);
        } catch(error) {
            s.storageFailed=true;incident('storage',error.message);
            s.writeChain=Promise.resolve();
            tell('El guardado local sigue pendiente. El registro permanece en memoria: descárgalo antes de cerrar.',true);
        } finally {clearTimeout(timer);}
    }
    async function recover() {
        const database=await db();
        const entries=await new Promise((resolve,reject)=>{const req=database.transaction('runs').objectStore('runs').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        $('jointRecoveryList').replaceChildren();
        if(!entries.length){$('jointRecoveryList').textContent='No hay registros locales guardados.';return;}
        for(const entry of entries.sort((a,b)=>b.meta.created.localeCompare(a.meta.created))) {
            const b=document.createElement('button');b.type='button';b.className='joint-secondary';b.textContent=entry.meta.created.slice(0,19)+' · '+entry.meta.device.name;
            b.onclick=guard(async()=>{
                const range=IDBKeyRange.bound(entry.key+':',entry.key+':\uffff');
                const chunks=await new Promise((resolve,reject)=>{const req=database.transaction('chunks').objectStore('chunks').getAll(range);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
                download('recuperado_'+entry.meta.id+'.json',{...entry.meta,recovered:true,samples:chunks.flatMap(v=>v.rows)});
            });$('jointRecoveryList').append(b);
        }
    }
    async function enableSensor() {
        if(!window.isSecureContext)throw Error('Abre la web mediante HTTPS para usar el acelerómetro.');
        if(s.sensorEnabled)return;
        s.sensor=false;s.sensorSource='';

        if(typeof DeviceMotionEvent==='undefined')throw Error('Este navegador no ofrece DeviceMotionEvent.');
        if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')throw Error('Debes permitir el acceso al movimiento.');
        window.addEventListener('devicemotion',motion);s.sensorEnabled=true;s.sensorSource='DeviceMotionEvent';
        tell('Esperando datos del acelerómetro mediante DeviceMotionEvent…');showCalibration();renderDevices();
        setTimeout(()=>{if(s.sensorEnabled&&!s.sensor)tell('No llegan datos mediante '+s.sensorSource+'. Revisa permiso de movimiento/sensores, que la página esté visible y que no esté activada la privacidad de sensores del teléfono.',true);},4000);
    }
    function renderSyncCalibration() {
        const state=s.syncCalibration,button=$('jointSyncStart');
        if(!button)return;
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        const axesReady=s.calibration.complete&&peers.every(p=>p.status?.calibrated);
        button.hidden=s.role!=='host';button.disabled=s.role!=='host'||!axesReady||state.phase==='network'||state.phase==='gesture'||state.phase==='processing'||state.phase==='gesture-ready'||state.phase==='accepted';
        const badge=$('jointSyncState');
        const labels={idle:'Pendiente',network:'Ráfaga de reloj','gesture-ready':'Elige un gesto',gesture:'Gesto en curso',processing:'Procesando',accepted:'Validada',failed:'Repetir prueba'};
        badge.textContent=labels[state.phase]||'Pendiente';badge.classList.toggle('done',state.phase==='accepted');
        const burst=$('jointSyncBurst'),burstProgress=$('jointSyncBurstProgress'),burstCount=$('jointSyncBurstCount');
        burst.hidden=state.phase!=='network';
        if(state.phase==='network'){
            const counts=peers.map(p=>p.samples.filter(row=>row.runId===state.id&&row.phase==='precal').length),count=counts.length?Math.min(...counts):0;
            burstProgress.value=Math.min(200,count);burstCount.textContent=Math.min(200,count)+' / 200 respuestas confirmadas';
        }
        const gesture=state.gesture;
        const box=$('jointSyncCountdown');
        // start/end pertenecen al reloj del maestro; no se comparan con el reloj local del invitado.
        const gestureMasterNow=gesture?(s.role==='host'?now():toMaster(now(),gesture.model||s.syncModel)):null;
        if(!gesture||!finite(gesture.start)||!finite(gesture.end)||!finite(gestureMasterNow)||gestureMasterNow>gesture.end+1200){box.hidden=true;box.classList.remove('go');}
        else {
            const d=gestureMasterNow-gesture.start;
            box.hidden=false;
            if(d<0){box.classList.remove('go');box.textContent=Math.max(1,Math.ceil(-d/1000));}
            else {box.classList.add('go');box.textContent='¡AHORA!';}
        }
        const syncImage=$('jointSyncImage'),syncInstruction=$('jointSyncInstruction'),gestureActions=$('jointSyncGestureActions');
        const axis=gesture?.axis||['x','y','z'].find(key=>!state.results?.[s.id]?.axes?.[key])||'x';
        const syncSrc='assets/calibration/telefono-eje-'+axis+'.svg';
        // No reasignar src en cada refresco: reinicia la animación SVG en Safari.
        if(syncImage.getAttribute('src')!==syncSrc)syncImage.setAttribute('src',syncSrc);
        syncImage.alt='Gesto de sincronización en el eje '+axis.toUpperCase();
        syncInstruction.textContent=gesture?(gesture.phase==='finished'?'Gesto '+axis.toUpperCase()+' capturado. Esperando resultados…':gestureMasterNow<gesture.start?'Quieto hasta la cuenta atrás.':'Mueve el conjunto en '+axis.toUpperCase()+' · ida · vuelta · ida durante 6 s.'):state.phase==='gesture-ready'?'El maestro elige el siguiente eje.':'Primero calibra los relojes.';
        gestureActions.hidden=state.phase!=='gesture-ready';
        for(const key of ['x','y','z']){const control=$('jointSyncGesture'+key.toUpperCase()),done=!!state.results?.[s.id]?.axes?.[key];control.hidden=s.role!=='host';control.disabled=s.role!=='host'||done||state.phase!=='gesture-ready';control.classList.toggle('done',done);}
        const localRows=[];
        const own=state.results?.[s.id];
        if(own?.axes)localRows.push(`<article class="joint-sync-card"><strong>${escape(s.name)} · ${state.phase==='accepted'?'referencia':'maestro'}</strong><p>${axisResultMarkup(own.axes)}</p><small>${own.accepted?'Corrección: '+own.correctionMs.toFixed(2)+' ms':'Sin corrección física local'}</small></article>`);
        for(const p of peers){const result=state.results?.[p.id],model=state.models?.[p.id]||p.startModel,clock=finite(model?.offset)?`Offset inicial: ${model.offset.toFixed(2)} ms · RTT mín.: ${finite(model.rtt)?model.rtt.toFixed(2):'—'} ms`:'Modelo de reloj pendiente';localRows.push(`<article class="joint-sync-card"><strong>${escape(p.name)}</strong><p>${result?.axes?axisResultMarkup(result.axes):state.phase==='network'?'Midiendo RTT y offset…':state.phase==='gesture'?'Esperando gesto común…':'Pendiente'}</p><small>${clock}<br>${result?.accepted?'Corrección aplicada: '+result.correctionMs.toFixed(2)+' ms':result?.error?escape(result.error):'Se correlacionarán X–X, Y–Y y Z–Z.'}</small></article>`);}
        $('jointSyncSummary').innerHTML=localRows.length?localRows.join(''):`<p class="joint-help">Activa y calibra todos los acelerómetros antes de validar la sincronización.</p>`;
        if(state.phase==='accepted')$('jointSyncHelp').textContent='Sincronización validada. La corrección física se conservará para el próximo ensayo; los mensajes de 10 Hz durante la medida solo se guardarán como diagnóstico.';
        else if(state.phase==='gesture-ready'){
            const retry=['x','y','z'].find(axis=>!state.results?.[s.id]?.axes?.[axis]);
            $('jointSyncHelp').textContent=retry?'Pulsa '+retry.toUpperCase()+'. Si el gesto no se reconoce, repite solo ese eje; no hace falta repetir la ráfaga de reloj.':'Comprobando los tres ejes…';
        }
        else if(state.phase==='failed')$('jointSyncHelp').textContent='La calibración completa no se ha validado. Pulsa «Calibrar relojes» para reiniciarla de forma limpia.';
        else if(!axesReady)$('jointSyncHelp').textContent='Completa los factores +1/−1 de X, Y y Z en todos los móviles antes de iniciar la prueba conjunta.';
    }
    function axisResultMarkup(axes) {return ['x','y','z'].map(axis=>{const a=axes[axis];return a?.error?`${axis.toUpperCase()}: ${escape(a.error)}`:a&&finite(a.lag)?`${axis.toUpperCase()}: ${a.lag.toFixed(2)} ms · r ${a.correlation.toFixed(3)}`:`${axis.toUpperCase()}: —`;}).join('<br>');}
    function showCalibration() {
        $('jointCalibration').hidden=false;$('jointCalibrationOverride').hidden=false;renderCalibration();
    }
    function calibrationAxisName(axis) {return axis==='x'?'X · longitudinal':axis==='y'?'Y · transversal':'Z · vertical';}
    function renderCalibration() {
        const c=s.calibration,active=c.active,done=c.complete;
        const state=$('jointCalibrationState');state.textContent=done?'Sentidos corregidos':active?'En curso':'Pendiente';state.classList.toggle('done',done);
        $('jointCalibration').classList.toggle('complete',done);
        const axis=active?.axis||['x','y','z'].find(key=>!c.map[key])||'x';
        const words={x:'mueve el móvil sobre el eje X y vuelve al origen.',y:'mueve el móvil sobre el eje Y y vuelve al origen.',z:'mueve el móvil sobre el eje Z y vuelve al origen.'};
        const image=$('jointCalibrationImage');
        const calibrationSrc=done?'assets/calibration/telefono-ejes-reposo.svg':'assets/calibration/telefono-eje-'+axis+'.svg';
        if(image.getAttribute('src')!==calibrationSrc)image.setAttribute('src',calibrationSrc);
        image.alt=done?'Móvil centrado en el origen tras calibrar los ejes':'Móvil moviéndose sobre el eje '+axis.toUpperCase();
        $('jointCalibrationAnimation').classList.toggle('complete',done);
        $('jointCalibrationInstruction').textContent=done?'Móvil centrado en el origen.':'Calibrar '+calibrationAxisName(axis)+' · '+words[axis];
        for(const key of ['x','y','z']) {
            const calibration=c.map[key],button=$('jointCalibrate'+key.toUpperCase()),factor=$('jointFactor'+key.toUpperCase()),card=factor.closest('.joint-factor');
            button.disabled=!!active||(!s.sensorEnabled)||!!calibration;button.classList.toggle('done',!!calibration);
            factor.textContent=calibration?'× '+(calibration.sign>0?'+1':'−1'):'Pendiente';
            card.classList.toggle('ready',!!calibration);
        }
        const override=$('jointCalibrationOverride'),manual=$('jointManualCalibration'),skip=$('jointSkipCalibration');
        override.hidden=done;
        manual.hidden=done||!c.manualChoosing;
        skip.disabled=!!active||!s.sensorEnabled||!!c.manualChoosing;
        $('jointCalibrationHelp').textContent=active?'Prepárate: empieza el gesto cuando termine la cuenta atrás.':c.feedback||(done?'✓ Factores de signo guardados para este móvil. Puedes preparar la medida.':'Pulsa cada eje y sigue el gesto indicado. Cada prueba solo corrige el signo de su propio registro; no se intercambian ejes.');
        renderCalibrationCountdown();
    }
    function renderCalibrationCountdown() {
        const box=$('jointCalibrationCountdown'),active=s.calibration.active;
        if(!active){box.hidden=true;box.classList.remove('go');return;}
        const t=now();box.hidden=false;
        if(t<active.start){box.classList.remove('go');box.textContent='Quieto · '+Math.max(1,Math.ceil((active.start-t)/1000));}
        else {box.classList.add('go');box.textContent='¡AHORA! · '+Math.max(0,Math.ceil((active.end-t)/1000))+' s para ida y vuelta';}
    }
    function startCalibration(axis) {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.map[axis])return;
        // Durante la cuenta atrás se mide la componente continua; en Z incluye la gravedad.
        const start=now()+3000;
        s.calibration.feedback=null;
        s.calibration.active={axis,start,end:start+6000,baseline:[],samples:[]};renderCalibration();
        tell('Calibración '+axis.toUpperCase()+': mantén el móvil quieto y empieza al aparecer ¡AHORA!.');
    }
    function chooseManualCalibration() {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.complete)return;
        s.calibration.manualChoosing=true;renderCalibration();
        tell('Elige si quieres conservar los tres ejes o invertir los tres ejes.');
    }
    function setManualCalibration(sign) {
        if(sign!==1&&sign!==-1)throw Error('Factor manual no válido.');
        if(s.calibration.active||!s.calibration.manualChoosing)return;
        for(const [axis,raw] of Object.entries({x:0,y:1,z:2}))s.calibration.map[axis]={raw,sign,manual:true,method:'manual'};
        s.calibration.manualChoosing=false;s.calibration.complete=true;
        tell('Calibración omitida: se aplica × '+(sign>0?'+1':'−1')+' a X, Y y Z.');renderCalibration();renderDevices();
    }
    function linearDetrend(values) {
        const n=values.length;if(n<3)return values.slice();
        let sx=0,sy=0,sxx=0,sxy=0;
        for(let i=0;i<n;i++){sx+=i;sy+=values[i];sxx+=i*i;sxy+=i*values[i];}
        const d=n*sxx-sx*sx,slope=Math.abs(d)>1e-12?(n*sxy-sx*sy)/d:0,intercept=(sy-slope*sx)/n;
        return values.map((value,i)=>value-(intercept+slope*i));
    }
    function lowPassCalibration(values,cutoffHz=10) {
        // Dos pares RC en ambos sentidos: paso bajo de 4.º orden, fc = 10 Hz y sin desfase temporal.
        if(values.length<4)return values.slice();
        const dt=1/Math.max(20,sampleRate()||60),rc=1/(2*Math.PI*cutoffHz),alpha=dt/(rc+dt);
        const pass=input=>{const output=[input[0]];for(let i=1;i<input.length;i++)output.push(output[i-1]+alpha*(input[i]-output[i-1]));return output;};
        let output=values.slice();
        for(let order=0;order<2;order++)output=pass(pass(output).reverse()).reverse();
        return output;
    }
    function calibrationLobes(values,threshold,rateHz=60) {
        // Extraer fases de aceleración que superan el ruido, manteniendo el orden temporal.
        const lobes=[],maxGap=Math.max(3,Math.round(.09*rateHz));
        let current=null;
        values.forEach((value,index)=>{
            const sign=Math.abs(value)>=threshold?Math.sign(value):0;
            if(!sign){if(current){lobes.push(current);current=null;}return;}
            if(!current||current.sign!==sign){
                if(current)lobes.push(current);
                current={sign,start:index,end:index,peak:Math.abs(value)};
            }else{current.end=index;current.peak=Math.max(current.peak,Math.abs(value));}
        });
        if(current)lobes.push(current);
        const merged=[];
        for(const lobe of lobes){
            const prev=merged[merged.length-1];
            if(prev&&prev.sign===lobe.sign&&lobe.start-prev.end-1<=maxGap){
                prev.end=lobe.end;prev.peak=Math.max(prev.peak,lobe.peak);
            }else merged.push({...lobe});
        }
        return merged;
    }
    function finishCalibration() {
        const active=s.calibration.active;if(!active)return;
        s.calibration.active=null;
        const axis=active.axis,raw={x:0,y:1,z:2}[axis],rows=active.samples;
        const fail=message=>{
            s.calibration.feedback=message;tell(message,true);renderCalibration();
        };
        if(rows.length<20){
            fail('Eje '+axis.toUpperCase()+': solo llegaron '+rows.length+' muestras en 6 s. Mantén Safari visible y revisa el permiso del acelerómetro.');return;
        }
        const quiet=active.baseline.map(row=>row[raw]).filter(finite);
        if(quiet.length<12){
            fail('Eje '+axis.toUpperCase()+': faltan muestras de reposo. Mantén el teléfono quieto durante los 3 s de cuenta atrás.');return;
        }
        // Eliminar gravedad/continua, tendencia y ruido sin intercambiar los canales.
        const base=median(quiet),noise=1.4826*median(quiet.map(value=>Math.abs(value-base)));
        const filtered=lowPassCalibration(linearDetrend(rows.map(row=>row[raw]-base)),10);
        const peak=Math.max(...filtered.map(value=>Math.abs(value)));
        const minimum=Math.max(.14,noise*5),threshold=Math.max(.08,noise*3.5,peak*.16);
        if(peak<minimum){
            fail('Eje '+axis.toUpperCase()+': movimiento insuficiente (pico '+peak.toFixed(2)+' m/s²; mínimo '+minimum.toFixed(2)+'). Desplázalo algo más rápido sin girarlo.');return;
        }
        const rate=Math.max(20,Math.min(150,sampleRate()||60));
        const lobes=calibrationLobes(filtered,threshold,rate)
            .filter(lobe=>lobe.peak>=minimum*.65&&lobe.end-lobe.start+1>=Math.max(2,Math.round(.045*rate)));
        // Se comprueba la secuencia temporal + - + / - + -, no solo los tres
        // lóbulos de mayor amplitud (que pueden pertenecer a otros ciclos).
        let sequence=null;
        for(let i=0;i+2<lobes.length;i++){
            const [first,second,third]=lobes.slice(i,i+3);
            if(first.sign===third.sign&&first.sign!==second.sign&&
                first.peak>=minimum&&second.peak>=minimum*.65&&third.peak>=minimum*.65){
                sequence=[first,second,third];break;
            }
        }
        if(!sequence){
            const observed=lobes.map(lobe=>lobe.sign>0?'+':'−').join(' ');
            fail('Eje '+axis.toUpperCase()+': '+rows.length+' muestras, pico '+peak.toFixed(2)+' m/s², pero faltó el patrón de ida y vuelta ('+(observed||'sin fases claras')+'). Repite sin rotar el teléfono.');return;
        }
        const sign=sequence[0].sign;
        s.calibration.map[axis]={raw,sign,peak,noise,threshold,samples:rows.length,baseline:base,cutoffHz:10,pattern:'ida-vuelta'};
        s.calibration.complete=['x','y','z'].every(key=>s.calibration.map[key]);
        const factor='× '+(sign>0?'+1':'−1');
        s.calibration.feedback='Eje '+axis.toUpperCase()+' reconocido ('+rows.length+' muestras, pico '+peak.toFixed(2)+' m/s²). Factor '+factor+'.'+(s.calibration.complete?' Calibración completa.':' Continúa con el siguiente eje.');
        tell(s.calibration.feedback);renderCalibration();renderDevices();
    }
    function correctedVector(values,calibration=s.calibration) {
        const map=calibration?.map||{};
        if(!['x','y','z'].every(axis=>map[axis]&&Number.isInteger(map[axis].raw)))return values.slice(0,3);
        // Los canales nunca se permutan: X corrige X, Y corrige Y y Z corrige Z.
        return ['x','y','z'].map((axis,index)=>(map[axis].sign||1)*values[index]);
    }
    function filteredGestureSeries(samples,axis,calibration) {
        const index={x:1,y:2,z:3}[axis],rows=samples.filter(row=>Array.isArray(row)&&finite(row[0])&&finite(row[index])).sort((a,b)=>a[0]-b[0]);
        if(rows.length<20)return [];
        const factor=calibration?.map?.[axis]?.sign||1;
        const values=linearDetrend(rows.map(row=>factor*row[index]));
        const dt=median(rows.slice(1).map((row,i)=>row[0]-rows[i][0]).filter(value=>value>=5&&value<=100));
        const rate=dt?1000/dt:60;
        const lowPass=(input=>{if(input.length<4)return input.slice();const step=1/Math.max(20,rate),rc=1/(2*Math.PI*10),alpha=step/(rc+step),pass=x=>{const out=[x[0]];for(let i=1;i<x.length;i++)out.push(out[i-1]+alpha*(x[i]-out[i-1]));return out;};let out=input.slice();for(let order=0;order<2;order++)out=pass(pass(out).reverse()).reverse();return out;})(values);
        return rows.map((row,i)=>[row[0],lowPass[i]]);
    }
    function interpolateGesture(series,time) {
        let low=0,high=series.length-1;
        if(!series.length||time<series[0][0]||time>series[high][0])return null;
        while(high-low>1){const mid=(low+high)>>1;if(series[mid][0]<=time)low=mid;else high=mid;}
        const a=series[low],b=series[high];if(!b||b[0]===a[0])return a[1];
        return a[1]+(b[1]-a[1])*(time-a[0])/(b[0]-a[0]);
    }
    function correlationAt(master,participant,lag,start,end) {
        let n=0,sumA=0,sumB=0,sumAA=0,sumBB=0,sumAB=0;
        for(let t=start;t<=end;t+=1){const a=interpolateGesture(master,t),b=interpolateGesture(participant,t+lag);if(!finite(a)||!finite(b))continue;n++;sumA+=a;sumB+=b;sumAA+=a*a;sumBB+=b*b;sumAB+=a*b;}
        const top=n*sumAB-sumA*sumB,den=Math.sqrt(Math.max(0,(n*sumAA-sumA*sumA)*(n*sumBB-sumB*sumB)));
        return n>100&&den>1e-9?top/den:null;
    }
    function estimateGestureAxis(masterSamples,participantSamples,axis,masterCalibration,participantCalibration,start,end) {
        const master=filteredGestureSeries(masterSamples,axis,masterCalibration),participant=filteredGestureSeries(participantSamples,axis,participantCalibration);
        if(master.length<20||participant.length<20)return {axis,error:'muestras insuficientes'};
        let best={lag:0,correlation:-Infinity};
        for(let lag=-100;lag<=100;lag++){const correlation=correlationAt(master,participant,lag,start,end);if(finite(correlation)&&correlation>best.correlation)best={lag,correlation};}
        const values=master.map(row=>row[1]),rms=Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
        if(!finite(best.correlation)||best.correlation<.55||rms<.05)return {...best,axis,error:'gesto poco claro'};
        return {...best,axis,rms};
    }
    function armSyncGesture(payload,model=s.syncModel) {
        s.syncCalibration.phase='gesture';s.syncCalibration.gesture={id:payload.id,axis:payload.axis,start:payload.start,end:payload.end,model:structuredClone(model),samples:[],sent:false};
        tab('Sync');renderSyncCalibration();
    }
    async function startSyncCalibration() {
        requireHostEdit();
        if(!localStatus().sensor||!s.calibration.complete)throw Error('Activa y calibra los ejes del maestro antes de iniciar.');
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        if(!peers.length)throw Error('Conecta al menos un participante.');
        for(const p of peers)if(!p.status?.sensor||!p.status?.calibrated||!p.status?.visible)throw Error(p.name+' debe tener el acelerómetro visible y los tres ejes calibrados.');
        // El estado se exporta con el ensayo: guarda IDs, nunca objetos RTCPeerConnection.
        const id=uid();s.syncCalibration={phase:'network',accepted:false,gesture:null,results:{},models:{},correctionMs:0,id,peerIds:peers.map(p=>p.id)};tab('Sync');renderSyncCalibration();
        tell('Midiendo 200 intercambios de reloj a 20 Hz por participante (unos 10 s)…');
        await Promise.all(peers.map(p=>startSync(p,200,50,'precal',id)));
        await pause(500);
        for(const p of peers){const rows=p.samples.filter(row=>row.runId===id&&row.phase==='precal');if(rows.length<185)throw Error('Solo se completaron '+rows.length+' de 200 intercambios con '+p.name+'. Repite la calibración.');const model=clockFit(rows);if(!model)throw Error('No se pudo ajustar el reloj de '+p.name+'.');p.model=model;p.startModel=structuredClone(model);s.syncCalibration.models[p.id]=structuredClone(model);send(p,{type:'CLOCK_MODEL',model});}
        s.syncCalibration.phase='gesture-ready';s.syncCalibration.results[s.id]={axes:{},accepted:true,correctionMs:0};
        tell('Relojes listos. Fija los móviles en la tablilla y pulsa el primer gesto.');renderSyncCalibration();
    }
    function startSyncGesture(axis) {
        requireHostEdit();const state=s.syncCalibration;
        if(state.phase!=='gesture-ready'||!['x','y','z'].includes(axis)||state.results?.[s.id]?.axes?.[axis])return;
        const start=now()+3000,end=start+6000,payload={type:'SYNC_GESTURE_ARM',id:state.id,axis,start,end};
        armSyncGesture(payload,{offset:0,drift:0,reference:0,count:0,rtt:0});broadcast(payload);
        tell('Gesto '+axis.toUpperCase()+' preparado: quietos durante la cuenta atrás.');
        // 3 s de cuenta atrás + 6 s de gesto + 4 s para que todos envíen su ventana.
        setTimeout(()=>finalizeSyncGesture(state.id,axis),13000);
    }
    function finalizeSyncGesture(id,axis) {
        const state=s.syncCalibration,g=state.gesture;if(s.role!=='host'||state.id!==id||!g||g.id!==id||state.phase==='accepted'||state.phase==='failed')return;
        state.phase='processing';const masterSamples=g.samples,masterCalibration=s.calibration;
        state.results[s.id]??={axes:{},accepted:true,correctionMs:0};
        let missing=[];
        const peers=(state.peerIds||[]).map(peerId=>s.peers.get(peerId)).filter(Boolean);
        for(const peerId of state.peerIds||[])if(!s.peers.has(peerId))missing.push('un participante desconectado');
        for(const p of peers){const result=state.results[p.id];if(!result?.windows?.[axis]){missing.push(p.name);continue;}
            result.axes??={};result.axes[axis]=estimateGestureAxis(masterSamples,result.windows[axis],axis,masterCalibration,result.calibration,g.start,g.end);
        }
        if(missing.length){state.phase='gesture-ready';state.gesture=null;tell('No llegó la ventana de '+axis.toUpperCase()+' de '+missing.join(', ')+'. Repite solo ese gesto.',true);renderSyncCalibration();return;}
        const failedAxis=peers.filter(p=>state.results[p.id]?.axes?.[axis]?.error);
        if(failedAxis.length){
            const details=failedAxis.map(p=>{
                const result=state.results[p.id],error=result.axes[axis].error;
                return p.name+': '+error+' (maestro '+masterSamples.length+' muestras, participante '+(result.windows[axis]?.length||0)+')';
            }).join('; ');
            state.phase='gesture-ready';state.gesture=null;
            tell('No se validó el gesto '+axis.toUpperCase()+': '+details+'. Repite solo este eje.',true);
            renderSyncCalibration();return;
        }
        state.results[s.id].axes[axis]={axis,lag:0,correlation:1};
        const allAxes=['x','y','z'].every(key=>peers.every(p=>state.results[p.id]?.axes?.[key]&&!state.results[p.id].axes[key].error));
        if(!allAxes){state.phase='gesture-ready';state.gesture=null;tell('Gesto '+axis.toUpperCase()+' procesado. Continúa con el siguiente eje.');renderSyncCalibration();return;}
        for(const p of peers){const result=state.results[p.id],lags=['x','y','z'].map(key=>result.axes[key].lag),spread=Math.max(...lags)-Math.min(...lags);result.correctionMs=median(lags);result.accepted=spread<=8;if(!result.accepted)result.error='Los retardos X, Y y Z no son coherentes.';}
        const rejected=peers.filter(p=>!state.results[p.id]?.accepted);
        if(rejected.length){
            const disagreement={x:0,y:0,z:0};
            for(const p of rejected){const axes=state.results[p.id].axes,centre=median(['x','y','z'].map(key=>axes[key].lag));for(const key of ['x','y','z'])disagreement[key]+=Math.abs(axes[key].lag-centre);}
            const retry=['x','y','z'].sort((a,b)=>disagreement[b]-disagreement[a])[0];
            for(const p of peers){delete state.results[p.id].axes[retry];delete state.results[p.id].windows?.[retry];state.results[p.id].accepted=false;delete state.results[p.id].error;}
            delete state.results[s.id].axes[retry];state.phase='gesture-ready';state.gesture=null;
            tell('El gesto '+retry.toUpperCase()+' es el menos coherente entre móviles. Repite solo ese eje.',true);renderSyncCalibration();return;
        }
        state.phase='accepted';state.accepted=true;
        for(const p of peers){const result=state.results[p.id];p.syncCalibration=structuredClone(result);send(p,{type:'SYNC_GESTURE_APPLY',id,correctionMs:result.correctionMs,axes:result.axes});}
        tell('Sincronización física validada. Ya puedes pasar a Medir.');renderSyncCalibration();renderDevices();
    }
    function motion(event) {
        const a=event.accelerationIncludingGravity;
        if(!a)return;
        recordJointMotion(finite(event.timeStamp)?event.timeStamp:null,a.x,a.y,a.z,finite(event.interval)?event.interval:null);
    }
    function recordJointMotion(timestamp,x,y,z,interval) {
        if(![x,y,z].every(finite))return;
        const received=now();
        // Event creation time, not hardware sampling time. Preserve raw and receipt.
        const used=timestamp!==null&&timestamp<=received+5&&timestamp>=received-1000?timestamp:received;
        if(running()&&s.lastSample&&received-s.lastSample>250)incident('sample-gap','Sin eventos de movimiento durante '+Math.round(received-s.lastSample)+' ms.');
        const run=s.run;
        // Durante el ensayo la malla queda anclada al modelo confirmado al arrancar.
        // Seguimos intercambiando mensajes de reloj para diagnóstico, pero sus ajustes
        // no desplazan retrospectiva ni progresivamente las muestras ya adquiridas.
        const captureModel=run&&activeStates.has(run.state)?run.initialClock:s.syncModel;
        const gesture=s.syncCalibration.gesture;
        // Durante el gesto físico se congela el modelo de reloj con el que se
        // programó la ventana, para evitar pequeños saltos entre eventos.
        const gestureModel=gesture&&gesture.phase!=='finished'?gesture.model:captureModel;
        const masterAtCapture=s.role==='host'?used:toMaster(used,gestureModel);
        const sample=[0,timestamp,received,x,y,z,interval,used,masterAtCapture];
        if(gesture&&gesture.phase!=='finished'&&masterAtCapture>=gesture.start-700&&masterAtCapture<=gesture.end+700)gesture.samples.push([masterAtCapture,x,y,z]);
        const calibration=s.calibration.active;
        if(calibration&&received<calibration.start)calibration.baseline.push([x,y,z]);
        else if(calibration&&received<=calibration.end)calibration.samples.push([x,y,z]);
        s.sensor=true;s.lastSample=received;s.rateTimes.push(received);if(s.rateTimes.length>120)s.rateTimes.shift();
        s.recent.push(sample);while(s.recent.length&&s.recent[0][2]<received-2000)s.recent.shift();
        s.preview.push(sample);if(s.preview.length>600)s.preview.shift();
        if(run&&activeStates.has(run.state)) {
            const t=masterAtCapture;
            if(t>=run.start-1000&&t<=run.end+1000)appendSample(run,sample);
        }
    }
    function stopJointSensor() {
        window.removeEventListener('devicemotion',motion);
        s.sensor=false;s.sensorEnabled=false;s.sensorSource='';
    }
    function appendSample(run,sample) {
        if(run.samples.length>=MAX_SAMPLES){if(!run.sampleLimit){run.sampleLimit=true;incident('limit','Se ha alcanzado el límite de muestras.');}run.end=Math.min(run.end,toMaster(now(),run.initialClock));return;}
        const row=[...sample];row[0]=run.samples.length;run.samples.push(row);
    }
    function startDuringSync() {
        clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;
        if(s.role!=='host')return;
        s.duringSyncTimer=setInterval(()=>{
            if(!running()||s.role!=='host')return;
            for(const p of s.peers.values())if(p.channel?.readyState==='open')syncOnce(p,'during',s.run.id);
        },100);
    }
    function stopDuringSync(){clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;}
    async function requestWake() {try{if(navigator.wakeLock)s.wake=await navigator.wakeLock.request('screen');}catch(e){incident('screen','No se pudo mantener la pantalla activa.');}}
    function releaseWake(){if(s.wake){s.wake.release().catch(()=>{});s.wake=null;}}
    function beginRun(id,start,end,duration) {
        s.results.clear();s.compareExport=null;s.storageFailed=false;
        const networkModel=s.role==='host'?{offset:0,drift:0,reference:0,count:0,rtt:0}:structuredClone(s.syncModel);
        const physicalCorrection=s.role==='host'?0:Number(s.syncCalibration.correctionMs||0);
        const model={...networkModel,offset:networkModel.offset+physicalCorrection,physicalCorrectionMs:physicalCorrection};
        const quiet=s.recent.filter(sample=>sample[2]>=now()-1000).map(sample=>correctedVector(sample.slice(3,6)));
        const previewBaseline=['x','y','z'].map((_,index)=>quiet.length?quiet.reduce((sum,row)=>sum+row[index],0)/quiet.length:0);
        const syncModels=s.role==='host'?Object.fromEntries([...s.peers.values()].map(p=>[p.id,structuredClone(p.startModel||p.model||{})])):{[s.id]:structuredClone(model)};
        s.run={id,session:s.session,start,end,plannedEnd:end,duration,state:'armed',created:new Date().toISOString(),plan:structuredClone(s.plan),initialClock:model,networkClock:structuredClone(networkModel),finalClock:model,syncModels,synchronizationCalibration:structuredClone(s.syncCalibration),samples:[],incidents:[],persisted:0,chunkIndex:0,previewBaseline,device:{id:s.id,name:s.name,role:s.role,point:structuredClone(pointFor()||null),calibration:structuredClone(s.calibration)},sync:[]};
        for(const sample of s.recent){const t=finite(sample[8])?sample[8]:toMaster(sample[7],model);if(t>=start-1000&&t<=end+1000)appendSample(s.run,sample);}
        document.body.classList.add('recording-lock');tab('Measure');ensureJointCharts();setTimeout(()=>{s.jointCharts.time?.resize();s.jointCharts.spectrum?.resize();},50);requestWake();startDuringSync();persist();renderPlan();renderDevices();tell('Inicio programado. Pantalla y gestos bloqueados durante la medida.');
    }
    async function startRun() {
        requireHostEdit();
        if(!localStatus().sensor||document.hidden)throw Error('Activa el acelerómetro del maestro y mantén la página visible.');
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        if(!peers.length)throw Error('Conecta al menos otro móvil para realizar una medida conjunta.');
        if(!pointFor())throw Error('Asigna el maestro a un punto del plano.');
        if(s.plan.points.some(q=>q.device&&q.device!==s.id&&!peers.some(p=>p.id===q.device)))throw Error('Hay un punto asignado a un móvil desconectado. Conéctalo o elimina su asignación.');
        for(const p of peers) {
            if(!pointFor(p.id))throw Error('Asigna '+p.name+' a un punto del plano.');
            if(!p.status?.sensor||!p.status.visible||now()-p.lastSeen>6000)throw Error(p.name+' no tiene el sensor preparado o la página visible.');
            if(!p.status?.calibrated)throw Error(p.name+' debe completar la calibración de ejes.');
        }
        if(!s.calibration.complete)throw Error('Completa la calibración X, Y y Z del maestro antes de medir.');
        if(!s.syncCalibration.accepted)throw Error('Completa primero la pestaña Calibrar y sincronizar.');
        const duration=Number($('jointDuration').value);if(!finite(duration)||duration<5||duration>1800||!Number.isInteger(duration))throw Error('Introduce una duración entera entre 5 y 1800 segundos.');
        const id=uid(),tx={id,ready:new Map(),acks:new Set(),error:null,phase:'ready',peers};
        s.transaction=tx;tab('Measure');$('jointMeasureState').textContent='Confirmando dispositivos…';renderPlan();renderDevices();
        try {
            broadcast({type:'PREPARE',runId:id,duration});tell('Solicitando confirmación a los participantes…');
            const limit=now()+5000;
            while(tx.ready.size<peers.length&&now()<limit&&s.transaction===tx)await pause(50);
            if(s.transaction!==tx)throw Error('Inicio cancelado.');
            if(tx.ready.size!==peers.length)throw Error('Un participante no respondió. No se inicia el ensayo.');
            for(const v of tx.ready.values())if(!v.ok)throw Error(v.reason||'Un participante no está preparado.');
            const start=now()+4000,end=start+duration*1000;
            beginRun(id,start,end,duration);broadcast({type:'START_AT',runId:id,start,end});
            const deadline=now()+2000;
            while(tx.acks.size<peers.length&&now()<deadline&&!tx.error&&s.transaction===tx)await pause(50);
            if(tx.error||tx.acks.size!==peers.length||s.transaction!==tx)throw Error(tx.error||'Falta confirmación del inicio. Se cancela el ensayo.');
            tell('Todos han confirmado. Inicio en unos segundos.');
        } catch(e) {
            broadcast({type:'ABORT',runId:id,reason:e.message});
            if(s.run?.id===id&&running()) {s.run.state='cancelled';incident('cancel',e.message);await finishRun(true);}
            if(!s.run)$('jointMeasureState').textContent='Preparación interrumpida';
            throw e;
        } finally {if(s.transaction===tx)s.transaction=null;renderDevices();renderPlan();}
    }
    function stopRun(reason='Parada manual') {
        if(s.role==='guest') {
            const host=[...s.peers.values()][0];send(host,{type:'STOP_REQUEST'});
            if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,toMaster(now(),s.run.initialClock)));incident('stop','Parada local solicitada');}
            return;
        }
        if(s.transaction||s.run?.state==='armed') {
            const id=s.transaction?.id||s.run.id;s.transaction=null;broadcast({type:'ABORT',runId:id,reason});
            if(running()){s.run.state='cancelled';incident('cancel',reason);finishRun(true);}return;
        }
        if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,now()));incident('stop',reason);broadcast({type:'STOP_AT',runId:s.run.id,end:s.run.end});}
    }
    function runMeta(run) {
        return {schema:'pasarelas-upm-joint-v1',id:run.id,session:run.session,created:run.created,state:run.state,device:run.device,plan:run.plan,windowMasterMs:{start:run.start,end:run.end,plannedEnd:run.plannedEnd},initialClock:run.initialClock,networkClock:run.networkClock||run.initialClock,finalClock:run.finalClock,syncModels:run.syncModels||{},synchronizationCalibration:run.synchronizationCalibration||null,synchronization:run.sync||[],incidents:run.incidents,sampleColumns:['sequence','eventTimeMs','receiptTimeMs','ax','ay','az','reportedIntervalMs','usedTimeMs','masterTimeAtCaptureMs'],acceleration:'includingGravity',units:'m/s²',timestampMeaning:'DOM event/receipt times; not certified hardware acquisition times',clockFormula:'masterMs = localMs - offset - drift * (localMs - reference)',clockCorrection:'masterTimeAtCaptureMs usa el modelo de reloj robusto fijado al inicio del ensayo más la corrección física fija de la tablilla; los intercambios posteriores solo diagnostican su estabilidad.',userAgent:navigator.userAgent};
    }
    function localRecord() {return s.run?{...runMeta(s.run),samples:s.run.samples}:null;}
    async function finishRun(cancelled=false) {
        const run=s.run;if(!run||run.finishing||run.finished)return;run.finishing=true;
        run.state=cancelled?'cancelled':'finished';run.finalClock=s.role==='host'?run.initialClock:structuredClone(s.syncModel);
        stopDuringSync();document.body.classList.remove('recording-lock');releaseWake();
        $('jointMeasureState').textContent='Cerrando registro…';
        await persistBeforeClosing(run);run.finished=true;run.finishing=false;
        if(s.run!==run)return;
        const record=localRecord();s.results.set(s.id,record);tab('Results');renderPlan();renderDevices();renderResults();
        tell(cancelled?'Ensayo cancelado. Los datos disponibles se conservan.':'Registro local terminado. Ya puedes descargar los datos.');
        if(s.role==='guest'&&!cancelled)sendRecord().catch(e=>{incident('transfer',e.message);tell('Registro local conservado. '+e.message,true);});
    }

    async function hashText(text) {
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
    }
    function validateRecord(r,id,runId) {
        if(!r||r.schema!=='pasarelas-upm-joint-v1'||r.id!==runId||r.device?.id!==id||!Array.isArray(r.samples)||r.samples.length>MAX_SAMPLES)throw Error('Registro recibido incompatible.');
        if(!Array.isArray(r.incidents)||!r.windowMasterMs||![r.windowMasterMs.start,r.windowMasterMs.end].every(finite))throw Error('Ventana temporal no válida.');
        for(let i=0;i<r.samples.length;i++){const row=r.samples[i];if(!Array.isArray(row)||(row.length!==8&&row.length!==9)||row[0]!==i||![row[2],row[3],row[4],row[5],row[7]].every(finite)||(row.length===9&&!finite(row[8])))throw Error('Muestras recibidas no válidas.');}
    }
    async function acknowledged(p,message,index) {
        for(let attempt=0;attempt<3;attempt++) {
            if(p.channel?.readyState!=='open')throw Error('La conexión se ha cerrado. Reconecta y reenvía el registro.');
            const key=message.transferId+':'+index;
            try {
                await new Promise((resolve,reject)=>{
                    const timer=setTimeout(()=>{p.acks.delete(key);reject(Error('Sin confirmación del bloque.'));},4000);
                    p.acks.set(key,()=>{clearTimeout(timer);resolve();});
                    if(!send(p,message)){clearTimeout(timer);p.acks.delete(key);reject(Error('No se pudo enviar el bloque.'));}
                });return;
            }catch(e){if(attempt===2)throw e;}
        }
    }
    async function sendRecord() {
        if(s.role!=='guest')return;
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        if(s.transfer)throw Error('Hay una transferencia en curso.');
        const host=[...s.peers.values()][0];if(!host||host.channel?.readyState!=='open')throw Error('No hay conexión con el maestro. Descarga tus datos localmente.');
        s.transfer={percent:0};renderResults();
        try {
            const text=JSON.stringify(localRecord()),hash=await hashText(text),transferId=uid(),count=Math.ceil(text.length/12000);
            if(text.length>80000000)throw Error('Registro demasiado grande para transferir. Descárgalo localmente.');
            await acknowledged(host,{type:'TRANSFER_BEGIN',transferId,runId:s.run.id,size:text.length,count,hash},-1);
            for(let i=0;i<count;i++) {
                await acknowledged(host,{type:'TRANSFER_CHUNK',transferId,index:i,data:text.slice(i*12000,(i+1)*12000)},i);
                s.transfer.percent=Math.round(100*(i+1)/count);renderResults();
            }
            await acknowledged(host,{type:'TRANSFER_END',transferId},count);
            s.run.transferred=true;tell('El maestro ha recibido el registro y verificado su integridad.');
        }finally{s.transfer=null;renderResults();}
    }
    function renderResults() {
        const r=s.run;
        $('jointDownload').disabled=!r?.finished;$('jointCsv').disabled=!r?.finished;$('jointDownloadProcessed').disabled=!r?.finished;$('jointCsvProcessed').disabled=!r?.finished;
        $('jointNewRun').disabled=!!running()||!!s.transfer||!!r?.finishing;
        $('jointSendData').hidden=s.role!=='guest';$('jointSendData').disabled=!r?.finished||!!s.transfer;
        if(!r){$('jointResultsList').textContent='Todavía no hay un ensayo registrado.';$('jointSyncResults').hidden=true;return;}
        let html=`<p><strong>${r.state==='cancelled'?'Ensayo cancelado':r.finished?'Registro terminado':'Ensayo en curso'}</strong> · ${escape(r.plan.name)}</p>`;
        const expected=[r.device,...(s.role==='host'?[...s.peers.values()].filter(p=>r.plan.points.some(q=>q.device===p.id)).map(p=>({id:p.id,name:p.name})):[])];
        for(const d of expected) {
            const data=s.results.get(d.id);
            html+=`<article class="joint-device-card"><strong>${escape(d.name)}</strong><p>${data?data.samples.length+' muestras · '+data.incidents.length+' incidencias':d.id===s.id?r.samples.length+' muestras locales':'Registro pendiente de recibir'}</p></article>`;
        }
        if(s.transfer)html+=`<p>Enviando al maestro: ${s.transfer.percent}%</p>`;
        if(r.transferred)html+='<p>Registro confirmado por el maestro.</p>';
        if(s.storageFailed)html+='<p class="joint-warning">El guardado persistente ha fallado: descarga los datos antes de cerrar.</p>';
        $('jointResultsList').innerHTML=html;
        renderSyncResults(r);
    }
    function clearSyncCharts(){for(const chart of s.syncCharts)chart?.destroy();s.syncCharts=[];}
    const modelOffsetAt=(model,time)=>{const m=model||{offset:0,drift:0,reference:0};return m.offset+m.drift*(time-m.reference);};
    const offsetResidual=(row,model)=>row.offset-modelOffsetAt(model,row.local);
    const selectedForModel=(row,model)=>!finite(model?.rttCutoff)||row.rtt<=model.rttCutoff;
    function syncMetric(row,metric,model){return metric==='rtt'?row.rtt:offsetResidual(row,model);}
    function jointTemporalOptions(duration,yTitle,tooltip,legend=true) {
        return {responsive:true,maintainAspectRatio:false,animation:false,normalized:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:legend,position:'top',labels:{boxWidth:22,font:{size:11}}},tooltip:{callbacks:{title:items=>items.length?'t = '+items[0].parsed.x.toFixed(3)+' s':'',label:tooltip}},zoom:{pan:{enabled:true,mode:'xy'},zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'xy'},limits:{x:{min:0,max:duration},y:{min:'original',max:'original'}}}},scales:{x:{type:'linear',min:0,max:duration,title:{display:true,text:'Tiempo desde el inicio del ensayo (s)'},grid:{color:'rgba(0,0,0,.08)'}},y:{title:{display:true,text:yTitle},grid:{color:'rgba(0,0,0,.08)'}}}};
    }
    function histogramBins(values,count) {
        let low=Math.min(...values),high=Math.max(...values);
        if(low===high){const pad=Math.max(.05,Math.abs(low)*.05);low-=pad;high+=pad;}
        const span=high-low, step=span/count, bins=Array.from({length:count},(_,index)=>({low:low+index*step,high:index===count-1?high:low+(index+1)*step,count:0}));
        for(const value of values){const index=Math.min(count-1,Math.max(0,Math.floor((value-low)/span*count)));bins[index].count++;}
        return bins;
    }
    function histogramMarkup(group,phase,metric,values) {
        const key=`${group.key}:${phase}:${metric}`,focus=s.syncView.focus[key],raw=values.filter(finite),data=focus?raw.filter(value=>value>=focus.low&&value<=focus.high):raw;
        const label=metric==='rtt'?'RTT':'Residuo de offset',phaseLabel=phase==='pre'?'Calibración — 200 intercambios a 20 Hz':'Durante el ensayo — 10/s';
        if(!data.length)return `<figure class="joint-rtt-figure"><figcaption>${label} · ${phaseLabel} · sin intercambios en este rango</figcaption></figure>`;
        const suffix=focus?` · zoom: ${focus.low.toFixed(2)} a ${focus.high.toFixed(2)} ms`:'';
        const detail=metric==='offset'?' · respecto al modelo inicial robusto':'';
        return `<figure class="joint-rtt-figure joint-sync-histogram"><figcaption><strong>${label}</strong> · ${phaseLabel}${detail}<br>${data.length} intercambios · mín. ${Math.min(...data).toFixed(2)} ms · mediana ${median(data).toFixed(2)} ms${suffix}</figcaption><div class="joint-histogram-controls"><label>Clases <select data-sync-bins><option value="8">8</option><option value="12">12</option><option value="20">20</option><option value="32">32</option><option value="48">48</option></select></label>${focus?`<button type="button" class="joint-secondary" data-sync-reset="${escape(key)}">Quitar zoom</button>`:'<span>Pulsa una barra para ampliar</span>'}</div><div class="joint-sync-canvas"><canvas id="syncHist-${escape(key)}" aria-label="Histograma de ${label} en ${phaseLabel}"></canvas></div></figure>`;
    }
    function timelineMarkup(group,metric) {
        const label=metric==='rtt'?'RTT':'Residuo de offset';
        return `<figure class="joint-rtt-figure joint-sync-timeline"><figcaption><strong>${label} durante el ensayo</strong> · rueda o pellizco para ampliar; arrastra en X e Y. La leyenda permite ocultar series.</figcaption><div class="joint-sync-canvas joint-sync-timeline-canvas"><canvas id="syncTimeline-${escape(group.key)}-${metric}" aria-label="${label} a lo largo del ensayo"></canvas></div><button type="button" class="joint-secondary" data-sync-chart-reset="${escape(group.key)}:${metric}">Restablecer zoom</button></figure>`;
    }
    function makeHistogramChart(canvas,values,key) {
        const focus=s.syncView.focus[key],data=(focus?values.filter(value=>value>=focus.low&&value<=focus.high):values).filter(finite);if(!canvas||!data.length)return;
        const bins=histogramBins(data,s.syncView.bins),labels=bins.map(bin=>`${bin.low.toFixed(2)}–${bin.high.toFixed(2)}`);
        const chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'Intercambios',data:bins.map(bin=>bin.count),backgroundColor:'#087cc3',borderColor:'#056aa8',borderWidth:1,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>labels[items[0].dataIndex]+' ms',label:item=>item.raw+' intercambios'}}},scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:5,font:{size:10}},title:{display:true,text:'ms'}},y:{beginAtZero:true,ticks:{precision:0},title:{display:true,text:'Número de intercambios'}}},onClick:(event,elements)=>{if(!elements.length)return;const bin=bins[elements[0].index];s.syncView.focus[key]={low:bin.low,high:bin.high};renderSyncResults(s.run);}}});
        s.syncCharts.push(chart);
    }
    function makeTimelineChart(canvas,rows,run,metric,model) {
        if(!canvas)return;const duration=Math.max(1,(run.end-run.start)/1000),points=rows.filter(row=>finite(syncMetric(row,metric,model))&&finite(row.t1)&&row.t1>=run.start&&row.t1<=run.end).map(row=>({x:(row.t1-run.start)/1000,y:syncMetric(row,metric,model),accepted:selectedForModel(row,model)})).sort((a,b)=>a.x-b.x);if(!points.length)return;
        const accepted=points.filter(point=>point.accepted),rejected=points.filter(point=>!point.accepted),label=metric==='rtt'?'RTT (ms)':'Residuo de offset (ms)',color=metric==='rtt'?'#087cc3':'#8e24aa';
        const datasets=[{label:'Intercambios aceptados',data:accepted,borderColor:color,backgroundColor:color,pointRadius:3,pointHoverRadius:5,borderWidth:1.6,tension:.12},{label:'RTT alto / descartados',data:rejected,borderColor:'#98a8b5',backgroundColor:'#98a8b5',pointRadius:3,pointHoverRadius:5,borderWidth:0,showLine:false}];
        if(metric==='offset')datasets.push({label:'Modelo aplicado (0 ms)',data:[{x:0,y:0},{x:duration,y:0}],borderColor:'#263746',borderDash:[6,4],borderWidth:1.4,pointRadius:0,pointHoverRadius:0});
        const options=jointTemporalOptions(duration,label,item=>item.dataset.label+': '+item.parsed.y.toFixed(3)+' ms',true);
        const chart=new Chart(canvas.getContext('2d'),{type:'line',data:{datasets},options});s.syncCharts.push(chart);enableLegendToggling(chart);
    }
    function modelSummaryMarkup(model) {
        if(!model||!finite(model.offset))return '<p class="joint-help">No se conservó el modelo inicial de este dispositivo.</p>';
        const ppm=finite(model.drift)?model.drift*1e6:0;
        return `<div class="joint-model-values"><span><b>Offset robusto</b>${model.offset.toFixed(3)} ms</span><span><b>Deriva</b>${model.drift.toExponential(3)} ms/ms · ${ppm.toFixed(3)} ppm</span><span><b>Referencia</b>${model.reference.toFixed(1)} ms</span><span><b>Intercambios</b>${model.selectedCount??'—'} / ${model.count??'—'} seleccionados</span><span><b>RTT seleccionado</b>mín. ${finite(model.rtt)?model.rtt.toFixed(2):'—'} ms · mediana ${finite(model.rttMedian)?model.rttMedian.toFixed(2):'—'} ms</span><span><b>Umbral RTT</b>${finite(model.rttCutoff)?model.rttCutoff.toFixed(2):'—'} ms</span></div>`;
    }
    function renderSyncResults(run) {
        const target=$('jointRttHistograms'),groups=[];clearSyncCharts();
        if(s.role==='host') {
            for(const p of s.peers.values()) {
                const rows=p.samples.filter(row=>row.runId===run.id);
                const duringRows=rows.filter(row=>row.phase==='during');
                const preRows=p.samples.filter(row=>row.phase==='precal'),model=run.syncModels?.[p.id]||p.startModel||p.model;groups.push({key:p.id,name:p.name||'Participante',preRows,duringRows,model});
            }
        } else {
            const rows=s.syncLog.filter(row=>row.runId===run.id);
            const duringRows=rows.filter(row=>row.phase==='during');
            groups.push({key:'master',name:'Maestro',preRows:s.syncLog.filter(row=>row.phase==='precal'),duringRows,model:run.networkClock||run.initialClock});
        }
        const useful=groups.some(group=>group.preRows.length||group.duringRows.length);
        $('jointSyncResults').hidden=!useful;
        $('jointSyncFormula').innerHTML=`<div class="joint-sync-formula"><strong>Modelo aplicado a las marcas temporales</strong><div><i>t</i><sub>maestro</sub> = <i>t</i><sub>participante</sub> − [offset<sub>0</sub> + deriva · (<i>t</i><sub>participante</sub> − referencia)]</div><small>El offset<sub>0</sub> es la mediana del 30 % de intercambios con RTT menor. La deriva se estima con Theil–Sen si hay al menos 20 s de datos útiles. El modelo se fija antes del ensayo; los intercambios posteriores solo diagnostican su estabilidad.</small></div>`;
        target.innerHTML=groups.map(group=>{const preRtt=group.preRows.map(row=>row.rtt),duringRtt=group.duringRows.map(row=>row.rtt),preOffset=group.preRows.map(row=>syncMetric(row,'offset',group.model)),duringOffset=group.duringRows.map(row=>syncMetric(row,'offset',group.model));return `<article class="joint-rtt-group"><h5>${escape(group.name)}</h5>${modelSummaryMarkup(group.model)}<div class="joint-rtt-grid">${histogramMarkup(group,'pre','rtt',preRtt)}${histogramMarkup(group,'pre','offset',preOffset)}${histogramMarkup(group,'during','rtt',duringRtt)}${histogramMarkup(group,'during','offset',duringOffset)}</div><div class="joint-sync-timeline-grid">${timelineMarkup(group,'rtt')}${timelineMarkup(group,'offset')}</div></article>`;}).join('');
        target.querySelectorAll('[data-sync-bins]').forEach(select=>{select.value=String(s.syncView.bins);select.addEventListener('change',event=>{s.syncView.bins=Number(event.target.value);renderSyncResults(run);});});
        target.querySelectorAll('[data-sync-reset]').forEach(button=>button.addEventListener('click',()=>{delete s.syncView.focus[button.dataset.syncReset];renderSyncResults(run);}));
        target.querySelectorAll('[data-sync-chart-reset]').forEach(button=>button.addEventListener('click',()=>{const [groupKey,metric]=button.dataset.syncChartReset.split(':');const chart=s.syncCharts.find(item=>item.canvas.id===`syncTimeline-${groupKey}-${metric}`);chart?.resetZoom();}));
        for(const group of groups){for(const [phase,rows] of [['pre',group.preRows],['during',group.duringRows]])for(const metric of ['rtt','offset'])makeHistogramChart($(`syncHist-${group.key}:${phase}:${metric}`),rows.map(row=>syncMetric(row,metric,group.model)),`${group.key}:${phase}:${metric}`);for(const metric of ['rtt','offset'])makeTimelineChart($(`syncTimeline-${group.key}-${metric}`),group.duringRows,run,metric,group.model);}
    }
    function exportSession() {
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        const records=[...s.results.values()].map(r=>{
            // Keep originals; use one final model per record to avoid time jumps.
            const model=r.device.id===s.id?r.finalClock:(s.peers.get(r.device.id)?.model||r.finalClock);
            const valid=validModel(model)||r.device.role==='host';
            return {...r,exportClock:valid?model:r.initialClock,samples:r.samples.map(row=>({raw:row,masterTimeMs:finite(row[8])?row[8]:toMaster(row[7],valid?model:r.initialClock)}))};
        });
        const expected=s.run.plan.points.filter(p=>p.device).map(p=>p.device);
        download('ensayo_conjunto_'+s.run.id+'.json',{schema:'pasarelas-upm-joint-export-v1',session:s.session,plan:s.run.plan,windowMasterMs:{start:s.run.start,end:s.run.end},complete:expected.every(id=>s.results.has(id)),missingDevices:expected.filter(id=>!s.results.has(id)),networkClockLog:Object.fromEntries([...s.peers.values()].map(p=>[p.id,p.samples])),records,validation:'Experimental: no certified physical sensor synchronization. Data have not been resampled.'});
    }
    function processedCommonExport() {
        const data=comparisonExport();if(!data)throw Error('Termina primero el ensayo y recibe los registros disponibles.');
        const start=data.windowMasterMs.start,end=data.windowMasterMs.end,records=data.records.filter(record=>record.samples?.length),periods=records.map(record=>samplePeriodMs(record,start,end)).filter(finite);
        if(!periods.length)throw Error('No hay suficientes marcas temporales para crear la malla común.');
        const period=Math.max(...periods),grid=[];for(let t=start;t<=end+.1;t+=period)grid.push(t);
        const processed=records.map(record=>{
            const axes=[0,1,2].map(axis=>resampleAxis(record.samples,sample=>structuralValue(sample.raw,record,axis),grid));
            axes[2]=detrendPoints(axes[2]);
            const byTime=axes.map(series=>new Map(series.map(point=>[Math.round(point.x*1000),point.y])));
            const samples=grid.map(t=>{const key=Math.round(t*1000);return {masterTimeMs:t,x:byTime[0].get(key)??null,y:byTime[1].get(key)??null,z:byTime[2].get(key)??null};});
            return {device:record.device,calibration:record.device?.calibration||null,samples};
        });
        return {schema:'pasarelas-upm-joint-processed-v1',source:'muestras brutas transformadas y remuestreadas',plan:data.plan,windowMasterMs:data.windowMasterMs,commonPeriodMs:period,commonRateHz:1000/period,zProcessing:'detrend lineal por móvil tras interpolación',records:processed};
    }
    function exportProcessedJson() {const data=processedCommonExport();download('ensayo_conjunto_procesado_'+s.run.id+'.json',data);}
    function exportProcessedCsv() {
        const data=processedCommonExport(),cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
        const lines=['master_time_s,device,point,x_structural_m_s2,y_structural_m_s2,z_structural_detrended_m_s2'];
        data.records.forEach(record=>record.samples.forEach(sample=>lines.push([((sample.masterTimeMs-data.windowMasterMs.start)/1000).toFixed(6),record.device.name,record.device.point?.name,sample.x,sample.y,sample.z].map(cell).join(','))));
        download('ensayo_conjunto_procesado_'+s.run.id+'.csv','\ufeff'+lines.join('\n'),'text/csv;charset=utf-8');
    }
    function exportCsv() {
        const r=localRecord();if(!r||!s.run.finished)throw Error('No hay un registro terminado.');
        const model=r.finalClock,point=r.device.point;
        const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
        const columns=['device','point','point_x_m','point_y_m','axis','angle_deg','sequence','event_time_ms','receipt_time_ms','ax_m_s2','ay_m_s2','az_m_s2','reported_interval_ms','used_time_ms','master_time_at_capture_ms','master_time_estimated_ms','inside_window'];
        const lines=r.samples.map(row=>{const t=finite(row[8])?row[8]:toMaster(row[7],model);return [r.device.name,point?.name,point?.x,point?.y,point?.axis,point?.angle,...row,t,t>=r.windowMasterMs.start&&t<=r.windowMasterMs.end?1:0].map(cell).join(',');});
        download('aceleraciones_'+r.id+'_'+s.id+'.csv','\ufeff'+columns.join(',')+'\n'+lines.join('\n'),'text/csv;charset=utf-8');
    }
    function comparisonExport() {
        if(s.compareExport) return s.compareExport;
        if(!s.run?.finished) return null;
        const records=[...s.results.values()].map(r=>{
            const model=r.device.id===s.id?r.finalClock:(s.peers.get(r.device.id)?.model||r.finalClock);
            const use=validModel(model)||r.device.role==='host'?model:r.initialClock;
            return {...r,samples:r.samples.map(raw=>({raw,masterTimeMs:finite(raw[8])?raw[8]:toMaster(raw[7],use)}))};
        });
        return {plan:s.run.plan,windowMasterMs:{start:s.run.start,end:s.run.end},records};
    }
    function validComparisonExport(data) {
        if(!data||!data.plan||!Array.isArray(data.records)||!data.windowMasterMs||!finite(data.windowMasterMs.start)||!finite(data.windowMasterMs.end)) throw Error('El archivo no es un ensayo conjunto válido.');
        if(data.records.length<1||data.records.length>MAX_PEERS+1)throw Error('El archivo contiene un número no válido de registros.');
        for(const record of data.records) {
            if(!record?.device?.id||!Array.isArray(record.samples))throw Error('Falta un registro de móvil válido.');
            for(const sample of record.samples) if(!sample||!Array.isArray(sample.raw)||sample.raw.length<8||!finite(sample.masterTimeMs))throw Error('El archivo contiene muestras incompatibles.');
        }
        return data;
    }
    function median(values) {
        const a=values.filter(finite).sort((x,y)=>x-y),n=a.length;if(!n)return null;
        return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
    }
    function samplePeriodMs(record,start,end) {
        const times=record.samples.map(s=>s.masterTimeMs).filter(t=>finite(t)&&t>=start-1000&&t<=end+1000).sort((a,b)=>a-b);
        return median(times.slice(1).map((t,i)=>t-times[i]).filter(dt=>dt>=5&&dt<=250));
    }
    function structuralValue(raw,record,axis) {
        return correctedVector([raw[3],raw[4],raw[5]],record.device?.calibration)[axis];
    }
    function resampleAxis(samples,getValue,grid) {
        const source=samples.filter(s=>finite(s.masterTimeMs)&&finite(getValue(s))).sort((a,b)=>a.masterTimeMs-b.masterTimeMs),out=[];
        let i=0;
        for(const t of grid) {
            while(i+1<source.length&&source[i+1].masterTimeMs<t)i++;
            const a=source[i],b=source[i+1];
            if(!a||!b||b.masterTimeMs===a.masterTimeMs||t<a.masterTimeMs||t>b.masterTimeMs)continue;
            const r=(t-a.masterTimeMs)/(b.masterTimeMs-a.masterTimeMs);
            out.push({x:t,y:getValue(a)+r*(getValue(b)-getValue(a))});
        }
        return out;
    }
    function detrendPoints(points) {
        if(points.length<2)return points;
        const n=points.length,sx=points.reduce((a,p)=>a+p.x,0),sy=points.reduce((a,p)=>a+p.y,0),sxx=points.reduce((a,p)=>a+p.x*p.x,0),sxy=points.reduce((a,p)=>a+p.x*p.y,0),d=n*sxx-sx*sx,m=Math.abs(d)>1e-12?(n*sxy-sx*sy)/d:0,b=(sy-m*sx)/n;
        return points.map(p=>({x:p.x,y:p.y-(m*p.x+b)}));
    }
    function renderComparison() {
        const status=$('jointCompareStatus'),data=comparisonExport();
        for(const chart of s.compareCharts||[])chart.destroy();s.compareCharts=[];
        for(const chart of Object.values(s.jointCharts||{}))chart?.destroy();s.jointCharts={time:null,spectrum:null};
        if(!data) {status.textContent='Termina un ensayo y recibe los registros de los participantes para compararlos aquí.';return;}
        const records=data.records.filter(r=>r.samples?.length).sort((a,b)=>{
            const ap=data.plan.points?.find(p=>p.device===a.device.id),bp=data.plan.points?.find(p=>p.device===b.device.id);
            return (ap?.x??0)-(bp?.x??0);
        });
        if(!records.length) {status.textContent='El ensayo no contiene muestras para representar.';return;}
        if(typeof Chart==='undefined') {status.textContent='No se ha cargado la librería de gráficas. Recarga la página con conexión.';return;}
        const start=data.windowMasterMs.start,end=data.windowMasterMs.end,span=Math.max(1,end-start),axes=[['X',0,'#1565c0','jointCompareCanvasX'],['Y',1,'#c62828','jointCompareCanvasY'],['Z',2,'#2e7d32','jointCompareCanvasZ']],dashes=[[],[8,5],[3,4],[11,4,2,4]],view=$('jointCompareView').value;
        const periods=records.map(r=>samplePeriodMs(r,start,end)).filter(finite),commonPeriod=periods.length?Math.max(...periods):null,grid=[];
        if(view==='common'&&!finite(commonPeriod)){status.textContent='No hay suficientes marcas temporales válidas para construir la rejilla común.';return;}
        if(view==='common'&&finite(commonPeriod))for(let t=start;t<=end+.1;t+=commonPeriod)grid.push(t);
        status.textContent=view==='common'?`${records.length} móviles · rejilla común de ${commonPeriod.toFixed(2)} ms (${(1000/commonPeriod).toFixed(1)} Hz) · interpolación lineal a partir de las marcas temporales corregidas al reloj maestro.`:`${records.length} móviles · marcas temporales originales ya referidas al reloj del maestro; sin remuestreo.`;
        for(const [axis,axisIndex,color,canvasId] of axes) {
            const datasets=[];
            records.forEach((record,deviceIndex)=>{
                const point=data.plan.points?.find(p=>p.device===record.device.id),name=(record.device.name||'Móvil')+(point?' · '+point.name:'');
                const getter=sample=>structuralValue(sample.raw,record,axisIndex);
                const valid=record.samples.filter(sample=>finite(sample.masterTimeMs)&&finite(getter(sample))&&sample.masterTimeMs>=start&&sample.masterTimeMs<=end);
                let points=view==='common'?resampleAxis(record.samples,getter,grid).map(p=>({x:(p.x-start)/1000,y:p.y})):valid.map(sample=>({x:(sample.masterTimeMs-start)/1000,y:getter(sample)}));
                if(axis==='Z')points=detrendPoints(points);
                const stride=Math.max(1,Math.ceil(points.length/4500));
                datasets.push({label:name,data:points.filter((_,i)=>i%stride===0),borderColor:color,borderDash:dashes[deviceIndex%dashes.length],borderWidth:deviceIndex?1.35:2.15,pointRadius:0,tension:0,parsing:false});
            });
            const options=jointTemporalOptions(span/1000,axis==='Z'?'Aceleración Z con detrend (m/s²)':'Aceleración '+axis+' (m/s²)',item=>item.dataset.label+': '+item.parsed.y.toFixed(4)+' m/s²',true);options.scales.x.title.text='Tiempo en el reloj maestro (s)';
            const chart=new Chart($(canvasId).getContext('2d'),{type:'line',data:{datasets},options});
            s.compareCharts.push(chart);enableLegendToggling(chart);
        }
    }
    function ensureJointCharts() {
        if(typeof Chart==='undefined')return false;
        const common={responsive:true,maintainAspectRatio:false,animation:false,events:[],parsing:false,plugins:{legend:{position:'top',labels:{boxWidth:28,font:{size:12}}}},scales:{x:{type:'linear',grid:{color:'rgba(0,0,0,.08)'}},y:{grid:{color:'rgba(0,0,0,.08)'}}}};
        if(!s.jointCharts.time)s.jointCharts.time=new Chart($('jointLive').getContext('2d'),{type:'line',data:{datasets:[{label:'X',data:[],borderColor:'#1565c0',borderWidth:2,pointRadius:0},{label:'Y',data:[],borderColor:'#c62828',borderWidth:2,pointRadius:0},{label:'Z',data:[],borderColor:'#2e7d32',borderWidth:2,pointRadius:0}]},options:{...common,scales:{x:{...common.scales.x,min:0,max:5,title:{display:true,text:'Tiempo (s)'}},y:{...common.scales.y,title:{display:true,text:'Aceleración (m/s²)'}}}}});
        if(!s.jointCharts.spectrum)s.jointCharts.spectrum=new Chart($('jointLiveSpectrum').getContext('2d'),{type:'line',data:{datasets:[{label:'X',data:[],borderColor:'#1565c0',borderWidth:2,pointRadius:0},{label:'Y',data:[],borderColor:'#c62828',borderWidth:2,pointRadius:0},{label:'Z',data:[],borderColor:'#2e7d32',borderWidth:2,pointRadius:0}]},options:{...common,scales:{x:{...common.scales.x,min:0,max:30,title:{display:true,text:'Frecuencia (Hz)'}},y:{...common.scales.y,min:0,title:{display:true,text:'Amplitud'}}}}});
        return true;
    }
    function drawPreview() {
        if(!ensureJointCharts())return;
        const rows=s.preview.filter(v=>v[2]>now()-5000);if(rows.length<2)return;
        const baseline=s.run?.previewBaseline||[0,0,0],start=rows[0][2],values=rows.map(v=>correctedVector(v.slice(3,6)).map((value,index)=>value-baseline[index]));
        const chart=s.jointCharts.time,max=Math.max(.2,...values.flatMap(v=>v.map(Math.abs))),limit=Math.ceil(max*2)/2;
        chart.data.datasets.forEach((dataset,axis)=>dataset.data=rows.map((row,index)=>({x:(row[2]-start)/1000,y:values[index][axis]})));
        chart.options.scales.x.min=0;chart.options.scales.x.max=5;chart.options.scales.y.min=-limit;chart.options.scales.y.max=limit;chart.update('none');
    }
    function refreshJointPreviewBaseline(run) {
        const quiet=s.recent.filter(sample=>sample[2]>=now()-750).map(sample=>correctedVector(sample.slice(3,6)));
        if(quiet.length<6)return;
        run.previewBaseline=['x','y','z'].map((_,index)=>median(quiet.map(values=>values[index])));
    }
    function drawLiveSpectrum() {
        if(!ensureJointCharts())return;
        const rows=s.preview.filter(v=>v[2]>now()-5000);if(rows.length<16)return;
        const baseline=s.run?.previewBaseline||[0,0,0],source=rows.map(v=>{const q=correctedVector(v.slice(3,6));return {ax:q[0]-baseline[0],ay:q[1]-baseline[1],az:q[2]-baseline[2]};}),rate=sampleRate();if(!finite(rate)||rate<2)return;
        const chart=s.jointCharts.spectrum,spectra=[calculateSpectrum(source,'ax',rate),calculateSpectrum(source,'ay',rate),calculateSpectrum(source,'az',rate)],max=Math.max(.001,...spectra.flatMap(series=>series.map(p=>p.y))),limit=Math.ceil(max*100)/100;
        chart.data.datasets.forEach((dataset,axis)=>dataset.data=spectra[axis]);chart.options.scales.x.min=0;chart.options.scales.x.max=30;chart.options.scales.y.min=0;chart.options.scales.y.max=limit;chart.update('none');
    }
    function tick() {
        if(root.hidden)return;
        const r=s.run;
        if(s.calibration.active) {
            const a=s.calibration.active,t=now();
            if(t>=a.end)finishCalibration();
            else if(t<a.start)$('jointCalibrationHelp').textContent='Mantén el móvil quieto: calculando la continua de referencia.';
            else $('jointCalibrationHelp').textContent='Registrando gesto: detrend y filtro paso bajo de 10 Hz…';
            renderCalibrationCountdown();
        }
        const gesture=s.syncCalibration.gesture;
        // El cierre del gesto también debe usar el reloj del maestro en el participante.
        // Comparar now() local con gesture.end provocaba capturas vacías o retrasadas.
        const gestureMasterNow=gesture?(s.role==='host'?now():toMaster(now(),gesture.model||s.syncModel)):null;
        if(gesture&&finite(gestureMasterNow)&&gestureMasterNow>=gesture.end&&gesture.phase!=='finished') {
            gesture.phase='finished';
            if(s.role==='guest'&&!gesture.sent){
                gesture.sent=true;const host=[...s.peers.values()][0];
                send(host,{type:'SYNC_GESTURE_RESULT',id:gesture.id,axis:gesture.axis,samples:gesture.samples,calibration:s.calibration});
                tell('Ventana del gesto enviada al maestro. Procesando correlaciones…');
            }
        }
        renderSyncCalibration();
        if(s.transaction?.phase==='ready') {
            $('jointMeasureState').textContent='Confirmando dispositivos…';
        }
        if(r&&activeStates.has(r.state)) {
            const t=toMaster(now(),r.initialClock);
            if(t<r.start){
                refreshJointPreviewBaseline(r);
                $('jointMeasureState').textContent='Inicio en '+Math.max(0,Math.ceil((r.start-t)/1000))+' s';
            }
            else {
                if(r.state==='armed')refreshJointPreviewBaseline(r);
                r.state='recording';const elapsed=Math.max(0,Math.min(t,r.end)-r.start);
                $('jointMeasureState').textContent=t>r.end?'Guardando margen final…':Math.floor(elapsed/60000).toString().padStart(2,'0')+':'+Math.floor(elapsed/1000%60).toString().padStart(2,'0');
                $('jointRunTime').textContent=Math.floor(elapsed/60000).toString().padStart(2,'0')+':'+(elapsed/1000%60).toFixed(1).padStart(4,'0');
                $('jointProgress').value=Math.min(1,elapsed/Math.max(1,r.end-r.start));
            }
            if(t>r.end+1000)finishRun().catch(e=>tell(e.message,true));
        }
        $('jointSampleCount').textContent=r?.samples.length||0;$('jointRate').textContent=localStatus().sensor?sampleRate().toFixed(1)+' Hz':'—';
        drawPreview();
        if(s.uiTick%4===0)drawLiveSpectrum();
        if(++s.uiTick%4===0){renderDevices();broadcast({type:'STATUS',status:localStatus()});if(running())persist();}
    }
    function resetSession() {
        if((running()||s.transaction)&&!confirm('¿Cancelar la medida y salir? Los bloques guardados seguirán disponibles en este navegador.'))return;
        if(running()||s.transaction)stopRun('Salida de la sesión');
        if(s.run){if(running())s.run.state='cancelled';persist();}
        stopScan();if($('jointPairDialog').open)$('jointPairDialog').close();
        for(const p of s.peers.values())disposePeer(p);s.peers.clear();s.currentInvite=null;
        stopJointSensor();stopDuringSync();document.body.classList.remove('recording-lock');releaseWake();
        for(const chart of s.compareCharts||[])chart.destroy();s.compareCharts=[];
        s.role=null;s.session=null;s.run=null;s.results.clear();s.compareExport=null;s.pending=null;s.transaction=null;s.syncLog=[];s.recent=[];s.rateTimes=[];s.preview=[];s.planView=null;s.planPan=null;s.planPinch=null;s.planPointers.clear();
        s.calibration={map:{},active:null,complete:false};s.syncCalibration={phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0};$('jointCalibration').hidden=true;$('jointCalibrationOverride').hidden=true;
        s.syncModel={offset:0,drift:0,reference:0,rtt:null,count:0,updated:0};s.id=uid();
        root.hidden=true;$('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        if(s.returnTo)s.returnTo.style.display='block';else $('mainMenu').style.display='block';
        history.replaceState(null,'',location.pathname+location.search);
    }

    // UI bindings. All generated text is escaped before entering markup.
    $('openJointButton').addEventListener('click',guard(open));
    $('standaloneTestButton').addEventListener('click',guard(()=>{
        if(typeof Chart==='undefined')throw Error('No se ha cargado la librería de gráficas. Recarga la página con conexión.');
        mainMenu.style.display='none';testForm.style.display='block';
        if(accelerationChart===null){createAccelerationChart();createSpectrumChart();createPsdChart();createRmsChart();[accelerationChart,spectrumChart,psdChart,rmsChart].forEach(enableLegendToggling);}
    }));
    $('jointExit').addEventListener('click',resetSession);
    document.querySelectorAll('[data-joint-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.jointTab);if(b.dataset.jointTab==='Results')renderResults();if(b.dataset.jointTab==='Sync')renderSyncCalibration();});
    $('jointCreate').onclick=guard(()=>{
        open();s.id=uid();s.role='host';s.name='Maestro';s.session=uid();
        try{const stored=localStorage.getItem('upm-joint-plan-v1');if(stored)s.plan=checkPlan(JSON.parse(stored));}catch(e){tell('No se pudo recuperar el plano anterior.',true);}
        if(!s.plan.points.length)s.plan.points=[{id:'P1',name:'P1',x:s.plan.length/2,y:s.plan.width/2,axis:'z',angle:0,device:s.id},{id:'P2',name:'P2',x:s.plan.length/4,y:s.plan.width/2,axis:'z',angle:0,device:null}];
        else {s.plan.points.forEach(p=>p.device=null);s.plan.points[0].device=s.id;}
        s.selected=s.plan.points[0].id;workspace();tell('Define el plano y pulsa Invitar móvil para incorporar un participante.');
    });
    $('jointJoin').onclick=()=>openPair();$('jointPair').onclick=guard(()=>pairingAction(invite));
    $('jointRetryPair').onclick=guard(retryPair);
    $('jointPrepareSafari').onclick=guard(prepareSafariConnection);
    $('jointAndroidNearbyDone').onclick=()=>{$('jointAndroidNearbyNotice').hidden=true;$('jointPairStatus').textContent='Permiso indicado como activado. Reinicia el emparejamiento para usar la nueva configuración.';};
    $('jointCopyDiagnostics').onclick=guard(async()=>{
        const value=$('jointPairDiagnosticsText').textContent||s.lastPairDiagnostic;
        if(!value)throw Error('Todavía no hay un diagnóstico disponible.');
        try{await navigator.clipboard.writeText(value);$('jointPairStatus').textContent='Diagnóstico copiado. Pégalo en el chat.';}
        catch(e){$('jointPairDiagnosticsText').focus();$('jointPairStatus').textContent='Mantén pulsado el diagnóstico para copiarlo.';}
    });
    $('jointNetworkMode').onchange=()=>{$('jointPairStatus').textContent='Pulsa Reiniciar emparejamiento para generar una invitación nueva con este modo.';};
    $('jointPairClose').onclick=()=>{$('jointPairDialog').close();stopScan();};
    $('jointPairDialog').addEventListener('close',stopScan);
    $('jointReadCode').onclick=guard(()=>pairingAction(()=>readCode()));$('jointScanCode').onclick=guard(scanCode);$('jointStopScan').onclick=stopScan;
    $('jointGenerateAnswer').onclick=guard(()=>pairingAction(createGuestAnswer));
    $('jointCopyCode').onclick=guard(async()=>{const text=$('jointPairOutput').value;try{await navigator.clipboard.writeText(text);$('jointPairStatus').textContent='Código copiado.';}catch(e){$('jointPairOutput').focus();$('jointPairOutput').select();$('jointPairStatus').textContent='Selecciona y copia el código completo.';}});
    $('jointApplyGeometry').onclick=guard(()=>{
        requireHostEdit();const candidate={...s.plan,name:$('jointName').value,length:Number($('jointLength').value),width:Number($('jointWidth').value)};
        s.plan=checkPlan(candidate);
        // Una geometría nueva siempre se muestra completa y sin arrastrar la cámara previa.
        s.planView=null;s.planPan=null;s.planPinch=null;s.planPointers.clear();
        savePlan();tell('Dimensiones guardadas. Vista del plano reajustada.');
    });
    $('jointAddPointInline').onclick=guard(()=>{requireHostEdit();addPoint();});
    $('jointRemovePoint').onclick=guard(()=>{requireHostEdit();if(!s.selected)throw Error('Selecciona un punto.');s.plan.points=s.plan.points.filter(p=>p.id!==s.selected);s.selected=s.plan.points[0]?.id;savePlan();});
    $('jointResetView').onclick=guard(()=>{requireHostEdit();resetPlanView();});
    $('jointSavePlan').onclick=()=>download('plano_puntos.json',{schema:'pasarelas-upm-plan-v1',...s.plan,points:s.plan.points.map(p=>({...p,device:null}))});
    // Safari y demás navegadores gestionan el gesto horizontal con CSS Scroll Snap:
    // inercia, desplazamiento y ajuste quedan a cargo del motor de desplazamiento.
    const pointsTable=$('jointPointsTable');
    let pointTouch=null;
    const tableEditable=()=>s.role==='host'&&!running()&&!s.transaction;
    function closeNativeSwipeRows(except=null) {
        pointsTable.querySelectorAll('.joint-point-swipe').forEach(track=>{
            if(track!==except&&track.scrollLeft>2)track.scrollTo({left:0,behavior:'smooth'});
        });
    }
    function settleNativeSwipe(track) {
        if(!track?.isConnected||track.closest('.joint-point-record')?.dataset.deleting)return;
        const open=track.scrollLeft>=track.clientWidth*.72;
        track.dataset.swipeOpen=open?'true':'false';
        const button=track.querySelector('.joint-point-delete');
        if(button)button.tabIndex=open?0:-1;
        if(open&&track.dataset.fastDelete==='true'){
            track.dataset.fastDelete='false';
            const id=track.closest('[data-point-id]')?.dataset.pointId;
            if(id&&tableEditable())deletePlanPoint(id,true,false);
        }else if(!open)track.dataset.fastDelete='false';
    }
    pointsTable.addEventListener('scrollend',e=>{
        const track=e.target.closest?.('.joint-point-swipe');
        if(track)settleNativeSwipe(track);
    },true);
    // Compatibilidad con WebKit antiguos que no exponen scrollend.
    const scrollTimers=new WeakMap();
    pointsTable.addEventListener('scroll',e=>{
        const track=e.target.closest?.('.joint-point-swipe');
        if(!track)return;
        clearTimeout(scrollTimers.get(track));
        scrollTimers.set(track,setTimeout(()=>settleNativeSwipe(track),180));
    },{capture:true,passive:true});
    pointsTable.addEventListener('click',guard(e=>{
        const button=e.target.closest('[data-delete-point]');
        if(!button)return;
        e.preventDefault();
        if(tableEditable())deletePlanPoint(button.dataset.deletePoint,true,false);
    }));
    pointsTable.addEventListener('change',guard(e=>{
        const field=e.target.dataset.pointField,row=e.target.closest('[data-point-id]');
        if(!field||!row)return;
        updatePlanPoint(row.dataset.pointId,field,e.target.value);
    }));
    pointsTable.addEventListener('touchstart',e=>{
        if(!tableEditable()||e.touches.length!==1)return;
        const track=e.target.closest('.joint-point-swipe');
        if(!track||e.target.closest('.joint-point-delete'))return;
        closeNativeSwipeRows(track);
        const finger=e.touches[0];
        pointTouch={track,x:finger.clientX,y:finger.clientY,at:performance.now()};
    },{passive:true});
    pointsTable.addEventListener('touchend',e=>{
        const gesture=pointTouch;pointTouch=null;
        if(!gesture||!tableEditable()||!gesture.track.isConnected||e.changedTouches.length!==1)return;
        const finger=e.changedTouches[0];
        const dx=finger.clientX-gesture.x,dy=finger.clientY-gesture.y;
        const ms=Math.max(1,performance.now()-gesture.at);
        if(dx<-80&&Math.abs(dx)>Math.abs(dy)*1.3&&ms<=350&&-dx/ms>.75){
            gesture.track.dataset.fastDelete='true';
            // Nunca se desplaza manualmente: dejar terminar la inercia de Safari.
            setTimeout(()=>settleNativeSwipe(gesture.track),550);
        }
    },{passive:true});
    pointsTable.addEventListener('touchcancel',()=>{pointTouch=null;},{passive:true});
    pointsTable.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button===0){
            const track=e.target.closest('.joint-point-swipe');
            if(track)closeNativeSwipeRows(track);
        }
    });
    $('jointPlan').addEventListener('keydown',guard(e=>{
        const el=e.target.closest('[data-point]');if(!el)return;
        if(e.key==='Enter'||e.key===' '){e.preventDefault();s.selected=el.dataset.point;renderPlan();}
    }));
    // Doble toque y doble clic utilizan la misma detección de Pointer Events.
    // Nunca se crea un punto al tocar un móvil, al arrastrar o al pellizcar el plano.
    const PLAN_TAP_MAX_MS=500, PLAN_DOUBLE_TAP_MAX_MS=420;
    const PLAN_TAP_MAX_MOVE_PX=10, PLAN_DOUBLE_TAP_MAX_GAP_PX=28;
    $('jointPlan').addEventListener('pointerdown',guard(e=>{
        const svg=$('jointPlan'),el=e.target.closest('[data-point]'),pos=svgPosition(e);
        const canEdit=s.role==='host'&&!running()&&!s.transaction;
        const inside=pos&&pos.x>=0&&pos.x<=s.plan.length&&pos.y>=0&&pos.y<=s.plan.width;
        s.planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        s.planTapStart=canEdit&&!el&&inside&&s.planPointers.size===1?
            {pointerId:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now(),pointerType:e.pointerType}:null;
        if(s.planPointers.size>=2){
            s.lastPlanTap=null;s.planTapStart=null;
        }
        if(s.planPointers.size===2){
            const a=[...s.planPointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;
            s.planPinch={distance:Math.hypot(dx,dy),view:planViewport(),center:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}};
            s.drag=null;s.planPan=null;svg.setPointerCapture(e.pointerId);return;
        }
        if(el){
            s.lastPlanTap=null;
            s.selected=el.dataset.point;
            if(canEdit){s.drag=s.selected;svg.setPointerCapture(e.pointerId);}
            renderPlan();
        }else if(canEdit&&s.planPointers.size===1){
            s.planPan={x:e.clientX,y:e.clientY,view:planViewport(),moved:false};
            svg.setPointerCapture(e.pointerId);
        }else{
            s.lastPlanTap=null;
        }
    }));
    $('jointPlan').addEventListener('pointermove',e=>{
        if(s.planPointers.has(e.pointerId))s.planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(s.planTapStart?.pointerId===e.pointerId&&
           Math.hypot(e.clientX-s.planTapStart.x,e.clientY-s.planTapStart.y)>PLAN_TAP_MAX_MOVE_PX){
            s.planTapStart=null;s.lastPlanTap=null;
        }
        if(s.planPinch&&s.planPointers.size>=2){
            s.planTapStart=null;s.lastPlanTap=null;
            const a=[...s.planPointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y,distance=Math.max(20,Math.hypot(dx,dy)),factor=s.planPinch.distance/distance,base=s.planPinch.view,rect=$('jointPlan').getBoundingClientRect(),box=$('jointPlan').viewBox.baseVal,g=geometry(base),qx=(s.planPinch.center.x-rect.left)/rect.width*box.width,qy=(s.planPinch.center.y-rect.top)/rect.height*box.height,world={x:(qx-g.originX)/g.scale,y:(g.originY-qy)/g.scale};
            zoomPlanAt(world,factor,base);renderPlan();return;
        }
        if(s.drag){
            const pos=svgPosition(e),p=s.plan.points.find(p=>p.id===s.drag);
            if(!p||!pos)return;
            const snapped=snapPlanPosition(pos);p.x=snapped.x;p.y=snapped.y;
            renderPlan();return;
        }
        if(s.planPan){
            const dx=e.clientX-s.planPan.x,dy=e.clientY-s.planPan.y;
            // Un pequeño movimiento involuntario del dedo no debe desplazar el plano.
            if(!s.planPan.moved&&Math.hypot(dx,dy)<=PLAN_TAP_MAX_MOVE_PX)return;
            s.planPan.moved=true;s.planTapStart=null;s.lastPlanTap=null;
            const base=s.planPan.view,g=geometry(base);
            s.planView=planViewport({x:base.x-dx/g.scale,y:base.y+dy/g.scale,w:base.w,h:base.h});
            renderPlan();
        }
    });
    for(const event of ['pointerup','pointercancel'])$('jointPlan').addEventListener(event,guard(e=>{
        const tap=s.planTapStart?.pointerId===e.pointerId?s.planTapStart:null;
        const multiplePointers=s.planPointers.size>1||!!s.planPinch;
        const panned=!!s.planPan?.moved;
        s.planPointers.delete(e.pointerId);
        if(s.planPointers.size<2)s.planPinch=null;
        if(s.drag){s.drag=null;savePlan();}
        s.planPan=null;s.planTapStart=null;
        if(event!=='pointerup'||!tap||multiplePointers||panned){
            if(event==='pointercancel'||multiplePointers||panned)s.lastPlanTap=null;
            return;
        }
        const time=performance.now(),dx=e.clientX-tap.x,dy=e.clientY-tap.y;
        if(time-tap.at>PLAN_TAP_MAX_MS||Math.hypot(dx,dy)>PLAN_TAP_MAX_MOVE_PX){
            s.lastPlanTap=null;return;
        }
        const pos=svgPosition(e);
        if(!pos||pos.x<0||pos.x>s.plan.length||pos.y<0||pos.y>s.plan.width){
            s.lastPlanTap=null;return;
        }
        const prev=s.lastPlanTap;
        s.lastPlanTap={x:e.clientX,y:e.clientY,at:time,pointerType:tap.pointerType};
        if(prev&&prev.pointerType===tap.pointerType&&
           time-prev.at<=PLAN_DOUBLE_TAP_MAX_MS&&
           Math.hypot(e.clientX-prev.x,e.clientY-prev.y)<=PLAN_DOUBLE_TAP_MAX_GAP_PX){
            s.lastPlanTap=null;
            e.preventDefault();
            addPoint(pos.x,pos.y);
        }
    }));
    // Impide el comportamiento nativo de doble clic; la creación se realiza en pointerup.
    $('jointPlan').addEventListener('dblclick',e=>e.preventDefault());
    $('jointPlan').addEventListener('wheel',e=>{if(s.role!=='host'||running()||s.transaction)return;e.preventDefault();const before=svgPosition(e);if(!before)return;zoomPlanAt(before,e.deltaY<0?.8:1.25);renderPlan();},{passive:false});
    $('jointDeviceName').onchange=()=>{s.name=$('jointDeviceName').value.trim().slice(0,40)||'Mi móvil';broadcast({type:'HELLO',id:s.id,name:s.name,status:localStatus()});renderDevices();renderPlan();};
    $('jointEnableSensor').onclick=guard(enableSensor);
    $('jointCalibrateX').onclick=guard(()=>startCalibration('x'));
    $('jointCalibrateY').onclick=guard(()=>startCalibration('y'));
    $('jointCalibrateZ').onclick=guard(()=>startCalibration('z'));
    $('jointSkipCalibration').onclick=guard(chooseManualCalibration);
    $('jointManualPlus').onclick=guard(()=>setManualCalibration(1));
    $('jointManualMinus').onclick=guard(()=>setManualCalibration(-1));
    $('jointSyncStart').onclick=guard(startSyncCalibration);
    $('jointSyncGestureX').onclick=guard(()=>startSyncGesture('x'));
    $('jointSyncGestureY').onclick=guard(()=>startSyncGesture('y'));
    $('jointSyncGestureZ').onclick=guard(()=>startSyncGesture('z'));
    $('jointSync').onclick=guard(async()=>{for(const p of s.peers.values())startSync(p);tell('Comprobando el enlace con 24 intercambios. Esto no cambia la calibración física ya validada.');});
    $('jointStart').onclick=guard(startRun);$('jointStop').onclick=()=>stopRun();
    $('jointDownload').onclick=guard(exportSession);$('jointCsv').onclick=guard(exportCsv);$('jointDownloadProcessed').onclick=guard(exportProcessedJson);$('jointCsvProcessed').onclick=guard(exportProcessedCsv);$('jointSendData').onclick=guard(sendRecord);$('jointRecover').onclick=guard(recover);
    $('jointCompareView').onchange=renderComparison;
    $('jointCompareResetZoom').onclick=()=>s.compareCharts?.forEach(chart=>chart.resetZoom('none'));
    $('jointImportSession').onchange=guard(async e=>{
        const file=e.target.files[0];if(!file)return;
        if(file.size>100000000)throw Error('El ensayo JSON es demasiado grande para abrirlo en el navegador.');
        s.compareExport=validComparisonExport(JSON.parse(await file.text()));e.target.value='';renderComparison();tell('Ensayo conjunto cargado para comparación.');
    });
    $('jointNewRun').onclick=guard(()=>{
        if(running()||s.transfer||s.run?.finishing)throw Error('El registro todavía se está cerrando. Espera unos segundos.');
        if(s.run&&!confirm('Descarga antes los resultados. ¿Preparar un nuevo ensayo? El registro local seguirá guardado en este navegador.'))return;
        s.run=null;s.results.clear();$('jointProgress').value=0;$('jointMeasureState').textContent='Preparando dispositivos';$('jointRunTime').textContent='00:00.0';renderPlan();renderDevices();tab('Devices');
    });
    const blockMeasurementTouch=event=>{
        if(running()&&!event.target.closest('#jointStop'))event.preventDefault();
    };
    document.addEventListener('touchstart',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('touchmove',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('pointerdown',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('visibilitychange',()=>{if(running()){incident('visibility',document.hidden?'Página oculta: puede haber huecos de adquisición.':'Página visible de nuevo.');if(!document.hidden)requestWake();}});
    window.addEventListener('beforeunload',e=>{if(running()||s.transfer){e.preventDefault();e.returnValue='';}});
    setInterval(tick,250);
    if(location.hash.startsWith('#joint=')) {
        guard(()=>{open();openPair();$('jointPairInput').value=location.href;$('jointPairStatus').textContent='Invitación cargada. Pulsa Leer código para continuar.';history.replaceState(null,'',location.pathname+location.search);})();
    }
})();
