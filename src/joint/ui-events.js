/* VWOMA | Presentation event wiring, point-table gestures and SVG interactions.
 * Functions are injected by the coordinator; acquisition, network, clocks
 * and record schemas are deliberately unchanged.
 */
(function registerUIEvents(root) {
    'use strict';
    function bindEvents({
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
    }) {
    // UI bindings. All generated text is escaped before entering markup.
    $('openJointButton').addEventListener('click',guard(open));
    $('standaloneTestButton').addEventListener('click',guard(openStandaloneTest));
    $('jointExit').addEventListener('click',resetSession);
    document.querySelectorAll('[data-joint-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.jointTab);if(b.dataset.jointTab==='Results')renderResults();if(b.dataset.jointTab==='Sync')renderSyncCalibration();});
    $('jointCreate').onclick=guard(createJointSession);
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
    $('jointBeginCalibration').onclick=guard(beginCalibrationGuide);
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
    $('jointCompareResetZoom').onclick=()=>s.compareCharts?.forEach(chart=>chart.resetZoom?.('none'));
    document.querySelectorAll('[data-joint-compare-reset]').forEach(button=>{
        button.onclick=()=>{
            const axis=button.dataset.jointCompareReset;
            const canvas=$('jointCompareCanvas'+axis);
            s.compareCharts?.find(chart=>chart.canvas===canvas)?.resetZoom?.('none');
        };
    });
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
    }
    const api=Object.freeze({bindEvents});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAUIEvents=api;
})(globalThis);
