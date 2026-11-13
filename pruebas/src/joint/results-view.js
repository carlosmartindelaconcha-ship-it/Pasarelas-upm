/* VWOMA | UI controller for measurement results, synchronized clock plots
 * and comparison of multiple devices. Keeps Chart.js and DOM confined here.
 * Data processing/exports and record transfers use their own modules.
 */
(function registerResultsView(root) {
    'use strict';
    function createResultsView({s,$,escape,Chart,median,finite,running,
                                syncMetric,selectedForModel,enableLegendToggling,
                                comparisonExport,samplePeriodMs,structuralValue,
                                resampleAxis,detrendPoints}) {
    function renderResults(updateSyncCharts=true) {
        const r=s.run;
        $('jointDownload').disabled=!r?.finished;$('jointCsv').disabled=!r?.finished;$('jointDownloadProcessed').disabled=!r?.finished;$('jointCsvProcessed').disabled=!r?.finished;
        $('jointNewRun').disabled=!!running()||!!s.transfer||!!r?.finishing;
        $('jointSendData').hidden=s.role!=='guest';$('jointSendData').disabled=!r?.finished||!!s.transfer;
        if(!r){$('jointResultsList').textContent='Todavía no hay un ensayo registrado.';$('jointSyncResults').hidden=true;return;}
        let html=`<p><strong>${r.state==='cancelled'?'Ensayo cancelado':r.finished?'Registro terminado':'Ensayo en curso'}</strong> · ${escape(r.plan.name)}</p>`;
        const expected=[r.device,...(s.role==='host'?[...s.peers.values()].filter(p=>r.plan.points.some(q=>q.device===p.id)).map(p=>({id:p.id,name:p.name})):[])];
        for(const d of expected) {
            const data=s.results.get(d.id);
            const incoming=s.role==='host'?s.peers.get(d.id)?.incoming:null;
            const details=data?data.samples.length+' muestras · '+data.incidents.length+' incidencias':d.id===s.id?r.samples.length+' muestras locales':incoming?'Recibiendo registro: '+Math.round(100*incoming.length/Math.max(1,incoming.size))+'%':'Registro pendiente de recibir';
            html+=`<article class="joint-device-card"><strong>${escape(d.name)}</strong><p>${details}</p></article>`;
        }
        if(s.transfer)html+=`<p>Enviando al maestro: ${s.transfer.percent}%</p>`;
        if(r.transferred)html+='<p>Registro confirmado por el maestro.</p>';
        if(s.transferError)html+=s.role==='host'
            ?`<p class="joint-warning">Registro rechazado: ${escape(s.transferError)}. Solicita al participante que compruebe la conexión y vuelva a enviar el registro.</p>`
            :`<p class="joint-warning">No se pudo entregar el registro: ${escape(s.transferError)}. Puedes volver a pulsar «Enviar datos» sin perder las muestras locales.</p>`;
        if(s.storageFailed)html+='<p class="joint-warning">El guardado persistente ha fallado: descarga los datos antes de cerrar.</p>';
        $('jointResultsList').innerHTML=html;
        if(updateSyncCharts)renderSyncResults(r);
    }
    function clearSyncCharts(){for(const chart of s.syncCharts)chart?.destroy();s.syncCharts=[];}
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

    function renderComparison() {
        const status=$('jointCompareStatus'),view=$('jointCompareView').value;
        // Avoid remapping all samples and reconstructing heavy charts every time
        // someone changes tabs on Android. Rebuild when a run, file, view or
        // received record actually changes.
        const recordsNow=[...s.results.entries()].map(([id,r])=>[id,r,r.samples?.length||0]);
        const previous=s.compareRenderCache;
        const same=previous&&previous.run===s.run&&
            previous.imported===s.compareExport&&previous.view===view&&
            previous.records.length===recordsNow.length&&
            recordsNow.every(([id,r,n],i)=>previous.records[i][0]===id&&
                previous.records[i][1]===r&&previous.records[i][2]===n);
        if(same&&s.compareCharts?.length===3){
            for(const chart of s.compareCharts)chart.resize?.();
            return;
        }
        const data=comparisonExport();
        for(const chart of s.compareCharts||[])chart.destroy();s.compareCharts=[];
        if(!data) {status.textContent='Termina un ensayo y recibe los registros de los participantes para compararlos aquí.';return;}
        const records=data.records.filter(r=>r.samples?.length).sort((a,b)=>{
            const ap=data.plan.points?.find(p=>p.device===a.device.id),bp=data.plan.points?.find(p=>p.device===b.device.id);
            return (ap?.x??0)-(bp?.x??0);
        });
        if(!records.length) {status.textContent='El ensayo no contiene muestras para representar.';return;}
        if(typeof Chart==='undefined') {status.textContent='No se ha cargado la librería de gráficas. Recarga la página con conexión.';return;}
        const start=data.windowMasterMs.start,end=data.windowMasterMs.end,span=Math.max(1,end-start),axes=[['X',0,'#1565c0','jointCompareCanvasX'],['Y',1,'#c62828','jointCompareCanvasY'],['Z',2,'#2e7d32','jointCompareCanvasZ']],dashes=[[],[8,5],[3,4],[11,4,2,4]];
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
            // Consistent with Realizar medida: temporal X=0..duration and
            // symmetric Y around zero, rounded up by 20% for readable ticks.
            let peak=.000001;
            for(const dataset of datasets)for(const point of dataset.data)
                if(finite(point.y))peak=Math.max(peak,Math.abs(point.y));
            const expansion=peak*1.2,exponent=Math.pow(10,Math.floor(Math.log10(expansion))-1);
            const yLimit=Math.ceil(expansion/exponent)*exponent;
            options.scales.y.min=-yLimit;
            options.scales.y.max=yLimit;
            options.plugins.zoom.limits.y={min:-yLimit,max:yLimit};
            options.plugins.zoom.pan.mode='x';
            // Do not trap single-finger scrolling over canvases on touchscreens.
            if(typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches)
                options.plugins.zoom.pan.enabled=false;
            const chart=new Chart($(canvasId).getContext('2d'),{type:'line',data:{datasets},options});
            s.compareCharts.push(chart);enableLegendToggling(chart);
        }
        s.compareRenderCache={run:s.run,imported:s.compareExport,view,records:recordsNow};
    }

        return Object.freeze({renderResults,clearSyncCharts,jointTemporalOptions,histogramBins,histogramMarkup,timelineMarkup,makeHistogramChart,makeTimelineChart,modelSummaryMarkup,renderSyncResults,renderComparison});
    }
    const api=Object.freeze({createResultsView});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAResultsView=api;
})(globalThis);
