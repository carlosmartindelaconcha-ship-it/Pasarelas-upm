'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createNavigation}=require('../src/joint/tab-navigation.js');
const {createController}=require('../src/ui/chart-tooltips.js');

test('una pestaña no se vuelve a montar si ya está activa; y se preserva la cabecera visible',()=>{
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id))nodes.set(id,{
      hidden:id!=='jointPanelPlan',tabIndex:0,scrollLeft:0,clientWidth:320,offsetWidth:60,
      setAttribute(key,value){this[key]=value;},
      getBoundingClientRect(){return {left:10,top:200};},
      scrollTo(value){this.lastScroll=value;}
    });
    return nodes.get(id);
  };
  let compareCount=0,resizeCount=0,scrollCount=0;
  let locked=false;
  const win={scrollY:400,scrollTo(value){scrollCount++;this.lastScroll=value}};
  const view=createNavigation({$,window:win,raf:fn=>fn(),renderComparison:()=>compareCount++,
    onMeasureVisible:()=>resizeCount++,isRecording:()=>locked});
  assert.equal(view.tab('Plan'),true);
  assert.equal(scrollCount,0);
  assert.equal(view.tab('Measure'),true);
  assert.equal(resizeCount,1);
  assert.equal(view.tab('Measure'),false);
  assert.equal(resizeCount,1);
  assert.equal(win.lastScroll.top,594);
  assert.equal($('jointPanelMeasure').hidden,false);
  assert.equal($('jointPanelPlan').hidden,true);
  assert.equal($('jointTabMeasure')['aria-selected'],'true');
  assert.equal(view.tab('Compare'),true);
  assert.equal(compareCount,1);
  assert.equal(view.tab('Compare'),false);
  assert.equal(compareCount,1);
  locked=true;
  view.tab('Results');
  assert.equal(scrollCount,2);
});


function mockChart({onMode}={}) {
  const handlers={}, registered=[],docHandlers=[];
  const canvas={getBoundingClientRect(){return {left:20,top:30,width:300,height:150};},
    addEventListener(name,fn){handlers[name]=fn;},
    removeEventListener(name){delete handlers[name];}};
  const point={datasetIndex:0,index:19,element:{x:225,y:100}};
  const chart={canvas,width:600,height:300,
    chartArea:{left:0,right:600,top:0,bottom:300},active:[],
    tooltip:{active:[],getActiveElements(){return this.active;},
      setActiveElements(value){this.active=value;}},
    getActiveElements(){return this.active;},
    setActiveElements(value){this.active=value;},
    getElementsAtEventForMode(event,mode,options){
      if(onMode)return onMode(event,mode,options);
      // Match Chart.js' getRelativePosition implementation:
      // a normalized chart event must include the native field.
      if(!('native' in event))return [];
      return mode==='nearest'?[point]:[];
    },
    update(mode){this.updated=mode;}
  };
  const Chart={defaults:{plugins:{tooltip:{enabled:false}}},instances:new Map([[1,chart]]),
    register(plugin){registered.push(plugin);}};
  const document={addEventListener(name,fn){docHandlers.push([name,fn]);}};
  const api=createController({Chart,document});api.install();registered[0].afterInit(chart);
  return {handlers,registered,docHandlers,chart,point,api,canvas,Chart};
}

test('selecciona valores de espectro aunque el dedo no toque exactamente la curva',()=>{
  let received=null;
  const mock=mockChart({onMode(event,mode,options){
    received={event,mode,options};
    assert.equal(event.native,null,'Chart.js must receive a normalized ChartEvent');
    assert.equal(event.type,'click');
    assert.equal(options.intersect,false);
    return [ {datasetIndex:0,index:19,element:{x:225,y:100}} ];
  }});
  const {handlers,chart,api}=mock;
  // Actual native pointer coordinates are converted to chart pixels.
  handlers.pointerdown({pointerId:1,clientX:110,clientY:100});
  handlers.pointerup({pointerId:1,clientX:110,clientY:100});
  assert.equal(received.event.x,180);
  assert.equal(received.event.y,140);
  assert.equal(received.mode,'nearest');
  assert.equal(chart.tooltip.active.length,1);
  assert.equal(chart.tooltip.active[0].index,19);
  // A second ordinary press still shows values without a delay.
  handlers.pointerdown({pointerId:2,clientX:240,clientY:100});
  handlers.pointerup({pointerId:2,clientX:240,clientY:100});
  assert.equal(chart.tooltip.active.length,1);
  api.detach(chart);
  assert.equal(Object.keys(handlers).length,0);
});

test('gestos de arrastre, pellizco y rueda ocultan el valor pero no impiden un nuevo toque',()=>{
  const {api,chart,handlers,docHandlers}=mockChart();
  const touch={clientX:100,clientY:90};
  handlers.pointerdown({pointerId:1,clientX:100,clientY:90});
  handlers.pointerup({pointerId:1,clientX:100,clientY:90});
  assert.equal(chart.tooltip.active.length,1);
  handlers.pointerdown({pointerId:2,clientX:100,clientY:90});
  handlers.pointermove({pointerId:2,clientX:140,clientY:90});
  handlers.pointerup({pointerId:2,clientX:140,clientY:90});
  assert.equal(chart.tooltip.active.length,0);
  handlers.pointerdown({pointerId:3,clientX:100,clientY:90});
  handlers.pointerup({pointerId:3,clientX:100,clientY:90});
  assert.equal(chart.tooltip.active.length,1);
  handlers.wheel();
  assert.equal(chart.tooltip.active.length,0);
  handlers.pointerdown({pointerId:4,clientX:100,clientY:90});
  handlers.pointerup({pointerId:4,clientX:100,clientY:90});
  assert.equal(chart.tooltip.active.length,1);
  docHandlers.find(([name])=>name==='pointerdown')[1]();
  assert.equal(chart.tooltip.active.length,0);
  // Multiple simultaneous pointers must not select a sample.
  handlers.pointerdown({pointerId:5,clientX:100,clientY:90});
  handlers.pointerdown({pointerId:6,clientX:140,clientY:90});
  handlers.pointerup({pointerId:5,clientX:100,clientY:90});
  handlers.pointerup({pointerId:6,clientX:140,clientY:90});
  assert.equal(chart.tooltip.active.length,0);
  api.detach(chart);
});

test('Safari antiguo sin Pointer Events puede consultar una curva mediante touchend',()=>{
  const {handlers,chart,api}=mockChart();
  const tap={clientX:110,clientY:100};
  handlers.touchstart({touches:[tap]});
  handlers.touchend({changedTouches:[tap],touches:[]});
  assert.equal(chart.tooltip.active.length,1);
  // A touch with actual displacement is pan, not inspection.
  handlers.touchstart({touches:[tap]});
  handlers.touchmove({touches:[{clientX:190,clientY:100}]});
  handlers.touchend({changedTouches:[{clientX:190,clientY:100}],touches:[]});
  assert.equal(chart.tooltip.active.length,0);
  api.detach(chart);
});

test('la comparación conserva pan horizontal con un dedo y zoom XY con pellizco',()=>{
  const results=fs.readFileSync(require('node:path').join(__dirname,'../src/joint/results-view.js'),'utf8');
  assert.match(results,/options\.plugins\.zoom\.pan\.enabled=true/);
  assert.match(results,/options\.plugins\.zoom\.pan\.mode='x'/);
  assert.match(results,/options\.plugins\.zoom\.zoom\.onZoom=constrain/);
  assert.doesNotMatch(results,/matchMedia\('\(pointer: coarse\)'\)/);
});
