/* VWOMA — deterministic synthetic pedestrian-bridge OMA demonstration.
 * 50 x 10.5 m, seven positions per side, 14 simultaneous accelerometers.
 * 3 minutes / 60 Hz = 10 800 samples per device. Four independent
 * white-noise-driven resonators + independent, broadband white measurement
 * noise at EVERY sensor (iid Gaussian; expected flat noise PSD to Nyquist).
 * These are generated signals, not physical measurements.
 */
(function registerOmaDemo(root){
'use strict';
const length=50,width=10.5,fs=60,duration=180,count=fs*duration,dt=1000/fs;
const modes=Object.freeze([
  {id:'B1',name:'Flexión 1',frequencyHz:2,dampingRatio:.020,amplitude:.50,harmonic:1,type:'bending'},
  {id:'T1',name:'Torsión 1',frequencyHz:5,dampingRatio:.025,amplitude:.44,harmonic:1,type:'torsion'},
  {id:'B2',name:'Flexión 2',frequencyHz:8,dampingRatio:.018,amplitude:.39,harmonic:2,type:'bending'},
  {id:'B3',name:'Flexión 3',frequencyHz:18,dampingRatio:.015,amplitude:.38,harmonic:3,type:'bending'}
]);
const whiteNoiseStd=0.07; // m/s² RMS, flat expected PSD, independent across sensors
function seededNormal(seed){
  let x=(seed>>>0)||1,spare=null;
  const uniform=()=>{
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return ((x>>>0)+.5)/4294967296;
  };
  return ()=>{
    if(spare!==null){const v=spare;spare=null;return v;}
    const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();
    spare=r*Math.sin(theta);
    return r*Math.cos(theta);
  };
}
function modalShape(mode,point){
  const bend=Math.sin(mode.harmonic*Math.PI*point.x/length);
  if(mode.type==='torsion')
    return bend*(point.y<width/2?-1:1);
  return bend;
}
function bridgePoints(){
  const points=[];
  for(let side=0;side<2;side++)for(let j=1;j<=7;j++){
    const id=(side===0?'I':'D')+j;
    points.push({id,name:(side===0?'Izq. ':'Dcha. ')+j,
      x:Number((j*length/8).toFixed(3)),y:side===0?0:width,axis:'z',angle:0,kind:'sensor',
      device:'demo-'+id});
  }
  return points;
}
function filteredExcitation(mode,seed){
  const noise=seededNormal(seed);
  const burnIn=fs*12;
  const omega=2*Math.PI*mode.frequencyHz/fs;
  const r=Math.exp(-2*Math.PI*mode.frequencyHz*mode.dampingRatio/fs);
  const a=2*r*Math.cos(omega),b=-(r*r);
  let previous=0,previous2=0;
  const values=new Float64Array(count);
  for(let i=-burnIn;i<count;i++){
    const value=a*previous+b*previous2+noise();
    previous2=previous;previous=value;
    if(i>=0)values[i]=value;
  }
  let sum=0,sumSq=0;
  for(const v of values){sum+=v;sumSq+=v*v;}
  const mean=sum/count,rms=Math.sqrt(Math.max(1e-15,sumSq/count-mean*mean));
  for(let i=0;i<count;i++)values[i]=mode.amplitude*(values[i]-mean)/rms;
  return values;
}
function generate(seed=20261117){
  if(!Number.isSafeInteger(seed))throw Error('La semilla debe ser un entero.');
  const points=bridgePoints();
  const q=modes.map((mode,i)=>filteredExcitation(mode,seed+137*i+1));
  const records=points.map((point,index)=>{
    const weights=modes.map(mode=>modalShape(mode,point));
    const noise=seededNormal(seed+30001+29*index);
    const samples=Array.from({length:count},(_,i)=>{
      let z=whiteNoiseStd*noise();
      for(let j=0;j<modes.length;j++)z+=weights[j]*q[j][i];
      return {masterTimeMs:i*dt,z};
    });
    return {device:{id:'demo-'+point.id,name:'Acelerómetro '+point.id,role:index===0?'host':'guest',
      point:{id:point.id,name:point.name,x:point.x,y:point.y,axis:'z',angle:0},
      calibration:{map:{x:{raw:0,sign:1},y:{raw:1,sign:1},z:{raw:2,sign:1}}}},
      samples};
  });
  const truth=modes.map(mode=>({
    id:mode.id,name:mode.name,type:mode.type,frequencyHz:mode.frequencyHz,
    dampingPct:100*mode.dampingRatio,
    signedShape:points.map(point=>({id:point.id,x:point.x,y:point.y,
      value:modalShape(mode,point)}))
  }));
  return {
    schema:'pasarelas-upm-joint-processed-v1',
    source:'DEMO sintética determinista: cuatro modos y ruido blanco aditivo independiente',
    session:'vwoma-demo-14-sensors-'+seed,
    simulated:true,
    seed,commonPeriodMs:dt,commonRateHz:fs,
    plan:{name:'Pasarela sintética · FDD/EFDD',length,width,points},
    windowMasterMs:{start:0,end:(count-1)*dt},
    setup:{index:1,masterPointId:null,singleSensor:false,simultaneous:true},
    records,
    simulation:{durationSeconds:duration,sampleRateHz:fs,samplesPerSensor:count,
      sensors:points.length,whiteNoiseStdMps2:whiteNoiseStd,
      description:'Ruido blanco gaussiano independiente añadido a cada canal (PSD esperada plana 0–30 Hz) y excitación blanca independiente filtrada por cada oscilador modal.',
      modes:truth}
  };
}
const api=Object.freeze({generate,bridgePoints,modalShape,modes,whiteNoiseStd,seededNormal,
  sampleRateHz:fs,durationSeconds:duration,samplesPerSensor:count});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VWOMAOmaDemo=api;
})(globalThis);
