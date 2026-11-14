/* VWOMA | Accelerometer axis calibration and physical synchronization.
 * State changes and original UI gestures remain unchanged. Numerical
 * methods are supplied by calibration-math.js; network/clock callbacks are
 * injected rather than imported from the global application scope.
 */
(function registerCalibrationController(root) {
    'use strict';
    function createController({s, $, escape, now, toMaster, finite, sampleRate, tell, renderDevices, tab, requireHostEdit, localStatus, startSync, pause, clockFit, send, broadcast, uid, structuredClone, setTimeout, median, math, revealActionTarget=()=>{}}) {
        const {linearDetrend, lowPassCalibration, calibrationLobes,
               filteredGestureSeries, interpolateGesture, correlationAt,
               estimateGestureAxis}=math;
        const correctedVector=(values,calibration=s.calibration)=>
            math.correctedVector(values,calibration);
        const CAL_CYCLE_MS=2000, CAL_GESTURE_MS=2500, CAL_INTRO_MS=5000, CAL_OBSERVE_MS=1100;
        const SYNC_GESTURE_MS=6000, SYNC_READY_MS=3000, SYNC_DEMO_MS=7500;
        const syncAsset=(axis,kind)=>'assets/joint/telefono-sincronizacion-eje-'+axis.toUpperCase()+'-tabla-madera-'+kind+'.svg?v=20261114-physical-sync-board-v1';
        let syncDemoSequence=0;

        const CAL_REST='assets/calibration/telefono-ejes-reposo.svg';
        const cycleSrc=axis=>'assets/calibration/telefono-eje-'+axis+'-un-ciclo.svg?v=20261113-speed3';
        const svgPromises=new Map();
        let playback=null,playNumber=0,calGuideNumber=0,lastPlaybackKey=null;
        function cachedSvg(axis) {
            if(!svgPromises.has(axis))svgPromises.set(axis,
                fetch(cycleSrc(axis)).then(res=>res.ok?res.text():null).catch(()=>null));
            return svgPromises.get(axis);
        }
        function playCalibrationSvg(axis,kind,key) {
            const image=$('jointCalibrationImage');
            if(playback?.url)URL.revokeObjectURL(playback.url);
            const item={key,kind,number:++playNumber,calibration:s.calibration,url:null};
            playback=item;
            lastPlaybackKey=key;
            image.onload=null;image.onerror=null;
            const finish=()=>{
                if(playback!==item)return;
                playback=null;
                image.onload=null;image.onerror=null;
                image.setAttribute('src',CAL_REST);
                image.alt='Teléfono quieto en el origen';
                if(item.url)URL.revokeObjectURL(item.url);
                if(kind==='demo'&&s.calibration===item.calibration&&s.calibration.guidePhase==='demo'){
                    s.calibration.guidePhase='ready';
                    renderCalibration();
                }
            };
            cachedSvg(axis).then(svg=>{
                if(playback!==item)return;
                // Fresh blob URL = fresh animation timeline on Chrome/Pixel.
                // Original SVG artwork and its 2-second transform stay untouched.
                const uri=svg?URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})):
                    cycleSrc(axis)+'&play='+Date.now()+'-'+item.number;
                if(svg)item.url=uri;
                image.onload=()=>{
                    if(playback!==item)return;
                    setTimeout(finish,CAL_CYCLE_MS);
                };
                image.onerror=()=>{
                    if(playback!==item)return;
                    tell('No se pudo reproducir el vídeo del eje '+axis.toUpperCase()+'.',true);
                    finish();
                };
                image.setAttribute('src',uri);
                image.alt='Ida y vuelta por el eje '+axis.toUpperCase();
                // Do not leave the tutorial blocked by a missing Android image-load event.
                setTimeout(()=>{if(playback===item)finish();},CAL_CYCLE_MS+1800);
            }).catch(()=>{if(playback===item)finish();});
        }
        function updateCalibrationIllustration() {
            const c=s.calibration,active=c.active,t=now();
            let key=null,kind=null,axis=null;
            if(active&&t>=active.start&&t<active.end){
                axis=active.axis;kind='gesture';key='gesture:'+axis+':'+active.start;
            }else if(!active&&c.guidePhase==='demo'){
                axis='x';kind='demo';key='demo:'+calGuideNumber;
            }
            if(key&&key!==lastPlaybackKey&&playback?.key!==key)
                playCalibrationSvg(axis,kind,key);
            if(!key&&!playback){
                const image=$('jointCalibrationImage');
                if(image.getAttribute('src')!==CAL_REST)image.setAttribute('src',CAL_REST);
                image.alt='Teléfono quieto en el origen';
            }
        }
        function beginCalibrationGuide() {
            const c=s.calibration;
            if(!s.sensorEnabled)throw Error('Activa antes el acelerómetro.');
            if(c.complete||c.active||(c.guidePhase&&c.guidePhase!=='idle'))return;
            calGuideNumber++;
            for(const axis of ['x','y','z'])cachedSvg(axis);
            c.guidePhase='message';c.feedback=null;renderCalibration();
            revealActionTarget('jointCalibrationAnimation','start');
            setTimeout(()=>{
                if(s.calibration!==c||c.guidePhase!=='message'||c.complete||c.manualChoosing)return;
                c.guidePhase='observe';renderCalibration();
                setTimeout(()=>{
                    if(s.calibration!==c||c.guidePhase!=='observe'||c.complete||c.manualChoosing)return;
                    // Wait for the actual image load + complete playback, not just a timer.
                    c.guidePhase='demo';renderCalibration();
                },CAL_OBSERVE_MS);
            },CAL_INTRO_MS);
        }
        function beginSyncGuide(state) {
            if(s.syncCalibration!==state||state.phase!=='gesture-ready')return;
            state.guidePhase='message';
            state.guideNumber=++syncDemoSequence;
            state.lastFeedback='';
            renderSyncCalibration();
            setTimeout(()=>{
                if(s.syncCalibration!==state||state.phase!=='gesture-ready'||state.guidePhase!=='message')return;
                state.guidePhase='observe';renderSyncCalibration();
                setTimeout(()=>{
                    if(s.syncCalibration!==state||state.phase!=='gesture-ready'||state.guidePhase!=='observe')return;
                    state.guidePhase='demo';renderSyncCalibration();
                },CAL_OBSERVE_MS);
            },CAL_INTRO_MS);
        }
        function receiveSyncGuide(id) {
            if(s.role!=='guest'||typeof id!=='string'||!id)return;
            s.syncCalibration={id,phase:'gesture-ready',accepted:false,gesture:null,results:{},models:{},correctionMs:0};
            beginSyncGuide(s.syncCalibration);
        }


    function renderSyncCalibration() {
        const state=s.syncCalibration,button=$('jointSyncStart');
        if(!button)return;
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        const badge=$('jointSyncState'),burst=$('jointSyncBurst'),exampleBox=$('jointSyncExample');
        const gestureActions=$('jointSyncGestureActions'),image=$('jointSyncImage'),countdown=$('jointSyncCountdown');
        if(s.role==='host'&&!peers.length){
            button.hidden=true;burst.hidden=true;gestureActions.hidden=true;exampleBox.hidden=true;countdown.hidden=true;
            badge.textContent='No necesaria (solo maestro)';badge.classList.add('done');
            $('jointSyncHelp').textContent=s.calibration.complete?
                'Puedes pasar a Medir. Con un único móvil no se sincronizan relojes.':
                'Activa y calibra los ejes X, Y y Z. Después puedes medir con un solo móvil.';
            const summary=$('jointSyncSummary'),html='<p class="joint-help">Sin participantes conectados: se registra únicamente el maestro.</p>';
            if(summary.innerHTML!==html)summary.innerHTML=html;
            return;
        }
        const axesReady=s.calibration.complete&&peers.every(p=>p.status?.calibrated);
        const phase=state.phase,guide=state.guidePhase||'idle';
        button.hidden=s.role!=='host'||!['idle','failed'].includes(phase);
        button.disabled=s.role!=='host'||!axesReady;
        const names={idle:'Pendiente',network:'Preparando relojes','gesture-ready':guide==='ready'?'Elige un eje':'Ejemplo',gesture:'Gesto en curso',processing:'Procesando',accepted:'Validada',failed:'Repetir prueba'};
        badge.textContent=names[phase]||'Pendiente';badge.classList.toggle('done',phase==='accepted');
        burst.hidden=phase!=='network';
        if(phase==='network'){
            const counts=peers.map(p=>p.samples.filter(row=>row.runId===state.id&&row.phase==='precal').length);
            const count=counts.length?Math.min(...counts):0;
            $('jointSyncBurstProgress').value=Math.min(200,count);
            $('jointSyncBurstCount').textContent=Math.min(200,count)+' / 200 respuestas confirmadas';
        }
        const gesture=state.gesture;
        const masterNow=gesture?(s.role==='host'?now():toMaster(now(),gesture.model||s.syncModel)):null;
        const active=phase==='gesture'&&!!gesture;
        const capturing=active&&gesture.phase!=='finished'&&finite(masterNow)&&masterNow>=gesture.start&&masterNow<gesture.end;
        const demo=phase==='gesture-ready'&&guide==='demo';
        const ready=phase==='gesture-ready'&&guide==='ready';
        const axis=gesture?.axis||['x','y','z'].find(key=>!state.results?.[s.id]?.axes?.[key])||'x';
        const src=demo?syncAsset('x','7_5s')+'&demo='+state.guideNumber:
            capturing?syncAsset(axis,'medida-6s')+'&gesture='+Math.round(gesture.start):
            syncAsset(axis,'reposo');
        if(image.getAttribute('src')!==src){
            image.onload=demo?()=>{
                if(s.syncCalibration!==state||state.guidePhase!=='demo'||state.demoLoaded)return;
                state.demoLoaded=true;
                setTimeout(()=>{
                    if(s.syncCalibration!==state||state.phase!=='gesture-ready'||state.guidePhase!=='demo')return;
                    state.guidePhase='ready';renderSyncCalibration();
                },SYNC_DEMO_MS);
            }:null;
            image.onerror=demo?()=>{
                if(s.syncCalibration!==state||state.guidePhase!=='demo')return;
                state.guidePhase='ready';
                tell('No se pudo mostrar el ejemplo de sincronización. Puedes continuar.',true);
                renderSyncCalibration();
            }:null;
            image.setAttribute('src',src);
        }
        image.alt=demo?'Ejemplo de dos móviles recorriendo el eje X':
            capturing?'Dos móviles realizando el movimiento sobre el eje '+axis.toUpperCase():
            'Dos móviles quietos sobre una tabla';
        if(!gesture||!finite(gesture.start)||!finite(gesture.end)||!finite(masterNow)||masterNow>=gesture.end){
            countdown.hidden=true;countdown.classList.remove('go');
        }else{
            const d=masterNow-gesture.start;
            countdown.hidden=false;
            if(d<0){countdown.classList.remove('go');countdown.textContent='QUIETO · '+Math.max(1,Math.ceil(-d/1000));}
            else{countdown.classList.add('go');countdown.textContent=d<650?'¡AHORA!':'MIDE · '+Math.max(0,(gesture.end-masterNow)/1000).toFixed(1)+' s';}
        }
        exampleBox.hidden=phase!=='gesture-ready'||!['message','observe'].includes(guide);
        exampleBox.textContent=guide==='observe'?'OBSERVA':'EJEMPLO: mueve los dos móviles unidos sobre una tabla rígida en CADA EJE, sin girarlos.';
        exampleBox.classList.toggle('observe',guide==='observe');
        const instruction=$('jointSyncInstruction');
        instruction.textContent=demo?'EJEMPLO · X: observa cómo se desplaza el conjunto.':
            guide==='observe'&&phase==='gesture-ready'?'OBSERVA: comenzará la demostración del eje X.':
            guide==='message'&&phase==='gesture-ready'?'Lee el ejemplo. Después verás el movimiento.':
            ready?(state.lastFeedback|| (s.role==='host'?'Pulsa «Gesto X», «Gesto Y» o «Gesto Z».':'Preparado. El maestro seleccionará un eje.')):
            active?(gesture.phase==='finished'?'Gesto capturado. Esperando el resultado…':
                masterNow<gesture.start?'Móviles quietos hasta «¡AHORA!».':
                'Mueve el conjunto en '+axis.toUpperCase()+' durante 6 segundos.'):
            phase==='processing'?'Analizando el movimiento de los móviles.':
            phase==='accepted'?'Sincronización física completada.':
            phase==='network'?'Midiendo y ajustando los relojes.':
            'Calibra primero los relojes.';
        gestureActions.hidden=!ready;
        for(const key of ['x','y','z']){
            const control=$('jointSyncGesture'+key.toUpperCase()),done=!!state.results?.[s.id]?.axes?.[key];
            control.hidden=s.role!=='host';control.disabled=s.role!=='host'||!ready||done;
            control.classList.toggle('done',done);
        }
        const localRows=[],own=state.results?.[s.id];
        if(own?.axes)localRows.push('<article class="joint-sync-card"><strong>'+escape(s.name)+' · '+(phase==='accepted'?'referencia':'maestro')+'</strong><p>'+axisResultMarkup(own.axes)+'</p><small>'+(own.accepted?'Corrección: '+own.correctionMs.toFixed(2)+' ms':'Sin corrección física local')+'</small></article>');
        for(const p of peers){
            const result=state.results?.[p.id],model=state.models?.[p.id]||p.startModel;
            const clock=finite(model?.offset)?'Offset inicial: '+model.offset.toFixed(2)+' ms · RTT mín.: '+(finite(model.rtt)?model.rtt.toFixed(2):'—')+' ms':'Modelo de reloj pendiente';
            localRows.push('<article class="joint-sync-card"><strong>'+escape(p.name)+'</strong><p>'+(result?.axes?axisResultMarkup(result.axes):phase==='network'?'Midiendo RTT y offset…':phase==='gesture'?'Esperando gesto común…':'Pendiente')+'</p><small>'+clock+'<br>'+(result?.accepted?'Corrección aplicada: '+result.correctionMs.toFixed(2)+' ms':result?.error?escape(result.error):'Se correlacionarán X–X, Y–Y y Z–Z.')+'</small></article>');
        }
        const summary=$('jointSyncSummary'),markup=localRows.length?localRows.join(''):'<p class="joint-help">Activa y calibra todos los acelerómetros antes de validar la sincronización.</p>';
        if(summary.innerHTML!==markup)summary.innerHTML=markup;
        if(phase==='accepted')$('jointSyncHelp').textContent='Sincronización validada. Puedes pasar a Medir.';
        else if(phase==='gesture-ready')$('jointSyncHelp').textContent=ready?
            (s.role==='host'?'Elige un eje. Tras 3 s quieto, mueve el conjunto durante 6 s. Si falla, repite ese eje.':'Espera a que el maestro inicie cada gesto.'):
            guide==='demo'?'Observa el ejemplo; después comenzarán los gestos.':
            'Lee las instrucciones y observa el movimiento antes de empezar.';
        else if(phase==='failed')$('jointSyncHelp').textContent='La prueba no se ha validado. Pulsa «Calibrar relojes» para repetir.';
        else if(!axesReady)$('jointSyncHelp').textContent='Calibra los tres ejes en todos los móviles antes de empezar.';
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
            ready?'Pulsa «Gesto X», «Gesto Y» o «Gesto Z». Cada prueba registra 2,5 s y corrige solo el signo del eje seleccionado.':
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
        } else if(t<active.end) {
            box.hidden=false;box.classList.add('go');box.textContent='MIDE · '+Math.max(0,(active.end-t)/1000).toFixed(1)+' s';
        } else {
            box.hidden=true;box.classList.remove('go');
        }
    }
    function startCalibration(axis) {
        if(!['x','y','z'].includes(axis))throw Error('Eje de calibración no válido.');
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.guidePhase!=='ready')throw Error('Pulsa primero «Calibrar ejes» y observa el ejemplo.');
        if(s.calibration.active||s.calibration.map[axis])return;
        // Three seconds of baseline including gravity; one 2s SVG cycle and .5s margin.
        const start=now()+3000;
        s.calibration.feedback=null;
        s.calibration.active={axis,start,end:start+CAL_GESTURE_MS,baseline:[],samples:[]};
        renderCalibration();
        revealActionTarget('jointCalibrationAnimation','start');
        tell('Eje '+axis.toUpperCase()+': quieto 3, 2, 1. Después haz una sola ida y vuelta.');
    }
    function chooseManualCalibration() {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.complete)return;
        s.calibration.manualChoosing=true;
        s.calibration.guidePhase='idle'; // Cancela una demostración pendiente.
        renderCalibration();
        revealActionTarget('jointManualCalibration','start');
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
        revealActionTarget('jointSyncAnimation','start');
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
        try {
            await Promise.all(peers.map(p=>startSync(p,200,50,'precal',id)));
            await pause(500);
            for(const p of peers){
                const rows=p.samples.filter(row=>row.runId===id&&row.phase==='precal');
                if(rows.length<185)throw Error('Solo se completaron '+rows.length+' de 200 intercambios con '+p.name+'. Repite la calibración.');
                const model=clockFit(rows);
                if(!model)throw Error('No se pudo ajustar el reloj de '+p.name+'.');
                p.model=model;p.startModel=structuredClone(model);
                s.syncCalibration.models[p.id]=structuredClone(model);
                send(p,{type:'CLOCK_MODEL',model});
            }
        }catch(error){
            if(s.syncCalibration.id===id){
                s.syncCalibration.phase='failed';
                renderSyncCalibration();
            }
            throw error;
        }
        if(s.syncCalibration.id!==id)return;
        s.syncCalibration.phase='gesture-ready';s.syncCalibration.results[s.id]={axes:{},accepted:true,correctionMs:0};
        broadcast({type:'SYNC_GUIDE_BEGIN',id});
        tell('Relojes listos. Sigue las instrucciones y observa el ejemplo.');
        beginSyncGuide(s.syncCalibration);
    }
    function startSyncGesture(axis) {
        requireHostEdit();const state=s.syncCalibration;
        if(state.phase!=='gesture-ready'||!['x','y','z'].includes(axis)||state.results?.[s.id]?.axes?.[axis])return;
        const start=now()+SYNC_READY_MS,end=start+SYNC_GESTURE_MS,payload={type:'SYNC_GESTURE_ARM',id:state.id,axis,start,end};
        state.demo=null;state.lastFeedback='';
        armSyncGesture(payload,{offset:0,drift:0,reference:0,count:0,rtt:0});broadcast(payload);
        revealActionTarget('jointSyncAnimation','start');
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
        if(missing.length){
            state.phase='gesture-ready';state.gesture=null;
            state.lastFeedback='No llegaron todos los datos de '+axis.toUpperCase()+'. Repite ese eje.';
            for(const p of peers)send(p,{type:'SYNC_AXIS_RETRY',id,axis});
            tell('No llegó la ventana de '+axis.toUpperCase()+' de '+missing.join(', ')+'. Repite solo ese gesto.',true);
            renderSyncCalibration();return;
        }
        const failedAxis=peers.filter(p=>state.results[p.id]?.axes?.[axis]?.error);
        if(failedAxis.length){
            const details=failedAxis.map(p=>{
                const result=state.results[p.id],error=result.axes[axis].error;
                return p.name+': '+error+' (maestro '+masterSamples.length+' muestras, participante '+(result.windows[axis]?.length||0)+')';
            }).join('; ');
            state.phase='gesture-ready';state.gesture=null;
            state.lastFeedback='No se validó el eje '+axis.toUpperCase()+'. Repite ese gesto.';
            for(const p of peers)send(p,{type:'SYNC_AXIS_RETRY',id,axis});
            tell('No se validó el gesto '+axis.toUpperCase()+': '+details+'. Repite solo este eje.',true);
            renderSyncCalibration();return;
        }
        state.results[s.id].axes[axis]={axis,lag:0,correlation:1};
        state.lastFeedback='✓ Eje '+axis.toUpperCase()+' sincronizado. Puedes continuar.';
        for(const p of peers)send(p,{type:'SYNC_AXIS_PROGRESS',id,axis,lag:state.results[p.id].axes[axis].lag,correlation:state.results[p.id].axes[axis].correlation});
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
            state.lastFeedback='El eje '+retry.toUpperCase()+' debe repetirse para validar la sincronización.';
            for(const p of peers)send(p,{type:'SYNC_AXIS_RETRY',id,axis:retry});
            tell('El gesto '+retry.toUpperCase()+' es el menos coherente entre móviles. Repite solo ese eje.',true);renderSyncCalibration();return;
        }
        state.phase='accepted';state.accepted=true;state.lastFeedback='✓ Sincronización completa.';
        for(const p of peers){const result=state.results[p.id];p.syncCalibration=structuredClone(result);send(p,{type:'SYNC_GESTURE_APPLY',id,correctionMs:result.correctionMs,axes:result.axes});}
        tell('Sincronización física validada. Ya puedes pasar a Medir.');renderSyncCalibration();renderDevices();
    }

        return Object.freeze({renderSyncCalibration, axisResultMarkup, showCalibration, calibrationAxisName, renderCalibration, renderCalibrationCountdown, beginCalibrationGuide, receiveSyncGuide, startCalibration, chooseManualCalibration, setManualCalibration, finishCalibration, correctedVector, armSyncGesture, startSyncCalibration, startSyncGesture, finalizeSyncGesture});
    }
    const api=Object.freeze({createController});
    if(typeof module==='object'&&module.exports) module.exports=api;
    else root.VWOMACalibration=api;
})(globalThis);
