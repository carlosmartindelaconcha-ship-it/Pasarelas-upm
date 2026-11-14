'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Planner=require('../src/joint/setup-planner.js');
const Symbols=require('../src/joint/setup-symbols.js');
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function setupFixture(){
  const points=['P1','P2','P3','P4'].map((id,i)=>({
    id,x:5*(i+1),y:1.5,axis:'z',angle:0,kind:'sensor',device:null
  }));
  const s={id:'host',name:'Maestro',role:'host',peers:new Map([
    ['guest',{id:'guest',name:'Esclavo 1',channel:{readyState:'open'},status:{sensor:true,calibrated:true,visible:true}}],
    ['reserve',{id:'reserve',name:'Esclavo 2',channel:{readyState:'open'},status:{sensor:true,calibrated:true,visible:true}}]
  ]),plan:{length:30,width:3,points},setupPlan:null,setupMode:'manual',
  setupMasterChoice:'P2',manualGuestPoints:{guest:'P3'},
  syncCalibration:{accepted:false,peerIds:[]},calibration:{complete:false},
  run:null,transaction:null,setupMarkupCache:null,results:new Map()};
  const nodes=new Map(),$=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,innerHTML:'',textContent:'',value:'',disabled:false,hidden:false,title:'',
      setAttribute(){},getAttribute(){return null;}
    });
    return nodes.get(id);
  };
  const messages=[];
  const controller=Planner.createController({
    s,$,escape,requireHostEdit:()=>{},running:()=>false,
    savePlan:()=>{},tell:message=>messages.push(message),
    tab:()=>{},renderDevices:()=>{},confirmChange:()=>true
  });
  const selectors={manual:[
    {value:'P3',getAttribute:()=> 'guest'}
  ],edit:[
    {value:'P4',getAttribute:()=> 'guest'}
  ]};
  return {s,$,controller,messages,selectors};
}
test('se puede crear un setup manual antes de completar la calibración',()=>{
  const {s,$,controller,selectors}=setupFixture(),previous=globalThis.document;
  globalThis.document={querySelectorAll:query=>query==='[data-manual-device]'?selectors.manual:selectors.edit};
  try{
    controller.renderSetups();
    assert.equal($('jointSetupCreateManual').disabled,false);
    controller.createManualSetup();
    assert.equal(s.setupPlan.mode,'manual');
    assert.equal(s.setupPlan.setups.length,1);
    assert.deepEqual(s.setupPlan.setups[0].assignments,[
      {deviceId:'host',pointId:'P2'},{deviceId:'guest',pointId:'P3'}
    ]);
    assert.equal(controller.currentValid(),true);
    assert.equal($('jointSetupPreview').innerHTML.includes('joint-setup-phone'),true);
  }finally{globalThis.document=previous;}
});
test('se puede editar una propuesta y se impiden móviles coincidentes',()=>{
  const {s,controller,selectors}=setupFixture(),previous=globalThis.document;
  globalThis.document={querySelectorAll:query=>query==='[data-manual-device]'?selectors.manual:selectors.edit};
  try{
    s.setupMode='auto';
    controller.generateSetups();
    controller.selectSetup(0);
    controller.editSelectedSetup();
    assert.deepEqual(s.setupPlan.setups[0].assignments,[
      {deviceId:'host',pointId:'P2'},{deviceId:'guest',pointId:'P4'}
    ]);
    assert.equal(controller.currentValid(),true);
    selectors.edit=[{value:'P4',getAttribute:()=> 'guest'},{value:'P4',getAttribute:()=> 'reserve'}];
    assert.throws(()=>controller.editSelectedSetup(),/Cada móvil debe ocupar un punto diferente/);
  }finally{globalThis.document=previous;}
});
test('la medida exige sincronización, sin impedir la planificación anticipada',()=>{
  const {s,controller,selectors}=setupFixture(),previous=globalThis.document;
  globalThis.document={querySelectorAll:query=>query==='[data-manual-device]'?selectors.manual:selectors.edit};
  try{
    controller.createManualSetup();
    assert.throws(()=>controller.applySetup(),/desactualizados/);
    s.calibration.complete=true;
    s.syncCalibration.accepted=true;
    s.syncCalibration.peerIds=['guest','reserve'];
    controller.applySetup();
    assert.equal(s.setupPlan.activeIndex,0);
    assert.equal(s.plan.points.find(p=>p.id==='P2').device,'host');
    assert.equal(s.plan.points.find(p=>p.id==='P3').device,'guest');
    assert.equal(controller.currentValid(),true);
    assert.equal(s.plan.points.find(p=>p.id==='P4').device,null);
  }finally{globalThis.document=previous;}
});
test('los colores del teléfono son homogéneos para los cuatro estados',()=>{
  const f=['master','slave','pending','measured'];
  for(const state of f){
    const svg=Symbols.phone({x:60,y:70,status:state});
    const color=Symbols.COLORS[state];
    assert.match(svg,/class="joint-phone-marker joint-setup-phone"/);
    assert.ok((svg.match(new RegExp(color,'g'))||[]).length>=6,state);
    assert.ok(!f.some(other=>other!==state&&svg.includes(Symbols.COLORS[other])),state);
    assert.match(svg,/fill="#ffffff"/);
  }
});
test('prioridad maestro, esclavo activo, medido y pendiente en el plano',()=>{
  const measured=new Set(['P1','P2','P3']);
  const assignments=[{deviceId:'host',pointId:'P2'},{deviceId:'guest',pointId:'P3'}];
  assert.equal(Symbols.statusFor('P2',assignments,'host',measured),'master');
  assert.equal(Symbols.statusFor('P3',assignments,'host',measured),'slave');
  assert.equal(Symbols.statusFor('P1',assignments,'host',measured),'measured');
  assert.equal(Symbols.statusFor('P4',assignments,'host',measured),'pending');
});
