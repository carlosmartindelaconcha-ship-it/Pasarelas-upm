/* VWOMA | Pure numerical operations for acceleration/gesture calibration.
 * This module preserves the existing detrend, zero-phase low-pass cascade,
 * sign lobe recognition, temporal interpolation and cross-axis lag search.
 * Inject rate/median/finite for deterministic unit testing.
 */
(function registerCalibrationMath(root) {
    'use strict';
    function createMath({median,finite,sampleRate}) {
    function linearDetrend(values) {
        const n=values.length;if(n<3)return values.slice();
        let sx=0,sy=0,sxx=0,sxy=0;
        for(let i=0;i<n;i++){sx+=i;sy+=values[i];sxx+=i*i;sxy+=i*values[i];}
        const d=n*sxx-sx*sx,slope=Math.abs(d)>1e-12?(n*sxy-sx*sy)/d:0,intercept=(sy-slope*sx)/n;
        return values.map((value,i)=>value-(intercept+slope*i));
    }
    function lowPassCalibration(values,cutoffHz=10) {
        // Dos pares RC en ambos sentidos: paso bajo de 4.º orden, fc = 10 Hz y sin desfase temporal.
        if(values.length<4)return values.slice();
        const dt=1/Math.max(20,sampleRate()||60),rc=1/(2*Math.PI*cutoffHz),alpha=dt/(rc+dt);
        const pass=input=>{const output=[input[0]];for(let i=1;i<input.length;i++)output.push(output[i-1]+alpha*(input[i]-output[i-1]));return output;};
        let output=values.slice();
        for(let order=0;order<2;order++)output=pass(pass(output).reverse()).reverse();
        return output;
    }
    function calibrationLobes(values,threshold,rateHz=60) {
        // Extraer fases de aceleración que superan el ruido, manteniendo el orden temporal.
        const lobes=[],maxGap=Math.max(3,Math.round(.09*rateHz));
        let current=null;
        values.forEach((value,index)=>{
            const sign=Math.abs(value)>=threshold?Math.sign(value):0;
            if(!sign){if(current){lobes.push(current);current=null;}return;}
            if(!current||current.sign!==sign){
                if(current)lobes.push(current);
                current={sign,start:index,end:index,peak:Math.abs(value)};
            }else{current.end=index;current.peak=Math.max(current.peak,Math.abs(value));}
        });
        if(current)lobes.push(current);
        const merged=[];
        for(const lobe of lobes){
            const prev=merged[merged.length-1];
            if(prev&&prev.sign===lobe.sign&&lobe.start-prev.end-1<=maxGap){
                prev.end=lobe.end;prev.peak=Math.max(prev.peak,lobe.peak);
            }else merged.push({...lobe});
        }
        return merged;
    }
    function correctedVector(values,calibration) {
        const map=calibration?.map||{};
        if(!['x','y','z'].every(axis=>map[axis]&&Number.isInteger(map[axis].raw)))return values.slice(0,3);
        // Los canales nunca se permutan: X corrige X, Y corrige Y y Z corrige Z.
        return ['x','y','z'].map((axis,index)=>(map[axis].sign||1)*values[index]);
    }
    function filteredGestureSeries(samples,axis,calibration) {
        const index={x:1,y:2,z:3}[axis],rows=samples.filter(row=>Array.isArray(row)&&finite(row[0])&&finite(row[index])).sort((a,b)=>a[0]-b[0]);
        if(rows.length<20)return [];
        const factor=calibration?.map?.[axis]?.sign||1;
        const values=linearDetrend(rows.map(row=>factor*row[index]));
        const dt=median(rows.slice(1).map((row,i)=>row[0]-rows[i][0]).filter(value=>value>=5&&value<=100));
        const rate=dt?1000/dt:60;
        const lowPass=(input=>{if(input.length<4)return input.slice();const step=1/Math.max(20,rate),rc=1/(2*Math.PI*10),alpha=step/(rc+step),pass=x=>{const out=[x[0]];for(let i=1;i<x.length;i++)out.push(out[i-1]+alpha*(x[i]-out[i-1]));return out;};let out=input.slice();for(let order=0;order<2;order++)out=pass(pass(out).reverse()).reverse();return out;})(values);
        return rows.map((row,i)=>[row[0],lowPass[i]]);
    }
    function interpolateGesture(series,time) {
        let low=0,high=series.length-1;
        if(!series.length||time<series[0][0]||time>series[high][0])return null;
        while(high-low>1){const mid=(low+high)>>1;if(series[mid][0]<=time)low=mid;else high=mid;}
        const a=series[low],b=series[high];if(!b||b[0]===a[0])return a[1];
        return a[1]+(b[1]-a[1])*(time-a[0])/(b[0]-a[0]);
    }
    function correlationAt(master,participant,lag,start,end) {
        let n=0,sumA=0,sumB=0,sumAA=0,sumBB=0,sumAB=0;
        for(let t=start;t<=end;t+=1){const a=interpolateGesture(master,t),b=interpolateGesture(participant,t+lag);if(!finite(a)||!finite(b))continue;n++;sumA+=a;sumB+=b;sumAA+=a*a;sumBB+=b*b;sumAB+=a*b;}
        const top=n*sumAB-sumA*sumB,den=Math.sqrt(Math.max(0,(n*sumAA-sumA*sumA)*(n*sumBB-sumB*sumB)));
        return n>100&&den>1e-9?top/den:null;
    }
    function estimateGestureAxis(masterSamples,participantSamples,axis,masterCalibration,participantCalibration,start,end) {
        const master=filteredGestureSeries(masterSamples,axis,masterCalibration),participant=filteredGestureSeries(participantSamples,axis,participantCalibration);
        if(master.length<20||participant.length<20)return {axis,error:'muestras insuficientes'};
        let best={lag:0,correlation:-Infinity};
        for(let lag=-100;lag<=100;lag++){const correlation=correlationAt(master,participant,lag,start,end);if(finite(correlation)&&correlation>best.correlation)best={lag,correlation};}
        const values=master.map(row=>row[1]),rms=Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
        if(!finite(best.correlation)||best.correlation<.55||rms<.05)return {...best,axis,error:'gesto poco claro'};
        return {...best,axis,rms};
    }

        return Object.freeze({linearDetrend, lowPassCalibration, calibrationLobes, correctedVector, filteredGestureSeries, interpolateGesture, correlationAt, estimateGestureAxis});
    }
    const api=Object.freeze({createMath});
    if(typeof module==='object'&&module.exports) module.exports=api;
    else root.VWOMACalibrationMath=api;
})(globalThis);
