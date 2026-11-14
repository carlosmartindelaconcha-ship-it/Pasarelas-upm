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
    const s = globalThis.VWOMAJointState.createState(uid);
    const running = () => s.run && activeStates.has(s.run.state);
    function tell(message, error=false) { $('jointNotice').textContent=message; $('jointNotice').dataset.error=String(error); }
    function incident(kind, detail) {
        const item={kind, detail:String(detail), time:now()}; s.incidents.push(item);
        if (s.run) s.run.incidents.push(item);
    }
    function guard(fn) { return async (...args) => {try {await fn(...args);} catch(e) {tell(e.message || String(e),true); $('jointPairStatus').textContent=e.message || String(e);}}; }
    // Reveal a newly active control in the page or the pairing dialog.
    const revealActionTarget=(id,position='start')=>
        globalThis.VWOMAScrollNavigation?.revealTarget?.($(id),position);
    const {tab}=globalThis.VWOMATabNavigation.createNavigation({
        $,window,raf:typeof requestAnimationFrame==='function'?requestAnimationFrame:null,
        renderComparison:()=>renderComparison(),
        onMeasureVisible:()=>{s.jointCharts.time?.resize();s.jointCharts.spectrum?.resize();},
        isRecording:()=>document.body?.classList?.contains('recording-lock')||false
    });
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
        s, finite, MAX_POINTS, running, $, tell, broadcast: (...args) => broadcast(...args),
        storageKey:'upm-joint-plan-vwoma-preview-v1', escape, requireHostEdit, renderDevices
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
        const hasParticipants=[...s.peers.values()].some(p=>p.channel?.readyState==='open');
        $('jointStart').hidden=s.role!=='host'; $('jointSync').hidden=s.role!=='host';
        $('jointStart').disabled=!!running()||!!s.transaction||!s.calibration.complete||(hasParticipants&&!s.syncCalibration.accepted);
        $('jointStartLabel').textContent=hasParticipants?'Preparar e iniciar':'Iniciar solo con el maestro';
        $('jointSoloHint').hidden=s.role!=='host'||hasParticipants;
        $('jointDuration').disabled=s.role!=='host'||!!running()||!!s.transaction;
        $('jointEnableSensor').disabled=s.sensorEnabled;
        $('jointStop').disabled=!running()&&!s.transaction;
        $('jointPair').disabled=!!running()||!!s.transaction;
        renderSyncCalibration();
    }

    /* WebRTC transport and QR signaling are separate from acquisition and clocks.
       Keep method bindings writable for the existing diagnostic test harness. */
    let { encodeToken, decodeToken, stopQrCycle, qrTransferPages, renderQrPage, acceptQrPage, showToken, openPair, browserLabel, isAndroidChrome, updateAndroidNearbyNotice, diagnosticEvent, diagnosticText, showPairDiagnostic, pairingError, gather, candidateSummary, parsedCandidates, candidateEndpoint, candidateLabel, candidateDetails, icePairSnapshot, captureIceStats, scheduleIceStats, pairingDetails, pairStatus, disposePeer, failPair, watchPair, localDescription, prepareSafariConnection, pairingAction, retryPair, wirePeer, newPeer, send, broadcast, wireChannel, checkRoute, invite, createGuestAnswer, readCode, stopScan, scanCode } = globalThis.VWOMATransport.createTransport({
        s, VERSION, STUN_SERVERS, MAX_PEERS, MAX_TOKEN, MAX_MESSAGE, QR_CHUNK_SIZE, MAX_QR_PAGES, uid, now, finite, $, running, tell, incident, guard, tab, open,
        workspace: (...args) => workspace(...args), requireHostEdit, localStatus,
        renderDevices: (...args) => renderDevices(...args), savePlan, renderPlan,
        startSync: (...args) => startSync(...args),
        onMessage: (...args) => onMessage(...args),
        revealActionTarget
    });

    // Clock estimation is independent of WebRTC and of the browser UI.
    // Retain the original default model for participant -> master conversion.
    const clockModel = globalThis.VWOMAClockModel.createClockModel({now, finite});
    const { median, clockFit, fromMaster, validModel,
            modelOffsetAt, offsetResidual, selectedForModel, syncMetric } = clockModel;
    const toMaster=(t,m=s.syncModel)=>clockModel.toMaster(t,m);

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
        if(m.type==='SYNC_GUIDE_BEGIN'&&s.role==='guest'){
            if(typeof m.id!=='string'||!localStatus().sensor||!s.calibration.complete)return;
            receiveSyncGuide(m.id);
            tab('Sync');
            tell('Relojes preparados. Observa el ejemplo antes de comenzar.');
            return;
        }
        if(m.type==='SYNC_AXIS_PROGRESS'&&s.role==='guest'){
            if(s.syncCalibration.id!==m.id||!['x','y','z'].includes(m.axis)||!finite(m.lag)||!finite(m.correlation))return;
            const state=s.syncCalibration;
            state.results[s.id]??={axes:{},accepted:false,correctionMs:0};
            state.results[s.id].axes[m.axis]={axis:m.axis,lag:m.lag,correlation:m.correlation};
            state.phase='gesture-ready';state.guidePhase='ready';state.gesture=null;
            state.lastFeedback='✓ Eje '+m.axis.toUpperCase()+' sincronizado. Espera al siguiente gesto.';
            renderSyncCalibration();
            return;
        }
        if(m.type==='SYNC_AXIS_RETRY'&&s.role==='guest'){
            if(s.syncCalibration.id!==m.id||!['x','y','z'].includes(m.axis))return;
            const state=s.syncCalibration;
            if(state.results?.[s.id]?.axes)delete state.results[s.id].axes[m.axis];
            state.phase='gesture-ready';state.guidePhase='ready';state.gesture=null;
            state.lastFeedback='Repetir eje '+m.axis.toUpperCase()+'. Espera al maestro.';
            renderSyncCalibration();
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
            if(s.syncCalibration.id!==m.id||!finite(m.correctionMs)||!m.axes)return;
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
        if(['TRANSFER_BEGIN','TRANSFER_CHUNK','TRANSFER_END','TRANSFER_ACK'].includes(m.type)){
            await handleTransferMessage(p,m);return;
        }
    }
    /* Browser storage and run recovery are delegated to the persistence layer.
       Database name is explicit so /pruebas/ can use a separate data store. */
    const {persist, persistBeforeClosing, storedRuns, storedChunks} =
        globalThis.VWOMAPersistence.createPersistence({
            s, runMeta, incident, tell,
            databaseName:'upm-joint-vwoma-preview-v1',
            indexedDB:typeof indexedDB==='undefined'?null:indexedDB,
            IDBKeyRange:typeof IDBKeyRange==='undefined'?null:IDBKeyRange,
            structuredClone:value=>structuredClone(value),
            setTimeout, clearTimeout
        });
    const repairArchivedPreviewMeta=meta=>meta?.schema==='pasarelas-upm-joint-vwoma-preview-v1'?{...meta,schema:'pasarelas-upm-joint-v1'}:meta;
    async function recover() {
        const entries=await storedRuns();
        $('jointRecoveryList').replaceChildren();
        if(!entries.length){$('jointRecoveryList').textContent='No hay registros locales guardados.';return;}
        for(const entry of entries.sort((a,b)=>b.meta.created.localeCompare(a.meta.created))) {
            const b=document.createElement('button');b.type='button';b.className='joint-secondary';b.textContent=entry.meta.created.slice(0,19)+' · '+entry.meta.device.name;
            b.onclick=guard(async()=>{
                const chunks=await storedChunks(entry.key);
                download('recuperado_'+entry.meta.id+'.json',{...repairArchivedPreviewMeta(entry.meta),recovered:true,samples:chunks.flatMap(v=>v.rows)});
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
    /* Axis calibration and physical clock correction are managed separately.
       Preserve original call sites and late-bind transport callbacks. */
    const calibrationMath=globalThis.VWOMACalibrationMath.createMath({
        median, finite, sampleRate
    });
    const {renderSyncCalibration, axisResultMarkup, showCalibration, calibrationAxisName, renderCalibration, renderCalibrationCountdown, beginCalibrationGuide, receiveSyncGuide, startCalibration, chooseManualCalibration, setManualCalibration, finishCalibration, correctedVector, armSyncGesture, startSyncCalibration, startSyncGesture, finalizeSyncGesture}=
        globalThis.VWOMACalibration.createController({
            s, $, escape, now, toMaster, finite, sampleRate, tell,
            renderDevices:(...args)=>renderDevices(...args),
            tab, requireHostEdit, localStatus,
            startSync:(...args)=>startSync(...args), pause, clockFit,
            send:(...args)=>send(...args),
            broadcast:(...args)=>broadcast(...args),
            uid, structuredClone, setTimeout, median, math:calibrationMath, revealActionTarget
        });

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
    /* Browser presentation stays here; acquisition only invokes these hooks. */
    const acquisitionUi={
        enterRecording:()=>{
            document.body.classList.add('recording-lock');tab('Measure');ensureJointCharts();
            setTimeout(()=>{s.jointCharts.time?.resize();s.jointCharts.spectrum?.resize();},50);
        },
        runArmed:()=>{renderPlan();renderDevices();tell('Inicio programado. Pantalla y gestos bloqueados durante la medida.');},
        preparing:()=>{tab('Measure');$('jointMeasureState').textContent='Confirmando dispositivos…';renderPlan();renderDevices();},
        preparationInterrupted:()=>{$('jointMeasureState').textContent='Preparación interrumpida';},
        refresh:()=>{renderDevices();renderPlan();},
        exitRecording:()=>{document.body.classList.remove('recording-lock');},
        closing:()=>{$('jointMeasureState').textContent='Cerrando registro…';},
        finished:()=>{tab('Results');renderPlan();renderDevices();renderResults();}
    };
    const {appendSample,startDuringSync,stopDuringSync,requestWake,releaseWake,
           beginRun,startRun,stopRun,finishRun} =
        globalThis.VWOMAAcquisition.createAcquisition({
            s, MAX_SAMPLES, now, running, incident, toMaster, syncOnce,
            navigator, setInterval, clearInterval, requireHostEdit, localStatus,
            pageHidden:()=>document.hidden,
            readDuration:()=>$('jointDuration').value,
            pointFor, tell, pause, finite, uid,
            broadcast:(...args)=>broadcast(...args),
            send:(...args)=>send(...args),
            correctedVector, persist, persistBeforeClosing,
            sendRecord:(...args)=>sendRecord(...args),
            localRecord:(...args)=>localRecord(...args),
            structuredClone, ui:acquisitionUi
        });

    function runMeta(run) {
        return {schema:'pasarelas-upm-joint-v1',id:run.id,session:run.session,created:run.created,state:run.state,device:run.device,plan:run.plan,windowMasterMs:{start:run.start,end:run.end,plannedEnd:run.plannedEnd},initialClock:run.initialClock,networkClock:run.networkClock||run.initialClock,finalClock:run.finalClock,syncModels:run.syncModels||{},synchronizationCalibration:run.synchronizationCalibration||null,synchronization:run.sync||[],incidents:run.incidents,sampleColumns:['sequence','eventTimeMs','receiptTimeMs','ax','ay','az','reportedIntervalMs','usedTimeMs','masterTimeAtCaptureMs'],acceleration:'includingGravity',units:'m/s²',timestampMeaning:'DOM event/receipt times; not certified hardware acquisition times',clockFormula:'masterMs = localMs - offset - drift * (localMs - reference)',clockCorrection:'masterTimeAtCaptureMs usa el modelo de reloj robusto fijado al inicio del ensayo más la corrección física fija de la tablilla; los intercambios posteriores solo diagnostican su estabilidad.',userAgent:navigator.userAgent};
    }
    function localRecord() {return s.run?{...runMeta(s.run),samples:s.run.samples}:null;}
    /* Binary file download, validated exports and common-grid interpolation. */
    const {download,exportSession,processedCommonExport,exportProcessedJson,exportProcessedCsv,exportCsv,comparisonExport,validComparisonExport,samplePeriodMs,structuralValue,resampleAxis,detrendPoints} =
        globalThis.VWOMAExports.createExports({
            s,finite,median,MAX_PEERS,toMaster,validModel,correctedVector,localRecord,
            document,Blob:typeof Blob==='undefined'?null:Blob,
            URL:typeof URL==='undefined'?null:URL,setTimeout
        });
    /* WebRTC file-transfer protocol is kept apart from signal acquisition. */
    const {sendRecord,handleTransferMessage} = globalThis.VWOMARecordTransfer.createTransfer({
        s,MAX_SAMPLES,finite,send:(...args)=>send(...args),
        renderResults:(...args)=>renderResults(...args),
        localRecord,uid,tell,crypto,TextEncoder,Uint8Array,setTimeout,clearTimeout
    });

    /* UI rendering of results, clock diagnostics, and cross-device charts. */
    const {renderResults,clearSyncCharts,jointTemporalOptions,histogramBins,histogramMarkup,timelineMarkup,makeHistogramChart,makeTimelineChart,modelSummaryMarkup,renderSyncResults,renderComparison} =
        globalThis.VWOMAResultsView.createResultsView({
            s,$,escape,Chart:typeof Chart==='undefined'?undefined:Chart,
            median,finite,running,syncMetric,selectedForModel,
            enableLegendToggling:(...args)=>enableLegendToggling(...args),
            comparisonExport,samplePeriodMs,structuralValue,
            resampleAxis,detrendPoints,
            clampTemporalXAxis,keepTemporalYAxisCentered,formatYAxisTick
        });

    function ensureJointCharts() {
        if(typeof Chart==='undefined')return false;
        const common={responsive:true,maintainAspectRatio:false,animation:false,events:['click'],parsing:false,plugins:{legend:{position:'top',labels:{boxWidth:28,font:{size:12}}}},scales:{x:{type:'linear',grid:{color:'rgba(0,0,0,.08)'}},y:{grid:{color:'rgba(0,0,0,.08)'}}}};
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
            else renderCalibrationCountdown();
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
        // Hidden canvases must not redraw or resize while another tab is active.
        if(!$('jointPanelMeasure').hidden){
            drawPreview();
            if(s.uiTick%4===0)drawLiveSpectrum();
        }
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
        s.calibration={map:{},active:null,complete:false,guidePhase:'idle'};s.syncCalibration={phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0};$('jointCalibration').hidden=true;$('jointCalibrationOverride').hidden=true;
        s.syncModel={offset:0,drift:0,reference:0,rtt:null,count:0,updated:0};s.id=uid();
        root.hidden=true;$('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        if(s.returnTo)s.returnTo.style.display='block';else $('mainMenu').style.display='block';
        history.replaceState(null,'',location.pathname+location.search);
    }

    // Existing session/business handlers stay in the coordinator; only DOM binding moves.
    function openStandaloneTest() {
        if(typeof Chart==='undefined')throw Error('No se ha cargado la librería de gráficas. Recarga la página con conexión.');
        mainMenu.style.display='none';testForm.style.display='block';
        if(accelerationChart===null){createAccelerationChart();createSpectrumChart();createPsdChart();createRmsChart();[accelerationChart,spectrumChart,psdChart,rmsChart].forEach(enableLegendToggling);}
    }
    function createJointSession() {
        open();s.id=uid();s.role='host';s.name='Maestro';s.session=uid();
        try{const stored=localStorage.getItem('upm-joint-plan-vwoma-preview-v1');if(stored)s.plan=checkPlan(JSON.parse(stored));}catch(e){tell('No se pudo recuperar el plano anterior.',true);}
        if(!s.plan.points.length)s.plan.points=[{id:'P1',name:'P1',x:s.plan.length/2,y:s.plan.width/2,axis:'z',angle:0,device:s.id},{id:'P2',name:'P2',x:s.plan.length/4,y:s.plan.width/2,axis:'z',angle:0,device:null}];
        else {s.plan.points.forEach(p=>p.device=null);s.plan.points[0].device=s.id;}
        s.selected=s.plan.points[0].id;workspace();tell('Define el plano y pulsa Invitar móvil para incorporar un participante.');
    }
    globalThis.VWOMAUIEvents.bindEvents({
        s, $, guard, open, openStandaloneTest, resetSession,
        tab, renderResults, renderSyncCalibration, createJointSession, openPair, pairingAction,
        invite, retryPair, prepareSafariConnection, stopScan, readCode, scanCode,
        createGuestAnswer, requireHostEdit, checkPlan, savePlan, tell, addPoint,
        resetPlanView, download, deletePlanPoint, updatePlanPoint, svgPosition, planViewport,
        geometry, zoomPlanAt, snapPlanPosition, renderPlan, localStatus, renderDevices,
        broadcast, enableSensor, beginCalibrationGuide, startCalibration, chooseManualCalibration, setManualCalibration, startSyncCalibration,
        startSyncGesture, startSync, startRun, stopRun, exportSession, exportCsv,
        exportProcessedJson, exportProcessedCsv, sendRecord, recover, renderComparison, validComparisonExport,
        requestWake, incident, running
    });
    setInterval(tick,250);
    if(location.hash.startsWith('#joint=')) {
        guard(()=>{open();openPair();$('jointPairInput').value=location.href;$('jointPairStatus').textContent='Invitación cargada. Pulsa Leer código para continuar.';history.replaceState(null,'',location.pathname+location.search);})();
    }
})();
