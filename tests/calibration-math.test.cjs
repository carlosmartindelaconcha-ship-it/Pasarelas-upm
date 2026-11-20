'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createMath}=require('../src/joint/calibration-math.js');
const finite=Number.isFinite;
const median=v=>{const a=v.filter(finite).sort((x,y)=>x-y),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;};
const math=createMath({finite,median,sampleRate:()=>60});
const near=(a,b,tol=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,'Esperado '+b+', obtenido '+a);
const wave=t=>2.2*Math.exp(-(((t-190)/58)**2))-2.7*Math.exp(-(((t-365)/65)**2))+1.8*Math.exp(-(((t-560)/75)**2));

test('detrend elimina constante y pendiente sin alterar entrada',()=>{
  const values=Array.from({length:85},(_,i)=>7+0.013*i);
  for(const v of math.linearDetrend(values))near(v,0,1e-9);
  assert.equal(values[0],7);
  assert.deepEqual(math.linearDetrend([4,5]),[4,5]);
});

test('paso bajo sin desfase mantiene constante y suaviza impulso',()=>{
  for(const v of math.lowPassCalibration(Array(91).fill(3.5)))near(v,3.5,1e-9);
  const impulse=Array(101).fill(0);impulse[50]=1;
  const out=math.lowPassCalibration(impulse);
  assert.ok(Math.abs(out.indexOf(Math.max(...out))-50)<=1);
  assert.ok(Math.max(...out)<1);
  assert.equal(math.lowPassCalibration([1,2,3]).length,3);
});

test('secuencia de lóbulos + - + y canales corregidos sin permutación',()=>{
  assert.deepEqual(math.calibrationLobes([0,1,1,0,0,-1,-1,0,0,1,1,0],.5,60).map(x=>x.sign),[1,-1,1]);
  const c={map:{x:{raw:0,sign:-1},y:{raw:1,sign:1},z:{raw:2,sign:-1}}};
  assert.deepEqual(math.correctedVector([1,2,3],c),[-1,2,-3]);
  assert.deepEqual(math.correctedVector([1,2,3],{map:{x:{raw:0,sign:1}}}),[1,2,3]);
});

test('interpolación temporal sin extrapolación',()=>{
  const series=[[10,3],[35,8],[95,-4]];
  near(math.interpolateGesture(series,22.5),5.5);
  near(math.interpolateGesture(series,65),2);
  assert.equal(math.interpolateGesture(series,5),null);
  assert.equal(math.interpolateGesture(series,96),null);
});

test('filtro de gestos respeta el signo configurado en el eje',()=>{
  const samples=Array.from({length:50},(_,i)=>{const t=100+i*20,v=wave(t);return[t,v,.5*v,-.25*v]});
  const pos=math.filteredGestureSeries(samples,'x',{map:{x:{raw:0,sign:1}}});
  const neg=math.filteredGestureSeries(samples,'x',{map:{x:{raw:0,sign:-1}}});
  assert.equal(pos.length,50);
  near(pos[25][1],-neg[25][1],1e-9);
  assert.deepEqual(math.filteredGestureSeries(samples.slice(0,10),'x',null),[]);
});

test('correlación e identificación de retraso del participante de 18 ms',()=>{
  const master=Array.from({length:80},(_,i)=>{const t=i*12,v=wave(t);return[t,v,.9*v,.8*v]});
  const guest=Array.from({length:80},(_,i)=>{const t=i*12,v=wave(t-18);return[t,v,.9*v,.8*v]});
  const correlation=math.correlationAt(master.map(x=>x.slice(0,2)),guest.map(x=>x.slice(0,2)),18,110,720);
  assert.ok(correlation>.99,'r='+correlation);
  const result=math.estimateGestureAxis(master,guest,'x',null,null,110,720);
  assert.equal(result.error,undefined,String(result.error||''));
  assert.ok(Math.abs(result.lag-18)<=6,'lag='+result.lag);
  assert.ok(result.correlation>.9);
  assert.ok(result.rms>.05);
});

test('datos insuficientes y gesto plano no dan falsa sincronización',()=>{
  assert.equal(math.estimateGestureAxis([],[],'z',null,null,0,300).error,'muestras insuficientes');
  const rows=Array.from({length:30},(_,i)=>[i*20,0,0,0]);
  assert.equal(math.estimateGestureAxis(rows,rows,'x',null,null,0,400).error,'gesto poco claro');
});

test('funciona como script clásico para Safari/Chrome',()=>{
  const browser={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/joint/calibration-math.js'),'utf8'),browser);
  const m=browser.VWOMACalibrationMath.createMath({finite,median,sampleRate:()=>60});
  assert.equal(typeof m.estimateGestureAxis,'function');
  near(m.interpolateGesture([[0,0],[50,25]],20),10);
});
