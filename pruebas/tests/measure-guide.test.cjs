'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {viewModel,planSvg,createController} = require('../src/joint/measure-guide.js');
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function fixture() {
    const plan = {length:30,width:3,points:[
        {id:'A1',kind:'support',x:0,y:1.5},
        {id:'P1',kind:'sensor',x:5,y:1.5,device:null},
        {id:'P2',kind:'sensor',x:10,y:1.5,device:'host'},
        {id:'P3',kind:'sensor',x:20,y:1.5,device:'guest'},
        {id:'P4',kind:'sensor',x:25,y:1.5,device:null},
        {id:'I1',kind:'interpolation',x:15,y:1.5}
    ]};
    const setup = {index:1,assignments:[
        {deviceId:'host',pointId:'P2'},
        {deviceId:'guest',pointId:'P3'}
    ],measuredRunId:null,completedRunId:null};
    return {role:'host',id:'host',name:'Maestro',plan,
        setupPlan:{activeIndex:0,selectedIndex:0,setups:[setup],history:[]},
        peers:new Map([['guest',{id:'guest',name:'Móvil B',
            channel:{readyState:'open'},status:{sensor:true,visible:true,calibrated:true}}]]),
        sensor:true,calibration:{complete:true},results:new Map(),run:null};
}
test('teléfonos enteros: maestro rojo, esclavo azul, pendientes grises y apoyos',()=>{
    const s=fixture(),v=viewModel(s,true),svg=planSvg(v,esc);
    assert.equal(v.devices[0].code,'M');
    assert.equal(v.devices[1].code,'S1');
    assert.equal((svg.match(/class="joint-phone-marker joint-setup-phone"/g)||[]).length,4);
    assert.match(svg, /data-status="master"/);
    assert.match(svg, /data-status="slave"/);
    assert.match(svg, /data-status="pending"/);
    assert.match(svg, /#cc3b47/);
    assert.match(svg, /#176bb0/);
    assert.match(svg, /#99a8b6/);
    assert.match(svg, /#f4d8b3/);
    assert.match(svg, /I1|<rect x=/);
    assert.match(svg, /M · P2/);
    assert.match(svg, /S1 · P3/);
});
test('los móviles sin asignación no aparecen como esclavos activos',()=>{
    const s=fixture();
    s.peers.set('waiting',{id:'waiting',name:'Móvil de reserva',channel:{readyState:'open'}});
    const v=viewModel(s,true);
    assert.equal(v.devices.length,2);
    assert.deepEqual(v.waiting,['Móvil de reserva']);
});
test('medir exige recepción de ambos registros antes de habilitar completado',()=>{
    const s=fixture(),runPlan=structuredClone(s.plan);
    s.run={id:'run-12345678',finished:true,state:'finished',plan:runPlan};
    s.setupPlan.setups[0].measuredRunId=s.run.id;
    s.results.set('host',{});
    const nodes=new Map();
    const $=id=>{
        if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,title:''});
        return nodes.get(id);
    };
    const guide=createController({s,$,escape:esc,currentValid:()=>true});
    guide.renderMeasureGuide();
    assert.equal($('jointMeasureComplete').hidden,false);
    assert.equal($('jointMeasureComplete').disabled,true);
    assert.equal($('jointMeasureNext').hidden,true);
    s.results.set('guest',{});
    guide.renderMeasureGuide();
    assert.equal($('jointMeasureComplete').disabled,false);
    s.setupPlan.setups[0].completedRunId=s.run.id;
    s.setupPlan.history=[{index:1,runId:s.run.id,completed:true,finishedAt:'2026-11-14T12:00:00.000Z'}];
    guide.renderMeasureGuide();
    assert.equal($('jointMeasureComplete').hidden,true);
    assert.equal($('jointMeasureNext').hidden,false);
    assert.match($('jointMeasureGuideHistory').innerHTML,/Completado/);
});

test('la guia pertenece a Setups y el instrumento no altera la rejilla de registro',()=>{
    const fs=require('node:fs'),path=require('node:path');
    const root=path.resolve(__dirname,'..');
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
    assert.ok(html.indexOf('id="jointMeasureSetupGuide"') < html.indexOf('id="jointPanelMeasure"'));
    assert.ok(html.indexOf('id="jointInstrumentBack"') > html.indexOf('id="jointPanelMeasure"'));
    assert.ok(html.indexOf('id="jointStart"') < html.indexOf('id="jointLive"'));
    assert.match(html,/src="src\/joint\/measure-guide\.js\?/);
    assert.match(css,/#jointTabMeasure \{display:none!important;\}/);
    assert.match(css,/grid-template-areas:"duration" "temporal" "spectrum" "controls"/);
});

test('el verde indica otro punto medido y no cambia el rojo del maestro fijo',()=>{
    const s=fixture();
    const completed={index:1,assignments:[
        {deviceId:'host',pointId:'P2'}, {deviceId:'guest',pointId:'P1'}
    ],measuredRunId:'r1',completedRunId:'r1'};
    s.setupPlan.setups.unshift(completed);
    s.setupPlan.setups[1].index=2;
    s.setupPlan.activeIndex=1;
    s.setupPlan.selectedIndex=1;
    const svg=planSvg(viewModel(s,true),esc);
    assert.match(svg,/data-status="master"/);
    assert.match(svg,/data-status="slave"/);
    assert.match(svg,/data-status="measured"/);
    assert.match(svg,/data-status="pending"/);
    assert.match(svg,/#16824e/);
});
