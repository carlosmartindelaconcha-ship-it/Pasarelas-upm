/* VWOMA | Accelerometer axis calibration and physical synchronization.
 * State changes and original UI gestures remain unchanged. Numerical
 * methods are supplied by calibration-math.js; network/clock callbacks are
 * injected rather than imported from the global application scope.
 */
(function registerCalibrationController(root) {
    'use strict';
    function createController({s, $, escape, now, toMaster, finite, sampleRate, tell, renderDevices, tab, requireHostEdit, localStatus, startSync, pause, clockFit, send, broadcast, uid, structuredClone, setTimeout, median, math}) {
        const {linearDetrend, lowPassCalibration, calibrationLobes,
               filteredGestureSeries, interpolateGesture, correlationAt,
               estimateGestureAxis}=math;
        const correctedVector=(values,calibration=s.calibration)=>
            math.correctedVector(values,calibration);
        const CAL_CYCLE_MS=2000, CAL_GESTURE_MS=2600, CAL_INTRO_MS=5000, CAL_OBSERVE_MS=1100;
        const CAL_REST='assets/calibration/telefono-ejes-reposo.svg';
        const cycleSrc=axis=>'assets/calibration/telefono-eje-'+axis+'-un-ciclo.svg?v=20261113-speed3';
        function updateCalibrationIllustration() {
            const c=s.calibration,active=c.active,t=now();
            // Bind the *visual* cycle to the actual SVG load, not a coarse 250 ms
            // timer. A delayed refresh must never cut the SVG off mid-cycle.
            if(active&&t>=active.start&&!finite(active.svgStartedAt))active.svgStartedAt=t;
            const playing=!!active&&finite(active.svgStartedAt)&&t<active.svgStartedAt+CAL_CYCLE_MS;
            const example=!active&&!c.complete&&c.guidePhase==='demo';
            const axis=example?'x':active?.axis||'x';
            const image=$('jointCalibrationImage'),src=playing||example?cycleSrc(axis):CAL_REST;
            // Reassign only on a real state transition: reloading a SVG restarts it.
            if(image.getAttribute('src')!==src)image.setAttribute('src',src);
            image.alt=playing||example?'Un único ciclo en el eje '+axis.toUpperCase():'Teléfono quieto en el origen';
        }
        function beginCalibrationGuide() {
            const c=s.calibration;
            if(!s.sensorEnabled)throw Error('Activa antes el acelerómetro.');
            if(c.complete||c.active||(c.guidePhase&&c.guidePhase!=='idle'))return;
            c.guidePhase='message';c.feedback=null;renderCalibration();
            setTimeout(()=>{
                if(s.calibration!==c||c.guidePhase!=='message'||c.complete||c.manualChoosing)return;
                c.guidePhase='observe';renderCalibration();
                setTimeout(()=>{
                    if(s.calibration!==c||c.guidePhase!=='observe'||c.complete||c.manualChoosing)return;
                    c.guidePhase='demo';renderCalibration();
                    setTimeout(()=>{
                        if(s.calibration!==c||c.guidePhase!=='demo'||c.complete||c.manualChoosing)return;
                        c.guidePhase='ready';renderCalibration();
                    },CAL_CYCLE_MS);
                },CAL_OBSERVE_MS);
            },CAL_INTRO_MS);
        }

    function renderSyncCalibration() {
        const state=s.syncCalibration,button=$('jointSyncStart');
        if(!button)return;
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        if(s.role==='host'&&!peers.length){
            // A single accelerometer has no inter-device time offset to validate.
            button.hidden=true;
            $('jointSyncState').textContent='No necesaria (solo maestro)';
            $('jointSyncState').classList.toggle('done',true);
            $('jointSyncHelp').textContent=s.calibration.complete?
                'Puedes pasar a Medir. Con un único móvil no es necesaria la sincronización entre dispositivos.':
                'Activa el acelerómetro y calibra sus ejes X, Y y Z. Después puedes medir con un solo móvil.';
            $('jointSyncBurst').hidden=true;
            $('jointSyncGestureActions').hidden=true;
            $('jointSyncCountdown').hidden=true;
            $('jointSyncSummary').innerHTML='<p class="joint-help">Sin participantes conectados: se registra únicamente el maestro.</p>';
            return;
        }
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
        const guide=c.guidePhase||'idle',ready=guide==='ready'||done;
        $('jointCalibration').classList.toggle('complete',done);
        const begin=$('jointBeginCalibration');
        $('jointCalibrationControls').hidden=done||!!c.manualChoosing;
        begin.hidden=done||guide!=='idle'||!!c.manualChoosing;
        begin.disabled=!!active||!s.sensorEnabled;
        const hint=$('jointCalibrationExample');
        hint.hidden=done||(guide!=='message'&&guide!=='observe');
        hint.textContent=guide==='observe'?'OBSERVA':'EJEMPLO: haz un SOLO movimiento de ida y vuelta con el móvil en CADA EJE.';
        hint.classList.toggle('observe',guide==='observe');
        updateCalibrationIllustration();
        $('jointCalibrationAnimation').classList.toggle('complete',done);
        const axis=active?.axis||['x','y','z'].find(key=>!c.map[key])||'x';
        $('jointCalibrationInstruction').textContent=done?'Teléfono quieto en el origen.':
            active?'Eje '+axis.toUpperCase()+' · una sola ida y vuelta.':
            guide==='demo'?'EJEMPLO · X: una sola ida y vuelta.':
            guide==='observe'?'OBSERVA: comenzará la demostración del eje X.':
            ready?'Teléfono quieto. Elige X, Y o Z para realizar el gesto.':
            'Pulsa «Calibrar ejes» para ver cómo se realiza el movimiento.';
        for(const key of ['x','y','z']) {
            const calibration=c.map[key],button=$('jointCalibrate'+key.toUpperCase()),factor=$('jointFactor'+key.toUpperCase()),card=factor.closest('.joint-factor');
            button.disabled=!ready||!!active||!s.sensorEnabled||!s.sensor||!!calibration;
            button.classList.toggle('done',!!calibration);
            factor.textContent=calibration?'× '+(calibration.sign>0?'+1':'−1'):'Pendiente';
            card.classList.toggle('ready',!!calibration);
        }
        const override=$('jointCalibrationOverride'),manual=$('jointManualCalibration'),skip=$('jointSkipCalibration');
        override.hidden=done||!c.manualChoosing;
        manual.hidden=done||!c.manualChoosing;
        skip.hidden=done||!!c.manualChoosing;
        skip.disabled=!!active||!s.sensorEnabled;
        $('jointCalibrationHelp').textContent=active?'Quieto durante la cuenta atrás. Al aparecer «¡AHORA!», haz una sola ida y vuelta.':
            guide==='message'?'Lee el ejemplo. Después aparecerá «OBSERVA» antes del movimiento.':
            guide==='observe'?'Observa cómo el teléfono se desplaza por el eje X y regresa al origen.':
            guide==='demo'?'Eje X: una ida y vuelta de 2 segundos, regreso al origen.':
            c.manualChoosing?'Elige el signo que se aplicará por igual a X, Y y Z.':
            c.feedback||(done?'✓ Factores de signo guardados para este móvil. Puedes preparar la medida.':
            ready?'Pulsa «Gesto X», «Gesto Y» o «Gesto Z». Cada prueba dura 2,6 s y corrige solo el signo del eje seleccionado.':
            'Te mostraremos una ida y vuelta en X. Después realiza un gesto por cada eje.');
        renderCalibrationCountdown();
    }
    function renderCalibrationCountdown() {
        const box=$('jointCalibrationCountdown'),active=s.calibration.active;
        if(!active){box.hidden=true;box.classList.remove('go');updateCalibrationIllustration();return;}
        const t=now();
        updateCalibrationIllustration();
        if(t<active.start) {
            box.hidden=false;box.classList.remove('go');
            box.textContent='QUIETO · '+Math.max(1,Math.ceil((active.start-t)/1000));
        } else if(t<active.start+650) {
            box.hidden=false;box.classList.add('go');box.textContent='¡AHORA!';
        } else {
            box.hidden=true;box.classList.remove('go');
        }
    }
    function startCalibration(axis) {
        if(!['x','y','z'].includes(axis))throw Error('Eje de calibración no válido.');
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.guidePhase!=='ready')throw Error('Pulsa primero «Calibrar ejes» y observa el ejemplo.');
        if(s.calibration.active||s.calibration.map[axis])return;
        // Three seconds of baseline including gravity; one 2s SVG cycle and .6s margin.
        const start=now()+3000;
        s.calibration.feedback=null;
        s.calibration.active={axis,start,end:start+CAL_GESTURE_MS,baseline:[],samples:[]};
        renderCalibration();
        tell('Eje '+axis.toUpperCase()+': quieto 3, 2, 1. Después haz una sola ida y vuelta.');
    }
    function chooseManualCalibration() {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.complete)return;
        s.calibration.manualChoosing=true;
        s.calibration.guidePhase='idle'; // Cancela una demostración pendiente.
        renderCalibration();
        tell('Elige si quieres conservar los tres ejes o invertir los tres ejes.');
    }
    function setManualCalibration(sign) {
        if(sign!==1&&sign!==-1)throw Error('Factor manual no válido.');
        if(s.calibration.active||!s.calibration.manualChoosing)return;
        for(const [axis,raw] of Object.entries({x:0,y:1,z:2}))s.calibration.map[axis]={raw,sign,manual:true,method:'manual'};
        s.calibration.manualChoosing=false;s.calibration.complete=true;s.calibration.guidePhase='ready';
        tell('Calibración omitida: se aplica × '+(sign>0?'+1':'−1')+' a X, Y y Z.');renderCalibration();renderDevices();
    }
    function finishCalibration() {
        const active=s.calibration.active;if(!active)return;
        s.calibration.active=null;
        const axis=active.axis,raw={x:0,y:1,z:2}[axis],rows=active.samples;
        const fail=message=>{
            s.calibration.feedback=message;tell(message,true);renderCalibration();
        };
        if(rows.length<20){
            fail('Eje '+axis.toUpperCase()+': solo llegaron '+rows.length+' muestras durante el gesto. Mantén Safari visible y revisa el permiso del acelerómetro.');return;
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

        return Object.freeze({renderSyncCalibration, axisResultMarkup, showCalibration, calibrationAxisName, renderCalibration, renderCalibrationCountdown, beginCalibrationGuide, startCalibration, chooseManualCalibration, setManualCalibration, finishCalibration, correctedVector, armSyncGesture, startSyncCalibration, startSyncGesture, finalizeSyncGesture});
    }
    const api=Object.freeze({createController});
    if(typeof module==='object'&&module.exports) module.exports=api;
    else root.VWOMACalibration=api;
})(globalThis);
