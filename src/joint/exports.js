/* VWOMA | Session exports, CSV, shared time grid and structural data processing.
 * Original schemas, field names and numerical expressions are preserved.
 * The separate browser download function is also used for saved plans and recovery.
 */
(function registerExports(root) {
    'use strict';
    function createExports({s,finite,median,MAX_PEERS,toMaster,validModel,
                            correctedVector,localRecord,document,Blob,URL,setTimeout}) {
    function download(name, value, mime='application/json') {
        const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:mime});
        const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name;
        document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
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

        return Object.freeze({download,exportSession,processedCommonExport,exportProcessedJson,exportProcessedCsv,exportCsv,comparisonExport,validComparisonExport,samplePeriodMs,structuralValue,resampleAxis,detrendPoints});
    }
    const api=Object.freeze({createExports});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAExports=api;
})(globalThis);
