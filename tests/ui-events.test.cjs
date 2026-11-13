'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {bindEvents}=require('../src/joint/ui-events.js');
const {createState}=require('../src/joint/session-state.js');

test('cada sesión crea colecciones independientes sin depender del DOM',()=>{
  let n=0;
  const a=createState(()=>String(++n)),b=createState(()=>String(++n));
  assert.equal(a.id,'1');assert.equal(b.id,'2');
  assert.notStrictEqual(a.peers,b.peers);
  assert.notStrictEqual(a.results,b.results);
  assert.notStrictEqual(a.planPointers,b.planPointers);
  assert.notStrictEqual(a.plan.points,b.plan.points);
  assert.notStrictEqual(a.syncCalibration.results,b.syncCalibration.results);
  assert.equal(a.run,null);
  assert.equal(a.role,null);
  assert.equal(a.plan.length,30);
  assert.equal(a.plan.width,3);
  assert.equal(a.syncCalibration.phase,'idle');
});

test('el módulo enlaza acciones, sensores, plano y transferencia al DOM',()=>{
  const elements=new Map();const calls=[];const documentEvents=[];const windowEvents=[];
  const $=id=>{
    if(!elements.has(id))elements.set(id,{listeners:{},
      addEventListener(type,handler){this.listeners[type]=handler;},
      onclick:null,onchange:null});
    return elements.get(id);
  };
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  globalThis.document={querySelectorAll:()=>[],addEventListener:(type)=>documentEvents.push(type)};
  globalThis.window={addEventListener:(type)=>windowEvents.push(type)};
  try {
    const callbacks={open:()=>calls.push('open'),openStandaloneTest:()=>calls.push('standalone'),
      resetSession:()=>calls.push('exit'),createJointSession:()=>calls.push('create'),
      startRun:()=>calls.push('start'),sendRecord:()=>calls.push('send'),
      enableSensor:()=>calls.push('sensor'),recover:()=>calls.push('recover'),
      running:()=>false,svgPosition:()=>null};
    const deps=new Proxy({s:createState(()=> 'a'),$,guard:fn=>fn,...callbacks},
      {get:(target,key)=>Object.hasOwn(target,key)?target[key]:()=>calls.push(String(key))});
    bindEvents(deps);
    assert.equal(typeof $('jointPlan').listeners.pointerdown,'function');
    assert.equal(typeof $('jointPlan').listeners.pointermove,'function');
    assert.equal(typeof $('jointPointsTable').listeners.touchend,'function');
    assert.equal(typeof $('jointPointsTable').listeners.scroll,'function');
    assert.equal(typeof $('jointImportSession').onchange,'function');
    assert.deepEqual(documentEvents,['touchstart','touchmove','pointerdown','visibilitychange']);
    assert.deepEqual(windowEvents,['beforeunload']);
    $('openJointButton').listeners.click();
    $('standaloneTestButton').listeners.click();
    $('jointExit').listeners.click();
    $('jointCreate').onclick();
    $('jointStart').onclick();
    $('jointSendData').onclick();
    $('jointEnableSensor').onclick();
    $('jointRecover').onclick();
    // Exercise a real host-only gesture: it must resolve running() via DI,
    // not from the old coordinator's closed-over lexical scope.
    deps.s.role='host';
    assert.doesNotThrow(()=>$('jointPlan').listeners.wheel({preventDefault(){},deltaY:1}));
    assert.deepEqual(calls,['open','standalone','exit','create','start','send','sensor','recover']);
  } finally {
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});
