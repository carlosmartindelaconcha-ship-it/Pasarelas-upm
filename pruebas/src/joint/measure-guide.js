/* VWOMA | Guia visual del setup en la pestaña Medir.
 * Solo consulta el plano y los registros; no modifica el protocolo ni las muestras.
 */
(function registerMeasureGuide(root) {
    'use strict';
    const isSensor = p => (p.kind || 'sensor') === 'sensor';
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    function viewModel(s, valid) {
        const host = s.role === 'host';
        const source = s.run?.plan || s.plan;
        const points = Array.isArray(source?.points) ? source.points : [];
        const setupPlan = host ? s.setupPlan : null;
        const activeIndex = setupPlan?.activeIndex ?? null;
        const selectedIndex = Number.isInteger(setupPlan?.selectedIndex) ? setupPlan.selectedIndex : 0;
        const index = s.run ? (activeIndex === null ? selectedIndex : activeIndex) : selectedIndex;
        const setup = setupPlan?.setups?.[index] || null;
        const masterDeviceId = host ? s.id : [...s.peers.values()][0]?.id;
        const canPreview = Boolean(host && valid && setup);
        const assignments = canPreview ?
            setup.assignments : points.filter(p => isSensor(p) && p.device)
                .map(p => ({pointId:p.id,deviceId:p.device}));
        const byPoint = new Map(points.map(p => [p.id, p]));
        const byDevice = new Map([...s.peers.values()].map(p => [p.id, p]));
        const assignedIds = new Set(assignments.map(a => a.deviceId));
        let slaveNumber = 0;
        const devices = assignments.map(a => {
            const master = a.deviceId === masterDeviceId;
            const peer = byDevice.get(a.deviceId);
            const point = byPoint.get(a.pointId);
            const isLocal = a.deviceId === s.id;
            const ready = isLocal ?
                Boolean(s.sensor && s.calibration?.complete) :
                Boolean(peer?.channel?.readyState === 'open' && peer.status?.sensor &&
                    peer.status?.visible && peer.status?.calibrated);
            return {deviceId:a.deviceId, pointId:a.pointId, point, master,
                code:master ? 'M' : 'S' + (++slaveNumber),
                name:isLocal ? s.name : peer?.name || 'Participante',
                ready, online:isLocal || peer?.channel?.readyState === 'open'};
        });
        const waiting = [...byDevice.values()].filter(p => !assignedIds.has(p.id))
            .map(p => p.name || 'Participante');
        const run = s.run;
        const recorded = Boolean(host && setup?.measuredRunId && run?.finished &&
            run.state === 'finished' && setup.measuredRunId === run.id);
        const completed = Boolean(recorded && setup.completedRunId === run.id);
        const expected = run?.finished && run.state === 'finished' ?
            [...new Set(run.plan.points.filter(p => isSensor(p) && p.device).map(p => p.device))] : [];
        const missing = host ? expected.filter(id => !s.results.has(id)) : [];
        let state = 'Sin planificación', description = 'Genera un plan en Setups y activa la distribución antes del ensayo.';
        if (!host) {
            state = devices.some(d => d.deviceId === s.id) ? 'Punto asignado' : 'En espera';
            description = devices.some(d => d.deviceId === s.id) ?
                'Coloca este móvil en el punto indicado por el maestro.' :
                'Espera a que el maestro asigne un punto a este móvil.';
        } else if (setupPlan && !valid && !run) {
            state = 'Plan desactualizado';
            description = 'El plano o los dispositivos han cambiado. Regenera los setups antes de medir.';
        } else if (setup && (activeIndex === null || index !== activeIndex)) {
            state = 'Pendiente de activar';
            description = 'Vista previa. Activa este setup en su pestaña antes de iniciar la medida.';
        } else if (setup && completed) {
            state = 'Completado';
            description = 'Registro confirmado. Puedes preparar el siguiente setup o repetir este.';
        } else if (setup && recorded) {
            state = 'Registro finalizado';
            description = missing.length ?
                'Faltan ' + missing.length + ' registro(s) de móvil por recibir antes de confirmar.' :
                'Comprueba los resultados y marca el setup como completado.';
        } else if (setup && run?.state === 'cancelled') {
            state = 'Ensayo cancelado';
            description = 'Los datos parciales se conservan. Puedes preparar una repetición.';
        } else if (setup && run && !run.finished) {
            state = 'Medición en curso';
            description = 'Conserva las posiciones hasta que termine el ensayo.';
        } else if (setup && activeIndex !== null) {
            state = 'Preparado para medir';
            description = 'Verifica las posiciones, activa todos los sensores e inicia la medida.';
        }
        const total = setupPlan?.setups?.length || 0;
        const completeCount = setupPlan?.setups?.filter(x => x.completedRunId).length || 0;
        const history = setupPlan?.history || [];
        return {host, source, points, setupPlan, setup, index, activeIndex, assignments,
            devices, waiting, masterDeviceId, recorded, completed, missing,
            state, description, total, completeCount, history, run};
    }
    const symbols = typeof module === 'object' && module.exports ?
        require('./setup-symbols.js') : root.VWOMASetupSymbols;
    function planSvg(model, escape) {
        return symbols.planSvg({
            plan:model.source,
            assignments:model.assignments,
            masterId:model.masterDeviceId,
            measured:symbols.measuredPoints(model.setupPlan),
            escapeText:escape
        });
    }
    function createController({s,$,escape,currentValid}) {
        const cache = new Map();
        function html(id, markup) {
            const element = $(id);
            if (!element || cache.get(id) === markup) return;
            element.innerHTML = markup;
            cache.set(id, markup);
        }
        function text(id, value) {
            const element = $(id);
            if (element && element.textContent !== value) element.textContent = value;
        }
        function renderMeasureGuide() {
            const guide = $('jointMeasureSetupGuide');
            if (!guide || !s.role) return;
            const model = viewModel(s, !s.setupPlan || currentValid());
            const label = model.total ? 'Setup '+(model.index+1)+' de '+model.total :
                (model.host ? 'Medida conjunta' : 'Tu posición de medida');
            text('jointMeasureGuideTitle', label);
            text('jointMeasureGuideStatus', model.state);
            text('jointMeasureGuideHint', model.description);
            html('jointMeasureGuidePlan', planSvg(model,escape));
            const rows = model.devices.map(d =>
                '<li class="joint-guide-device"><span class="joint-guide-dot '+(d.master?'master':'slave')+'"></span>'+
                '<strong>'+escape(d.code)+' · '+escape(d.name)+'</strong>'+
                '<span>'+escape(d.pointId)+'</span>'+
                '<small class="'+(d.ready?'ready':'pending')+'">'+(d.ready?'Listo':d.online?'Revisar sensor':'Desconectado')+'</small></li>'
            ).join('');
            html('jointMeasureGuideDevices', rows ||
                '<li class="joint-guide-empty">Todavía no hay móviles asignados a puntos.</li>');
            text('jointMeasureGuideWaiting', model.waiting.length ?
                'En espera: '+model.waiting.join(', ') : '');
            const counters = model.total ? model.completeCount+' de '+model.total+' setups completados' :
                'Sin campaña de setups';
            text('jointMeasureGuideCounter',counters);
            const progress = model.setupPlan?.setups?.map((setup,i)=>{
                const status = setup.completedRunId ? 'complete' : setup.measuredRunId ? 'recorded' : 'pending';
                return '<span class="joint-guide-step '+status+'" title="Setup '+(i+1)+
                    ': '+(status==='complete'?'completado':status==='recorded'?'registrado':'pendiente')+'"> '+
                    (i+1)+(status==='complete'?' ✓':'')+'</span>';
            }).join('') || '';
            html('jointMeasureGuideSteps',progress);
            const attempts = model.history.slice(-6).reverse().map(h=>{
                const time = h.finishedAt ? new Date(h.finishedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
                return '<li>Setup '+escape(h.index)+' · '+escape(h.runId?.slice(0,8)||'')+
                    ' · '+(h.completed?'Completado':'Registrado')+(time?' · '+escape(time):'')+'</li>';
            }).join('');
            html('jointMeasureGuideHistory',attempts ||
                '<li class="joint-guide-empty">Aún no hay ensayos registrados en esta sesión.</li>');
            const finished = model.host && Boolean(model.run?.finished);
            const completed = Boolean(model.completed);
            const complete = $('jointMeasureComplete'), next = $('jointMeasureNext'),
                repeat = $('jointMeasureRepeat'), setups = $('jointMeasureGoSetups');
            complete.hidden = !finished || !model.recorded || completed;
            complete.disabled = model.missing.length > 0;
            complete.title = model.missing.length ?
                'Espera a recibir los registros de todos los móviles.' : 'Confirmar la campaña de este setup';
            next.hidden = !finished || !model.recorded || !completed;
            next.textContent = model.setupPlan?.setups?.some(setup => !setup.completedRunId) ?
                'Preparar siguiente setup' : 'Preparar otro ensayo';
            repeat.hidden = !finished || !model.setup;
            setups.hidden = !model.host;
        }
        return Object.freeze({renderMeasureGuide});
    }
    const api = Object.freeze({viewModel,planSvg,createController});
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VWOMAMeasureGuide = api;
})(globalThis);
