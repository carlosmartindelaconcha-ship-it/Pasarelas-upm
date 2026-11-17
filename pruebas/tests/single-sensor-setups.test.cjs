'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Planner = require('../src/joint/setup-planner.js');
const {createAcquisition} = require('../src/joint/acquisition.js');

const makePlan = () => ({
  length: 30, width: 3,
  points: [
    {id:'P4',x:20,y:1.5,axis:'z',kind:'sensor',device:null},
    {id:'P1',x:5,y:1.5,axis:'z',kind:'sensor',device:null},
    {id:'P3',x:15,y:1.5,axis:'z',kind:'sensor',device:null},
    {id:'P2',x:10,y:1.5,axis:'z',kind:'sensor',device:null},
    {id:'A1',x:0,y:1.5,kind:'support',device:null}
  ]
});
const ids = setups => setups.map(x => x.assignments.map(a => a.pointId));

test('sin participantes, genera un setup por punto de sensor y sin referencia fija', () => {
  const plan = Planner.generate(makePlan(), 'host', []);
  assert.equal(plan.singleSensor,true);
  assert.equal(plan.masterPointId,null);
  assert.deepEqual(ids(plan.setups),[['P1'],['P2'],['P3'],['P4']]);
  assert.ok(plan.setups.every(x=>x.assignments.length===1 && x.assignments[0].deviceId==='host'));
  assert.ok(plan.setups.every(x=>x.measuredRunId===null && x.completedRunId===null));
});

test('también funciona con un solo punto y un solo móvil', () => {
  const plan=makePlan();
  plan.points=plan.points.filter(p=>p.id==='P3');
  const output=Planner.generate(plan,'host',[]);
  assert.deepEqual(ids(output.setups),[['P3']]);
});

test('al conectar participantes se conserva la referencia fija y el reparto multipunto', () => {
  const plan=Planner.generate(makePlan(),'host',['android'],'P2');
  assert.ok(!plan.singleSensor);
  assert.equal(plan.masterPointId,'P2');
  assert.equal(plan.setups.length,3);
  assert.ok(plan.setups.every(x=>x.assignments.length===2 &&
    x.assignments[0].deviceId==='host' && x.assignments[0].pointId==='P2' &&
    x.assignments[1].deviceId==='android'));
  assert.deepEqual(new Set(plan.setups.map(x=>x.assignments[1].pointId)),new Set(['P1','P3','P4']));
  assert.throws(()=>Planner.generate(makePlan(),'host',['host']),/válida/);
});

function fixture() {
  const s={
    id:'host', name:'Maestro', role:'host', session:'sesion-1',
    peers:new Map(), plan:makePlan(), calibration:{complete:true},
    syncCalibration:{accepted:false,peerIds:[],correctionMs:0},
    syncModel:{offset:0,drift:0,reference:0,count:0,rtt:0},
    setupPlan:null,setupMasterChoice:'P2',setupMode:'auto',run:null,
    transaction:null,setupMarkupCache:null,results:new Map(),recent:[]
  };
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,{
      id,innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,
      setAttribute() {}, getAttribute(){return null;}
    });
    return elements.get(id);
  };
  const controller=Planner.createController({
    s,$,escape:String,requireHostEdit:()=>{},running:()=>false,
    savePlan:()=>{},tell:()=>{},tab:()=>{},renderDevices:()=>{}
  });
  return {s,$,controller};
}

test('el modo individual habilita propuestas y activación sin sincronización entre móviles',()=>{
  const {s,$,controller}=fixture();
  controller.renderSetups();
  assert.equal($('jointGenerateSetups').disabled,false);
  assert.equal($('jointSetupMasterField').hidden,true);
  assert.equal($('jointSetupModeManual').disabled,true);
  controller.generateSetups();
  assert.equal(controller.currentValid(),true);
  assert.equal(controller.syncReady(),true);
  controller.applySetup(0);
  assert.equal(s.plan.points.find(p=>p.device==='host')?.id,'P1');
  assert.equal(controller.currentValid(),true);
  assert.equal($('jointApplySetup').disabled,false);
});

test('el registro individual se puede confirmar y luego desplazar el sensor al siguiente punto',async()=>{
  const {s,controller}=fixture();
  controller.generateSetups();
  controller.applySetup(0);
  const msgs=[];
  let clock=100000;
  const acquisition=createAcquisition({
    s,MAX_SAMPLES:5000,now:()=>clock,running:()=>false,incident:()=>{},
    toMaster:(t)=>t,syncOnce:()=>{},navigator:{},
    setInterval:()=>1,clearInterval:()=>{},
    requireHostEdit:()=>{},localStatus:()=>({sensor:true}),
    pageHidden:()=>false,readDuration:()=>5,
    pointFor:(id=s.id)=>s.plan.points.find(p=>p.device===id),
    tell:m=>msgs.push(m),pause:async()=>{},finite:Number.isFinite,
    uid:()=> 'run-individual-1',broadcast:()=>{},send:()=>{},
    correctedVector:v=>v,persist:()=>{},persistBeforeClosing:async()=>{},
    sendRecord:async()=>{},localRecord:()=>({id:s.run.id,samples:[...s.run.samples]}),
    structuredClone,ui:{
      enterRecording:()=>{},runArmed:()=>{},refresh:()=>{},
      preparing:()=>{},preparationInterrupted:()=>{},
      exitRecording:()=>{},closing:()=>{},finished:()=>{}
    },
    setupValid:()=>controller.currentValid()
  });
  await acquisition.startRun();
  assert.equal(s.run.setup.singleSensor,true);
  assert.equal(s.run.setup.index,1);
  assert.equal(s.run.device.point.id,'P1');
  assert.deepEqual([...new Set(s.run.plan.points.filter(p=>p.device).map(p=>p.device))],['host']);
  assert.equal(s.run.synchronizationCalibration.phase,'not-required');
  await acquisition.finishRun();
  controller.markMeasured();
  controller.confirmMeasured();
  assert.equal(s.setupPlan.setups[0].completedRunId,'run-individual-1');
  assert.equal(s.setupPlan.selectedIndex,1);
  s.run=null; s.setupPlan.activeIndex=null;
  controller.applySetup(1);
  assert.equal(s.plan.points.find(p=>p.device==='host')?.id,'P2');
  assert.equal(s.plan.points.find(p=>p.id==='P1').device,null);
  assert.equal(controller.currentValid(),true);
});

test('la página de pruebas contiene el campo ocultable y versiones actualizadas',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  assert.match(html,/id="jointSetupMasterField"/);
  assert.match(html,/src\/joint\/setup-planner\.js\?v=20261117-single-sensor-v1/);
  assert.match(html,/src\/joint\/acquisition\.js\?v=20261117-single-sensor-v1/);
});