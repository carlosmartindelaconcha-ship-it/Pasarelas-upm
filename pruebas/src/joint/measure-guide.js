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
        const index = activeIndex === null ? selectedIndex : activeIndex;
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
        } else if (setup && activeIndex === null) {
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
    function planSvg(model, escape) {
        const plan = model.source;
        if (!plan || !model.points.length) return '<p class="joint-help">Añade sensores y apoyos en la pestaña Plano.</p>';
        const length = Math.max(.001, Number(plan.length) || 1);
        const width = Math.max(.001, Number(plan.width) || 1);
        const x = p => (36 + 568 * clamp(Number(p.x)/length,0,1)).toFixed(2);
        const y = p => (36 + 142 * (1-clamp(Number(p.y)/width,0,1))).toFixed(2);
        const active = new Map(model.devices.map(d => [d.pointId,d]));
        let svg = '<svg viewBox="0 0 640 218" role="img" aria-label="Planta del setup: maestro verde, participantes azules, puntos inactivos grises y apoyos triangulares" preserveAspectRatio="xMidYMid meet">';
        svg += '<rect x="24" y="24" width="592" height="168" rx="9" fill="#f7fafc" stroke="#d9e4ed"/>';
        svg += '<rect x="36" y="36" width="568" height="142" rx="2" fill="#fff" stroke="#afc5d5" stroke-width="1.4"/>';
        for (const p of model.points.filter(p => p.kind === 'support')) {
            svg += '<path d="M '+x(p)+' '+(Number(y(p))-8)+' l -9 16 h 18 Z" fill="#f4d8b3" stroke="#aa7339" stroke-width="1.8"/>';
        }
        for (const p of model.points.filter(p => p.kind === 'interpolation')) {
            svg += '<rect x="'+(Number(x(p))-3.5)+'" y="'+(Number(y(p))-3.5)+'" width="7" height="7" rx="1" fill="#fff" stroke="#a5b4c3"/>';
        }
        const sensors = model.points.filter(isSensor);
        for (let i=0;i<sensors.length;i++) {
            const p = sensors[i],d = active.get(p.id);
            const color = d ? d.master ? '#16824e' : '#176bb0' : '#cdd6df';
            const tx = x(p),ty = Number(y(p)),labelBelow = ty < 63;
            const label = (d ? d.code+' · ' : '') + String(p.id);
            svg += '<circle cx="'+tx+'" cy="'+ty+'" r="'+(d?8:5.5)+'" fill="'+color+'" stroke="'+(d?'#fff':'#aebdcc')+'" stroke-width="'+(d?2:1.2)+'"/>';
            svg += '<text x="'+clamp(Number(tx),55,585)+'" y="'+(labelBelow?ty+23:ty-12)+'" fill="'+(d?'#244a68':'#8795a3')+'" font-size="'+(d?11.5:10.5)+'" font-weight="'+(d?'700':'500')+'" text-anchor="middle">'+escape(label)+'</text>';
        }
        svg += '<text x="36" y="207" font-size="11" fill="#6a7d8d">X = 0</text>';
        svg += '<text x="604" y="207" font-size="11" fill="#6a7d8d" text-anchor="end">X = '+escape(plan.length)+' m</text>';
        return svg+'</svg>';
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
