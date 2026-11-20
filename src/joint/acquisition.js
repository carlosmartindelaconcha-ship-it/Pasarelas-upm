/* VWOMA | Joint acquisition lifecycle controller.
 * Controls sample bounds, scheduled starts, stop/abort, wake lock,
 * in-run clock probes and final persistence. UI is injected as callbacks.
 * The existing protocol, timestamps, thresholds and run schema are unchanged.
 */
(function registerAcquisition(root) {
    'use strict';
    function createAcquisition({s, MAX_SAMPLES, now, running, incident, toMaster, syncOnce, navigator, setInterval, clearInterval, requireHostEdit, localStatus, pageHidden, readDuration, pointFor, tell, pause, finite, uid, broadcast, send, correctedVector, persist, persistBeforeClosing, sendRecord, localRecord, structuredClone, ui}) {
    function appendSample(run,sample) {
        if(run.samples.length>=MAX_SAMPLES){if(!run.sampleLimit){run.sampleLimit=true;incident('limit','Se ha alcanzado el límite de muestras.');}run.end=Math.min(run.end,toMaster(now(),run.initialClock));return;}
        const row=[...sample];row[0]=run.samples.length;run.samples.push(row);
    }
    function startDuringSync() {
        clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;
        if(s.role!=='host'||![...s.peers.values()].some(p=>p.channel?.readyState==='open'))return;
        s.duringSyncTimer=setInterval(()=>{
            if(!running()||s.role!=='host')return;
            for(const p of s.peers.values())if(p.channel?.readyState==='open')syncOnce(p,'during',s.run.id);
        },100);
    }
    function stopDuringSync(){clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;}
    async function requestWake() {try{if(navigator.wakeLock)s.wake=await navigator.wakeLock.request('screen');}catch(e){incident('screen','No se pudo mantener la pantalla activa.');}}
    function releaseWake(){if(s.wake){s.wake.release().catch(()=>{});s.wake=null;}}
    function beginRun(id,start,end,duration) {
        s.results.clear();s.compareExport=null;s.storageFailed=false;s.transferError=null;
        const networkModel=s.role==='host'?{offset:0,drift:0,reference:0,count:0,rtt:0}:structuredClone(s.syncModel);
        const physicalCorrection=s.role==='host'?0:Number(s.syncCalibration.correctionMs||0);
        const model={...networkModel,offset:networkModel.offset+physicalCorrection,physicalCorrectionMs:physicalCorrection};
        const quiet=s.recent.filter(sample=>sample[2]>=now()-1000).map(sample=>correctedVector(sample.slice(3,6)));
        const previewBaseline=['x','y','z'].map((_,index)=>quiet.length?quiet.reduce((sum,row)=>sum+row[index],0)/quiet.length:0);
        const solo=s.role==='host'&&![...s.peers.values()].some(p=>p.channel?.readyState==='open');
        // The historical plan is kept for later trials. Only this run's
        // snapshot removes assignments to devices that are not recording.
        const runPlan=structuredClone(s.plan);
        if(solo)for(const point of runPlan.points)if(point.device&&point.device!==s.id)point.device=null;
        const syncModels=s.role==='host'?(solo?{}:Object.fromEntries([...s.peers.values()].filter(p=>p.channel?.readyState==='open').map(p=>[p.id,structuredClone(p.startModel||p.model||{})]))):{[s.id]:structuredClone(model)};
        const synchronizationCalibration=solo?{phase:'not-required',accepted:false,gesture:null,results:{},models:{},correctionMs:0}:structuredClone(s.syncCalibration);
        s.run={id,session:s.session,start,end,plannedEnd:end,duration,state:'armed',created:new Date().toISOString(),plan:runPlan,initialClock:model,networkClock:structuredClone(networkModel),finalClock:model,syncModels,synchronizationCalibration,samples:[],incidents:[],persisted:0,chunkIndex:0,previewBaseline,device:{id:s.id,name:s.name,role:s.role,point:structuredClone(pointFor()||null),calibration:structuredClone(s.calibration)},sync:[]};
        for(const sample of s.recent){const t=finite(sample[8])?sample[8]:toMaster(sample[7],model);if(t>=start-1000&&t<=end+1000)appendSample(s.run,sample);}
        ui.enterRecording();requestWake();startDuringSync();persist();ui.runArmed();
    }
    async function startRun() {
        requireHostEdit();
        if(!localStatus().sensor||pageHidden())throw Error('Activa el acelerómetro del maestro y mantén la página visible.');
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        const solo=peers.length===0;
        if(!pointFor())throw Error('Asigna el maestro a un punto del plano.');
        if(!solo&&s.plan.points.some(q=>q.device&&q.device!==s.id&&!peers.some(p=>p.id===q.device)))throw Error('Hay un punto asignado a un móvil desconectado. Conéctalo o elimina su asignación.');
        for(const p of peers) {
            if(!pointFor(p.id))throw Error('Asigna '+p.name+' a un punto del plano.');
            if(!p.status?.sensor||!p.status.visible||now()-p.lastSeen>6000)throw Error(p.name+' no tiene el sensor preparado o la página visible.');
            if(!p.status?.calibrated)throw Error(p.name+' debe completar la calibración de ejes.');
        }
        if(!s.calibration.complete)throw Error('Completa la calibración X, Y y Z del maestro antes de medir.');
        if(!solo&&!s.syncCalibration.accepted)throw Error('Completa primero la pestaña Calibrar y sincronizar.');
        const duration=Number(readDuration());if(!finite(duration)||duration<5||duration>1800||!Number.isInteger(duration))throw Error('Introduce una duración entera entre 5 y 1800 segundos.');
        if(solo) {
            // No PREPARE / READY / START_ACK or physical clock calibration.
            // The local record is otherwise identical to a joint host record.
            const start=now()+4000,end=start+duration*1000;
            beginRun(uid(),start,end,duration);
            tell('Ensayo solo con el maestro. Comenzará en unos segundos.');
            ui.refresh();
            return;
        }
        const id=uid(),tx={id,ready:new Map(),acks:new Set(),error:null,phase:'ready',peers};
        s.transaction=tx;ui.preparing();
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
            if(!s.run)ui.preparationInterrupted();
            throw e;
        } finally {if(s.transaction===tx)s.transaction=null;ui.refresh();}
    }
    function stopRun(reason='Parada manual') {
        if(s.role==='guest') {
            const host=[...s.peers.values()][0];send(host,{type:'STOP_REQUEST'});
            if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,toMaster(now(),s.run.initialClock)));incident('stop','Parada local solicitada');}
            return;
        }
        if(s.transaction||s.run?.state==='armed') {
            const id=s.transaction?.id||s.run.id;s.transaction=null;
            if(s.run?.plan.points.some(p=>p.device&&p.device!==s.id)||!s.run)broadcast({type:'ABORT',runId:id,reason});
            if(running()){s.run.state='cancelled';incident('cancel',reason);finishRun(true);}return;
        }
        if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,now()));incident('stop',reason);if(s.run.plan.points.some(p=>p.device&&p.device!==s.id))broadcast({type:'STOP_AT',runId:s.run.id,end:s.run.end});}
    }
    async function finishRun(cancelled=false) {
        const run=s.run;if(!run||run.finishing||run.finished)return;run.finishing=true;
        run.state=cancelled?'cancelled':'finished';run.finalClock=s.role==='host'?run.initialClock:structuredClone(s.syncModel);
        stopDuringSync();ui.exitRecording();releaseWake();
        ui.closing();
        await persistBeforeClosing(run);run.finished=true;run.finishing=false;
        if(s.run!==run)return;
        const record=localRecord();s.results.set(s.id,record);ui.finished();
        tell(cancelled?'Ensayo cancelado. Los datos disponibles se conservan.':'Registro local terminado. Ya puedes descargar los datos.');
        if(s.role==='guest'&&!cancelled)sendRecord().catch(e=>{incident('transfer',e.message);tell('Registro local conservado. '+e.message,true);});
    }


        return Object.freeze({appendSample, startDuringSync, stopDuringSync, requestWake, releaseWake, beginRun, startRun, stopRun, finishRun});
    }
    const api=Object.freeze({createAcquisition});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAAcquisition=api;
})(globalThis);
