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
        s, VERSION, STUN_SERVERS, MAX_PEERS, MAX_TOKEN, MAX_MESSAGE, QR_CHUNK_SIZE, MAX_QR_PAGES, uid, now, finite, $, running, tell, incident, guard, tab, open,
        workspace: (...args) => workspace(...args), requireHostEdit, localStatus,
        renderDevices: (...args) => renderDevices(...args), savePlan, renderPlan,
        startSync: (...args) => startSync(...args),
        onMessage: (...args) => onMessage(...args)
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
    async function recover() {
        const entries=await storedRuns();
        $('jointRecoveryList').replaceChildren();
        if(!entries.length){$('jointRecoveryList').textContent='No hay registros locales guardados.';return;}
        for(const entry of entries.sort((a,b)=>b.meta.created.localeCompare(a.meta.created))) {
            const b=document.createElement('button');b.type='button';b.className='joint-secondary';b.textContent=entry.meta.created.slice(0,19)+' · '+entry.meta.device.name;
            b.onclick=guard(async()=>{
                const chunks=await storedChunks(entry.key);
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
    /* Axis calibration and physical clock correction are managed separately.
       Preserve original call sites and late-bind transport callbacks. */
    const calibrationMath=globalThis.VWOMACalibrationMath.createMath({
        median, finite, sampleRate
    });
    const {renderSyncCalibration, axisResultMarkup, showCalibration, calibrationAxisName, renderCalibration, renderCalibrationCountdown, startCalibration, chooseManualCalibration, setManualCalibration, finishCalibration, correctedVector, armSyncGesture, startSyncCalibration, startSyncGesture, finalizeSyncGesture}=
        globalThis.VWOMACalibration.createController({
            s, $, escape, now, toMaster, finite, sampleRate, tell,
            renderDevices:(...args)=>renderDevices(...args),
            tab, requireHostEdit, localStatus,
            startSync:(...args)=>startSync(...args), pause, clockFit,
            send:(...args)=>send(...args),
            broadcast:(...args)=>broadcast(...args),
            uid, structuredClone, setTimeout, median, math:calibrationMath
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
        return {schema:'pasarelas-upm-joint-vwoma-preview-v1',id:run.id,session:run.session,created:run.created,state:run.state,device:run.device,plan:run.plan,windowMasterMs:{start:run.start,end:run.end,plannedEnd:run.plannedEnd},initialClock:run.initialClock,networkClock:run.networkClock||run.initialClock,finalClock:run.finalClock,syncModels:run.syncModels||{},synchronizationCalibration:run.synchronizationCalibration||null,synchronization:run.sync||[],incidents:run.incidents,sampleColumns:['sequence','eventTimeMs','receiptTimeMs','ax','ay','az','reportedIntervalMs','usedTimeMs','masterTimeAtCaptureMs'],acceleration:'includingGravity',units:'m/s²',timestampMeaning:'DOM event/receipt times; not certified hardware acquisition times',clockFormula:'masterMs = localMs - offset - drift * (localMs - reference)',clockCorrection:'masterTimeAtCaptureMs usa el modelo de reloj robusto fijado al inicio del ensayo más la corrección física fija de la tablilla; los intercambios posteriores solo diagnostican su estabilidad.',userAgent:navigator.userAgent};
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
            resampleAxis,detrendPoints
        });

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
        try{const stored=localStorage.getItem('upm-joint-plan-vwoma-preview-v1');if(stored)s.plan=checkPlan(JSON.parse(stored));}catch(e){tell('No se pudo recuperar el plano anterior.',true);}
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
