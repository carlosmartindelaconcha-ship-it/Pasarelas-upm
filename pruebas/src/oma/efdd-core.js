/* VWOMA - FDD / EFDD numerical engine.
 * Five Hann-Welch segments, 50% overlap, CPSD Hermitian eigendecomposition,
 * manually selected peaks, MAC-filtered spectral bell, IFFT and decay fit.
 * Different setups are never declared simultaneous.
 */
(function(root){
'use strict';
const S=typeof module==='object'&&module.exports?require('../signal/spectra.js'):root.VWOMASpectra;
const PI2=2*Math.PI, finite=Number.isFinite, clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const med=v=>{const a=v.slice().sort((x,y)=>x-y),k=a.length>>1;return a.length?a.length%2?a[k]:(a[k-1]+a[k])/2:NaN};
const pointFor=(r,plan)=>r.device?.point?.id?r.device.point:plan?.points?.find(p=>p.device===r.device?.id);
function detrend(x){const n=x.length,mid=(n-1)/2;let mean=0,s=0,ss=0;for(let i=0;i<n;i++){mean+=x[i];s+=(i-mid)*x[i];ss+=(i-mid)**2}mean/=n;const slope=ss?s/ss:0;for(let i=0;i<n;i++)x[i]-=mean+slope*(i-mid);return x}
function sampleRows(record,axis,window){
  const col={x:0,y:1,z:2}[axis],sign=record.device?.calibration?.map?.[axis]?.sign===-1?-1:1;
  if(!Array.isArray(record.samples)||record.samples.length>250000)throw Error('Registro sin muestras o demasiado largo.');
  const rows=[];
  for(const s of record.samples){
    const t=s?.masterTimeMs;
    if(!finite(t)||t<window.start-250||t>window.end+250)continue;
    const v=finite(s[axis])?s[axis]:Array.isArray(s.raw)?sign*s.raw[3+col]:NaN;
    if(finite(v))rows.push([t,v]);
  }
  rows.sort((a,b)=>a[0]-b[0]);
  const unique=[],dt=[];
  for(const row of rows){
    if(unique.length&&row[0]<=unique[unique.length-1][0])continue;
    if(unique.length){const delta=row[0]-unique[unique.length-1][0];if(delta>=3&&delta<=300)dt.push(delta)}
    unique.push(row);
  }
  if(unique.length<100)throw Error('Un acelerómetro tiene menos de 100 muestras válidas.');
  const period=med(dt);
  if(!finite(period)||period<=0)throw Error('No se puede determinar la frecuencia de muestreo.');
  return {rows:unique,period};
}
function prepare(input,axis,period){
  const w=input?.windowMasterMs;
  if(!w||!finite(w.start)||!finite(w.end)||w.end<=w.start||!Array.isArray(input.records)||!input.plan)
    throw Error('JSON sin ventana, plano o registros VWOMA.');
  const channels=[];
  for(const record of input.records){
    if(!record.samples?.length)continue;
    const point=pointFor(record,input.plan);
    if(!point?.id)throw Error('Falta identificar el punto de un registro.');
    const src=sampleRows(record,axis,w);
    channels.push({point:{id:String(point.id),name:String(point.name||point.id),x:Number(point.x)||0,y:Number(point.y)||0},src});
  }
  if(!channels.length)throw Error('El ensayo no tiene registros válidos.');
  if(new Set(channels.map(c=>c.point.id)).size!==channels.length)throw Error('Hay puntos duplicados dentro del mismo setup.');
  const t0=Math.max(w.start,...channels.map(c=>c.src.rows[0][0]));
  const t1=Math.min(w.end,...channels.map(c=>c.src.rows.at(-1)[0]));
  const count=Math.floor((t1-t0)/period)+1;
  if(count<250||count>160000)throw Error('La ventana conjunta debe contener entre 250 y 160000 muestras.');
  for(const c of channels){
    const x=new Float64Array(count),rows=c.src.rows;
    let i=0,missing=0;
    for(let j=0;j<count;j++){
      const t=t0+j*period;
      while(i<rows.length-2&&rows[i+1][0]<t)i++;
      const a=rows[i],b=rows[i+1];
      if(!b||t<a[0]-1||t>b[0]+1||b[0]-a[0]>Math.max(300,4*c.src.period)){missing++;continue}
      x[j]=a[1]+clamp((t-a[0])/(b[0]-a[0]),0,1)*(b[1]-a[1]);
    }
    if(missing/count>.025)throw Error('Lagunas de más del 2,5% en '+c.point.id+'.');
    c.values=detrend(x);delete c.src;
  }
  return {plan:input.plan,setup:input.setup||null,channels,seconds:(t1-t0)/1000,pointCount:channels.length};
}
/* For a Hermitian positive semidefinite matrix A, A=V diag(lambda) V^H.
 * Complex Jacobi, columns of V; eigenvalues are PSD singular values. */
function eigen(ar,ai,n,rank=Math.min(3,n)){
  const r=Float64Array.from(ar),im=Float64Array.from(ai),vr=new Float64Array(n*n),vi=new Float64Array(n*n);
  for(let i=0;i<n;i++)vr[i*n+i]=1;
  if(n===1)return {values:[Math.max(0,r[0])],vectors:[[{re:1,im:0}]]};
  for(let sweep=0;sweep<35;sweep++){
    let off=0,diag=0;
    for(let p=0;p<n;p++)diag=Math.max(diag,Math.abs(r[p*n+p]));
    for(let p=0;p<n-1;p++)for(let q=p+1;q<n;q++){
      const pq=p*n+q,mag=Math.hypot(r[pq],im[pq]);
      off=Math.max(off,mag);
      if(mag<=1e-12*Math.max(1e-25,diag))continue;
      const cos=r[pq]/mag,sin=im[pq]/mag;
      const tau=(r[q*n+q]-r[p*n+p])/(2*mag);
      const t=(tau>=0?1:-1)/(Math.abs(tau)+Math.sqrt(1+tau*tau));
      const c=1/Math.sqrt(1+t*t),s=t*c;
      for(let k=0;k<n;k++){
        if(k!==p&&k!==q){
          const kp=k*n+p,kq=k*n+q,x=r[kp],y=im[kp],u=r[kq],v=im[kq];
          const upr=u*cos+v*sin,upi=v*cos-u*sin;
          const xqr=x*cos-y*sin,xqi=x*sin+y*cos;
          const pr=c*x-s*upr,pi=c*y-s*upi,qr=s*xqr+c*u,qi=s*xqi+c*v;
          r[kp]=pr;im[kp]=pi;r[p*n+k]=pr;im[p*n+k]=-pi;
          r[kq]=qr;im[kq]=qi;r[q*n+k]=qr;im[q*n+k]=-qi;
        }
        const kp=k*n+p,kq=k*n+q,x=vr[kp],y=vi[kp],u=vr[kq],v=vi[kq];
        const upr=u*cos+v*sin,upi=v*cos-u*sin,xqr=x*cos-y*sin,xqi=x*sin+y*cos;
        vr[kp]=c*x-s*upr;vi[kp]=c*y-s*upi;
        vr[kq]=s*xqr+c*u;vi[kq]=s*xqi+c*v;
      }
      r[p*n+p]-=t*mag;r[q*n+q]+=t*mag;
      r[pq]=r[q*n+p]=im[pq]=im[q*n+p]=0;
    }
    if(off<1e-10*Math.max(1e-25,diag))break;
  }
  const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>r[b*n+b]-r[a*n+a]);
  return {values:order.slice(0,rank).map(j=>Math.max(0,r[j*n+j])),
    vectors:order.slice(0,rank).map(j=>Array.from({length:n},(_,i)=>({re:vr[i*n+j],im:vi[i*n+j]})))};
}
function mac(a,b){
  if(!a||!b||a.length!==b.length)return 0;
  let real=0,imag=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){
    real+=a[i].re*b[i].re+a[i].im*b[i].im;
    imag+=a[i].re*b[i].im-a[i].im*b[i].re;
    aa+=a[i].re*a[i].re+a[i].im*a[i].im;bb+=b[i].re*b[i].re+b[i].im*b[i].im;
  }
  return aa*bb>1e-28?clamp((real*real+imag*imag)/(aa*bb),0,1):0;
}
function crossSpectra(run,fs,nfft,fmax){
  const n=run.channels.length,N=run.channels[0].values.length;
  if(n>16)throw Error('Máximo dieciséis acelerómetros simultáneos.');
  const length=Math.min(Math.floor(N/3),8192),hop=Math.floor(length/2);
  if(length<64)throw Error('Ensayo demasiado corto para Welch.');
  const bins=Math.min(Math.floor(fmax*nfft/fs),nfft/2)+1,window=new Float64Array(length);
  let wp=0;for(let j=0;j<length;j++){const v=.5-.5*Math.cos(PI2*j/(length-1));window[j]=v;wp+=v*v}
  const re=Array.from({length:bins},()=>new Float64Array(n*n)),im=Array.from({length:bins},()=>new Float64Array(n*n));
  let segments=0;
  // Exactly five windows, 50% overlap when possible, distributed across long records.
  const maxStart=N-length;
  const starts=Array.from({length:5},(_,i)=>Math.round(i*maxStart/4));
  for(const start of [...new Set(starts)]){
    const transformed=run.channels.map(ch=>{
      const rr=new Array(nfft).fill(0),ii=new Array(nfft).fill(0);
      for(let i=0;i<length;i++)rr[i]=window[i]*ch.values[start+i];
      S.fft(rr,ii);return {rr,ii};
    });
    for(let k=0;k<bins;k++){
      for(let i=0;i<n;i++){
        const a=transformed[i].rr[k],b=transformed[i].ii[k];
        for(let j=i;j<n;j++){
          const c=transformed[j].rr[k],d=transformed[j].ii[k],index=i*n+j;
          re[k][index]+=a*c+b*d;
          im[k][index]+=b*c-a*d;
        }
      }
    }
    segments++;
  }
  for(let k=0;k<bins;k++){
    const factor=(k===0||k===nfft/2?1:2)/(segments*fs*wp);
    for(let i=0;i<n;i++)for(let j=i;j<n;j++){
      const a=i*n+j,b=j*n+i;
      re[k][a]*=factor;im[k][a]*=factor;
      re[k][b]=re[k][a];im[k][b]=i===j?0:-im[k][a];
    }
  }
  return {n,re,im,bins,segments,windowSeconds:length/fs,channels:run.channels.map(c=>c.point),setup:run.setup};
}
function compute(inputs,opts={}){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>64)throw Error('Selecciona entre 1 y 64 ensayos.');
  const axis=['x','y','z'].includes(opts.axis)?opts.axis:'z',requestedHz=clamp(Number(opts.maxHz)||30,1,60);
  const period=Math.max(...inputs.flatMap(d=>d.records?.filter(r=>r.samples?.length).map(r=>sampleRows(r,axis,d.windowMasterMs).period)||[]));
  if(!finite(period))throw Error('No hay muestras válidas para OMA.');
  const fs=1000/period,fmax=Math.min(requestedHz,.499*fs);
  if(fs<4)throw Error('Muestreo insuficiente.');
  const runs=inputs.map(d=>prepare(d,axis,period)),points=new Map();
  let geometry=null;
  for(const run of runs){
    if(geometry&&(Math.abs(run.plan.length-geometry.length)>.01||Math.abs(run.plan.width-geometry.width)>.01))
      throw Error('Dimensiones del plano distintas entre ensayos.');
    geometry=geometry||run.plan;
    for(const c of run.channels){
      const p=points.get(c.point.id);
      if(p&&Math.hypot(p.x-c.point.x,p.y-c.point.y)>.02)throw Error('Coordenadas distintas del punto '+c.point.id);
      points.set(c.point.id,c.point);
    }
  }
  if(points.size>64)throw Error('Máximo 64 puntos.');
  const requested=[1024,2048,4096,8192,16384].includes(Number(opts.nfft))?Number(opts.nfft):4096;
  const maxLength=Math.max(...runs.map(r=>Math.min(Math.floor(r.channels[0].values.length/3),8192)));
  const nfft=S.nextPowerOfTwo(Math.max(requested,maxLength));
  if(nfft>16384)throw Error('FFT superior a 16384 puntos.');
  const all=runs.map(r=>crossSpectra(r,fs,nfft,fmax)),bins=all[0].bins;
  const channels=[...points.values()].sort((a,b)=>a.x-b.x||a.y-b.y||a.id.localeCompare(b.id));
  const df=fs/nfft,freq=Array.from({length:bins},(_,k)=>k*df);
  const ref=inputs.length>1?inputs[0].setup?.masterPointId:null;
  const commonRef=!!ref&&inputs.length>1&&inputs.every((input,i)=>
    input.setup?.masterPointId===ref&&all[i].channels.some(p=>p.id===ref));
  let kind,rank,shown,entries;
  if(inputs.length===1){
    const spec=all[0];kind=spec.n===1?'single':'simultaneous';rank=Math.min(3,spec.n);shown=spec.channels;
    entries=Array.from({length:bins},(_,k)=>eigen(spec.re[k],spec.im[k],spec.n,rank));
  }else if(commonRef){
    kind='reference';rank=1;shown=channels;
    entries=Array.from({length:bins},(_,k)=>{
      let sumPower=0,total=0;
      const rr=new Float64Array(channels.length),ii=new Float64Array(channels.length),weights=new Float64Array(channels.length);
      for(const spec of all){
        const r=spec.channels.findIndex(p=>p.id===ref),p=Math.max(0,spec.re[k][r*spec.n+r]);
        sumPower+=spec.segments*p;total+=spec.segments;
        if(p<=1e-24)continue;
        for(let j=0;j<spec.n;j++){
          const idx=channels.findIndex(x=>x.id===spec.channels[j].id),offset=j*spec.n+r;
          rr[idx]+=spec.segments*spec.re[k][offset];ii[idx]+=spec.segments*spec.im[k][offset];
          weights[idx]+=spec.segments*p;
        }
      }
      const h=channels.map((c,i)=>c.id===ref?{re:1,im:0}:{
        re:weights[i]?rr[i]/weights[i]:0,im:weights[i]?ii[i]/weights[i]:0});
      const power=h.reduce((s,v)=>s+v.re*v.re+v.im*v.im,0),norm=Math.sqrt(power)||1;
      return {values:[total?sumPower/total*power:0],vectors:[h.map(v=>({re:v.re/norm,im:v.im/norm}))]};
    });
  }else{
    kind='independent';rank=1;shown=channels;
    entries=Array.from({length:bins},(_,k)=>{
      let sum=0,count=0;
      for(const spec of all)for(let j=0;j<spec.n;j++){
        sum+=spec.segments*Math.max(0,spec.re[k][j*spec.n+j]);count+=spec.segments;
      }
      return {values:[count?sum/count:0],vectors:[]};
    });
  }
  const warnings=[];
  if(kind==='single')warnings.push('Un solo punto: frecuencias y amortiguamiento orientativo, sin forma modal espacial.');
  if(kind==='independent')warnings.push('Medidas no simultáneas sin referencia común: solo PSD media. No se estiman fases ni formas modales.');
  if(kind==='reference')warnings.push('Setups con referencia fija: combinación aproximada S_iM/S_MM, no SVD de una matriz simultánea global.');
  if(fmax<requestedHz-.01)warnings.push('El rango se ha limitado a '+fmax.toFixed(2)+' Hz por Nyquist.');
  return {kind,axis,fs,fmax,nfft,df,frequency:freq,channels:shown,rank,data:entries,warnings,
    planLength:Number(geometry.length),planWidth:Number(geometry.width),
    segments:all.map(s=>s.segments),windowSeconds:all.map(s=>s.windowSeconds),sourceCount:inputs.length,
    reference:commonRef?ref:null};
}
function closestPeak(result,hz,branch=0){
  const k0=clamp(Math.round(hz/result.df),1,result.data.length-2),radius=Math.max(2,Math.round(.25/result.df));
  let best=k0,top=-Infinity;
  for(let k=Math.max(1,k0-radius);k<=Math.min(result.data.length-2,k0+radius);k++){
    const a=result.data[k].values[branch]||0;
    if(a>=result.data[k-1].values[branch]&&a>=result.data[k+1].values[branch]&&a>top){top=a;best=k}
  }
  return best;
}
function spectralBell(result,k0,branch,opts={}){
  const peak=result.data[k0]?.values[branch],vector=result.data[k0]?.vectors?.[branch]||null;
  if(!(peak>0))throw Error('El pico no tiene energía.');
  const threshold=clamp(Number(opts.macThreshold)||.8,.4,.99),minLevel=clamp(Number(opts.levelThreshold)||.01,.0001,.3);
  const min=opts.bandMin===''||opts.bandMin==null?null:Number(opts.bandMin);
  const max=opts.bandMax===''||opts.bandMax==null?null:Number(opts.bandMax);
  if(min!==null&&!finite(min)||max!==null&&!finite(max)||min!==null&&max!==null&&min>=max)
    throw Error('Banda manual incorrecta.');
  const indices=new Map([[k0,{power:peak,mac:1,branch}]]);
  for(const dir of [-1,1]){
    let previous=peak,rising=0;
    for(let k=k0+dir;k>=1&&k<result.data.length;k+=dir){
      if(Math.abs(result.frequency[k]-result.frequency[k0])>Math.max(.8,result.frequency[k0]*.45))break;
      if(min!==null&&result.frequency[k]<min||max!==null&&result.frequency[k]>max)break;
      let candidate={power:result.data[k].values[0]||0,mac:1,branch:0};
      if(vector){
        candidate={power:0,mac:0,branch:0};
        for(let j=0;j<(result.data[k].vectors?.length||0);j++){
          const m=mac(vector,result.data[k].vectors[j]);
          if(m>candidate.mac)candidate={power:result.data[k].values[j]||0,mac:m,branch:j};
        }
        if(candidate.mac<threshold)break;
      }
      if(candidate.power<peak*minLevel)break;
      if(rising>1&&candidate.power>previous*1.35&&candidate.power>peak*.05)break;
      rising=candidate.power>=previous?rising+1:0;previous=candidate.power;
      indices.set(k,candidate);
    }
  }
  const ks=[...indices.keys()].sort((a,b)=>a-b),a=new Array(result.nfft).fill(0),b=new Array(result.nfft).fill(0);
  for(const [k,c] of indices){a[k]=c.power;if(k>0&&k<result.nfft/2)a[result.nfft-k]=c.power}
  S.fft(a,b); // symmetric real spectrum: forward FFT = real IFFT up to scale
  return {peak,vector,low:ks[0],high:ks.at(-1),correlation:a.map(v=>v/result.nfft),indices,
    macThreshold:threshold,levelThreshold:minLevel};
}
function damping(correlation,fs,hz){
  const r0=correlation[0];
  if(!(r0>0))return {warning:'Autocorrelación no válida.',peaks:[]};
  const period=fs/hz,step=Math.max(2,Math.floor(.7*period));
  const limit=Math.min(Math.floor(correlation.length/4),Math.floor(fs*Math.min(25,22/hz)));
  const peaks=[];let previous=-step;
  for(let i=Math.max(2,Math.floor(.65*period));i<limit-1;i++){
    if(correlation[i]>correlation[i-1]&&correlation[i]>=correlation[i+1]&&
      correlation[i]>r0*.012&&i-previous>=step){
      peaks.push({t:i/fs,a:correlation[i]/r0});previous=i;
      if(peaks.length>=16)break;
    }
  }
  if(peaks.length<4)return {warning:'Faltan máximos periódicos para ajustar el amortiguamiento.',peaks};
  const series=peaks.slice(0,12),mt=series.reduce((s,p)=>s+p.t,0)/series.length,
    my=series.reduce((s,p)=>s+Math.log(p.a),0)/series.length;
  let tt=0,ty=0,yy=0;
  for(const p of series){const x=p.t-mt,y=Math.log(p.a)-my;tt+=x*x;ty+=x*y;yy+=y*y}
  const slope=tt?ty/tt:0,alpha=-slope,r2=tt&&yy?ty*ty/(tt*yy):0;
  const fd=1/med(series.slice(1).map((p,i)=>p.t-series[i].t));
  const zeta=alpha/Math.sqrt(alpha*alpha+(PI2*fd)**2);
  const warning=alpha<=0||!finite(zeta)||r2<.65||zeta>.3?
    'Ajuste de envolvente no fiable (R² bajo, crecimiento o amortiguamiento elevado).':null;
  return {peaks:series,alpha,fd,fn:fd/Math.sqrt(Math.max(1e-8,1-zeta*zeta)),
    zeta,r2,intercept:my-slope*mt,warning};
}
function shape(result,vector){
  if(!vector||vector.length<2||result.kind==='single'||result.kind==='independent')return null;
  let index=result.reference?result.channels.findIndex(p=>p.id===result.reference):-1;
  if(index<0){index=0;for(let i=1;i<vector.length;i++)
    if(Math.hypot(vector[i].re,vector[i].im)>Math.hypot(vector[index].re,vector[index].im))index=i}
  const angle=Math.atan2(vector[index].im,vector[index].re),c=Math.cos(angle),s=-Math.sin(angle);
  const rotated=vector.map(v=>({re:v.re*c-v.im*s,im:v.re*s+v.im*c}));
  const max=Math.max(...rotated.map(v=>Math.hypot(v.re,v.im)))||1;
  const imag=rotated.reduce((sum,v)=>sum+v.im*v.im,0),tot=rotated.reduce((sum,v)=>sum+v.re*v.re+v.im*v.im,0)||1;
  return {points:result.channels.map((p,i)=>({...p,re:rotated[i].re/max,im:rotated[i].im/max,
    amplitude:Math.hypot(rotated[i].re,rotated[i].im)/max})),realness:clamp(1-imag/tot,0,1)};
}
function estimate(result,hz,branch=0,opts={}){
  if(!result||!finite(hz)||hz<=0||hz>result.fmax||!Number.isInteger(branch)||branch<0||branch>=result.rank)
    throw Error('Elige un pico y una rama singular válidos.');
  const k=closestPeak(result,hz,branch),bell=spectralBell(result,k,branch,opts),
    f=result.frequency[k],fit=damping(bell.correlation,result.fs,f),mode=shape(result,bell.vector);
  const r0=bell.correlation[0]||1,count=Math.min(Math.floor(result.nfft/5),800);
  const correlation=Array.from({length:count},(_,i)=>{
    const t=i/result.fs;return {t,r:bell.correlation[i]/r0,envelope:fit.warning?null:Math.exp(fit.intercept-fit.alpha*t)};
  });
  const warnings=[];
  if(fit.warning)warnings.push(fit.warning);
  if(bell.high-bell.low<4)warnings.push('Campana espectral muy estrecha: amortiguamiento sensible a la resolución.');
  if(mode&&mode.realness<.8)warnings.push('Forma compleja con componente imaginaria significativa: revisa sincronización y separación modal.');
  return {frequencyHz:f,branch:branch+1,bandHz:[result.frequency[bell.low],result.frequency[bell.high]],
    peakPsd:bell.peak,dampingPct:fit.warning?null:100*fit.zeta,
    dampedFrequencyHz:fit.warning?null:fit.fd,naturalFrequencyHz:fit.warning?null:fit.fn,
    r2:fit.r2??null,peakCount:fit.peaks.length,peaks:fit.peaks,correlation,
    shape:mode,type:result.kind,warnings};
}
const api=Object.freeze({compute,estimate,eigen,mac,closestPeak,spectralBell,damping,shape,prepare});
if(typeof module==='object'&&module.exports)module.exports=api;else root.VWOMAEFDD=api;
})(globalThis);