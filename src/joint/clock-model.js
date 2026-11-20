/* VWOMA | Pure clock model and time conversion primitives.
 * The 4-timestamp estimator, lower-RTT selection, Theil-Sen drift
 * and milliseconds formulas preserve the original implementation.
 * Inject now() for deterministic tests; no access to DOM, WebRTC or storage.
 */
(function registerClockModel(root) {
    'use strict';
    function createClockModel({now,finite}) {
    function median(values) {
        const a=values.filter(finite).sort((x,y)=>x-y),n=a.length;if(!n)return null;
        return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
    }

    // Four timestamps. Network asymmetry remains an unobservable error source.
    function clockFit(samples) {
        if(!samples.length)return null;
        const recent=samples.slice(-240),sorted=[...recent].sort((a,b)=>a.rtt-b.rtt);
        const cutoff=sorted[Math.max(0,Math.ceil(sorted.length*.3)-1)].rtt;
        const chosen=recent.filter(v=>v.rtt<=cutoff);
        const reference=median(chosen.map(v=>v.local));
        const span=Math.max(...chosen.map(v=>v.local))-Math.min(...chosen.map(v=>v.local));
        const slopes=[];
        if(span>=20000&&chosen.length>=6)for(let i=0;i<chosen.length;i++)for(let j=i+1;j<chosen.length;j++){
            const dt=chosen[j].local-chosen[i].local;if(Math.abs(dt)>=50)slopes.push((chosen[j].offset-chosen[i].offset)/dt);
        }
        const drift=slopes.length?median(slopes):0;
        // Offset at the reference instant. Median makes isolated path asymmetries harmless.
        const offset=median(chosen.map(v=>v.offset-drift*(v.local-reference)));
        // Grossly implausible fits are not used to schedule an acquisition.
        if(!finite(drift)||Math.abs(drift)>.005)return null;
        const residual=Math.sqrt(chosen.reduce((a,v)=>a+(v.offset-offset-drift*(v.local-reference))**2,0)/chosen.length);
        return {reference,offset,drift,rtt:sorted[0].rtt,residual,count:samples.length,selectedCount:chosen.length,rttCutoff:cutoff,rttMedian:median(chosen.map(v=>v.rtt)),span,method:'mediana del 30 % de RTT menor; deriva Theil–Sen',updated:now()};
    }
    const toMaster=(t,m)=>t-m.offset-m.drift*(t-m.reference);
    const fromMaster=(t,m)=> (t+m.offset-m.drift*m.reference)/(1-m.drift);

    function validModel(m) {return m&&['offset','drift','reference','count','rtt'].every(k=>finite(m[k]))&&Math.abs(m.drift)<=.005&&m.count>=1;}


    const modelOffsetAt=(model,time)=>{const m=model||{offset:0,drift:0,reference:0};return m.offset+m.drift*(time-m.reference);};
    const offsetResidual=(row,model)=>row.offset-modelOffsetAt(model,row.local);
    const selectedForModel=(row,model)=>!finite(model?.rttCutoff)||row.rtt<=model.rttCutoff;
    function syncMetric(row,metric,model){return metric==='rtt'?row.rtt:offsetResidual(row,model);}

        return Object.freeze({
            median, clockFit, toMaster, fromMaster, validModel,
            modelOffsetAt, offsetResidual, selectedForModel, syncMetric
        });
    }
    const api = Object.freeze({ createClockModel });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMAClockModel = api;
    }
})(globalThis);
