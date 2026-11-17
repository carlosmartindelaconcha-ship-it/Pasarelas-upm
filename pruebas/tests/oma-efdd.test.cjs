'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const EFDD=require('../src/oma/efdd-core.js');
const S=require('../src/signal/spectra.js');

test('descomposición hermítica compleja preserva los signos y fase modal',()=>{
  const v=[{re:0.6,im:0},{re:.4,im:.5},{re:-.3,im:.1}];
  const ar=[],ai=[];
  for(let i=0;i<v.length;i++)for(let j=0;j<v.length;j++){
    ar.push(v[i].re*v[j].re+v[i].im*v[j].im);
    ai.push(v[i].im*v[j].re-v[i].re*v[j].im);
  }
  const result=EFDD.eigen(ar,ai,v.length,3);
  assert.ok(result.values[0]>.6);
  assert.ok(result.values[1]<1e-8);
  assert.ok(EFDD.mac(v,result.vectors[0])>.999999);
});

function scenario(){
  const fs=60,n=4800,dt=1000/fs;
  const plan={length:30,width:3,points:[
    {id:'P1',name:'P1',x:3,y:1,axis:'z'},
    {id:'P2',name:'P2',x:12,y:1,axis:'z'},
    {id:'P3',name:'P3',x:23,y:1,axis:'z'}
  ]};
  let seed=77459;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32-.5;};
  function oscillator(f,z){
    const r=Math.exp(-2*Math.PI*f*z/fs),a=2*r*Math.cos(2*Math.PI*f/fs),b=-r*r;
    const values=[],state=[0,0];
    for(let i=0;i<n;i++){
      const next=a*state[0]+b*state[1]+random()*.3;
      values.push(next);state[1]=state[0];state[0]=next;
    }
    return values;
  }
  const modes=[oscillator(2.38,.022),oscillator(5.31,.03)];
  const record=(id,point,weights,processed=false)=>({
    device:{id,role:id==='host'?'host':'guest',name:id,point,
      calibration:{map:{z:{raw:2,sign:1}}}},
    samples:Array.from({length:n},(_,i)=>{
      const t=i*dt,z=weights[0]*modes[0][i]+weights[1]*modes[1][i];
      return processed?{masterTimeMs:t,z}:{
        masterTimeMs:t,raw:[i,t,t,0,0,z,dt,t,t]
      };
    })
  });
  const a=record('host',plan.points[0],[1,.2]),b=record('B',plan.points[1],[-.6,1]),
    c=record('C',plan.points[2],[.8,-.4]),processed=record('host',plan.points[0],[1,.2],true);
  const make=(records,reference=null)=>({
    schema:'pasarelas-upm-joint-export-v1',session:'sample-test',plan,
    setup:{index:1,masterPointId:reference},
    windowMasterMs:{start:0,end:(n-1)*dt},records
  });
  return {make,a,b,c,processed};
}
test('FDD simultáneo identifica frecuencias y forma modal (incluido signo relativo)',()=>{
  const x=scenario();
  const fdd=EFDD.compute([x.make([x.a,x.b,x.c])],{axis:'z',nfft:4096,maxHz:9});
  assert.equal(fdd.kind,'simultaneous');
  assert.equal(fdd.rank,3);
  assert.equal(fdd.segments[0],5);
  assert.ok(fdd.df>0);
  const first=EFDD.estimate(fdd,2.38,0,{macThreshold:.8});
  assert.ok(Math.abs(first.frequencyHz-2.38)<.1);
  assert.ok(first.shape.realness>.9);
  assert.equal(first.shape.points.length,3);
  assert.ok(first.shape.points[0].re>0);
  assert.ok(first.shape.points[1].re<0);
  assert.ok(first.shape.points[2].re>0);
  assert.ok(first.dampingPct>0&&first.dampingPct<8);
  assert.ok(first.r2>.65);
  const second=EFDD.estimate(fdd,5.31,0,{macThreshold:.8});
  assert.ok(Math.abs(second.frequencyHz-5.31)<.15);
  assert.ok(second.bandHz[1]>second.bandHz[0]);
});
test('EFDD con referencia fija une varios setups mediante relaciones espectrales',()=>{
  const x=scenario();
  const fdd=EFDD.compute([x.make([x.a,x.b],'P1'),x.make([x.a,x.c],'P1')],{
    axis:'z',maxHz:8
  });
  assert.equal(fdd.kind,'reference');assert.equal(fdd.reference,'P1');
  const result=EFDD.estimate(fdd,2.38,0);
  assert.equal(result.shape.points.length,3);
  assert.ok(result.shape.points[1].re<0);
  assert.ok(result.shape.points[2].re>0);
  assert.match(fdd.warnings.join(' '),/aproximada/);
});
test('un acelerómetro itinerante nunca presenta formas espaciales sin referencia',()=>{
  const x=scenario();
  const fdd=EFDD.compute([x.make([x.a]),x.make([x.b]),x.make([x.c])],{axis:'z',maxHz:8});
  assert.equal(fdd.kind,'independent');
  const modal=EFDD.estimate(fdd,2.38,0);
  assert.equal(modal.shape,null);
  assert.match(fdd.warnings.join(' '),/No se estiman fases ni formas modales/);
  const solo=EFDD.compute([x.make([x.a])],{axis:'z',maxHz:8});
  assert.equal(solo.kind,'single');
  assert.equal(EFDD.estimate(solo,2.38,0).shape,null);
});
test('se aceptan archivos JSON procesados además de registros brutos',()=>{
  const x=scenario(),fdd=EFDD.compute([x.make([x.processed])],{axis:'z',maxHz:9});
  assert.equal(fdd.kind,'single');
  assert.ok(Math.abs(EFDD.estimate(fdd,2.38,0).frequencyHz-2.38)<.12);
});
test('los argumentos físicos inválidos y archivos incoherentes se rechazan',()=>{
  const x=scenario();
  assert.throws(()=>EFDD.compute([]),/Selecciona/);
  assert.throws(()=>EFDD.compute([x.make([x.a,x.a])]),/duplicados/);
  const fdd=EFDD.compute([x.make([x.a,x.b])],{axis:'z'});
  assert.throws(()=>EFDD.estimate(fdd,0,0),/Elige un pico/);
  assert.throws(()=>EFDD.estimate(fdd,2.3,0,{bandMin:5,bandMax:1}),/Banda manual/);
});
test('la nueva pestaña está integrada antes del coordinador y dispone de todas las acciones',()=>{
  const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const nav=fs.readFileSync(path.join(root,'src/joint/tab-navigation.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/joint/joint-app.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/joint/ui-events.js'),'utf8');
  for(const id of ['jointTabOMA','jointPanelOMA','jointOmaFiles','jointOmaSingular',
    'jointOmaAddPeak','jointOmaModeDetail','jointOmaDecay','jointOmaShape',
    'jointOmaLoadCampaign','jointOmaExportJSON','jointOmaExportCSV'])
    assert.match(html,new RegExp('id="'+id+'"'));
  const coreIndex=html.indexOf('src/oma/efdd-core.js?'),
    uiIndex=html.indexOf('src/oma/efdd-ui.js?'),appIndex=html.indexOf('src/joint/joint-app.js?');
  assert.ok(coreIndex>0&&coreIndex<uiIndex&&uiIndex<appIndex);
  assert.match(nav,/'OMA'/);
  assert.match(ui,/bindOmaEvents\(guard\)/);
  assert.match(app,/VWOMAEFDDUI\.createController/);
});
