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

test('mostrar valor al tocar y borrarlo al iniciar desplazamiento, zoom u otro toque',()=>{
  const canvasHandlers={},docHandlers={},registered=[];
  const canvas={addEventListener(type,fn){canvasHandlers[type]=fn;},
                removeEventListener(type){delete canvasHandlers[type];}};
  const point={datasetIndex:0,index:3,element:{x:55,y:70}};
  const chart={canvas,chartArea:{left:0,right:300,top:0,bottom:200},
    selected:[],getActiveElements(){return this.selected;},
    setActiveElements(items){this.selected=items;},
    getElementsAtEventForMode(){return [point];},
    tooltip:{items:[],getActiveElements(){return this.items;},
             setActiveElements(items){this.items=items;}},
    update(mode){this.lastUpdate=mode;}};
  const Chart={instances:new Map([[1,chart]]),defaults:{plugins:{tooltip:{enabled:false}}},
    register(plugin){registered.push(plugin);}};
  const document={addEventListener(type,fn){docHandlers[type]=fn;}};
  const ctl=createController({Chart,document});
  ctl.install();
  assert.deepEqual(Chart.defaults.plugins.tooltip.events,['click']);
  assert.equal(Chart.defaults.plugins.tooltip.enabled,true);
  registered[0].afterInit(chart);
  ctl.showClickedValue({x:55,y:70},[],chart);
  assert.equal(chart.tooltip.items.length,1);
  canvasHandlers.pointerdown({pointerId:1,clientX:5,clientY:5});
  canvasHandlers.pointermove({pointerId:1,clientX:25,clientY:5});
  assert.equal(chart.tooltip.items.length,0);
  ctl.showClickedValue({x:55,y:70},[],chart);
  assert.equal(chart.tooltip.items.length,0); // dragged gestures cannot fake a click
  canvasHandlers.wheel();
  assert.equal(chart.tooltip.items.length,0);
  docHandlers.pointerdown();
  ctl.showClickedValue({x:55,y:70},[],chart);
  assert.equal(chart.tooltip.items.length,0); // suppressed briefly after gestures
  registered[0].beforeDestroy(chart);
  assert.equal(Object.keys(canvasHandlers).length,0);
});

test('la interacción de comparación permite pan con un dedo, igual que el ensayo',()=>{
  const results=fs.readFileSync(require('node:path').join(__dirname,'../src/joint/results-view.js'),'utf8');
  assert.match(results,/options\.plugins\.zoom\.pan\.enabled=true/);
  assert.match(results,/options\.plugins\.zoom\.pan\.mode='x'/);
  assert.match(results,/options\.plugins\.zoom\.zoom\.onZoom=constrain/);
  assert.doesNotMatch(results,/matchMedia\('\(pointer: coarse\)'\)/);
});
