'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
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

test('el puntero global parte oculto, se activa bajo demanda y limpia selecciones al apagarse',()=>{
  const chart={canvas:{id:'chart-1'},
    options:{plugins:{tooltip:{enabled:true}}},
    active:[{index:1}],
    setActiveElements(items){this.active=items;},
    tooltip:{setActiveElements(items){this.active=items;}},
    update(mode){this.mode=mode;}
  };
  const Chart={instances:new Map([[1,chart]]),defaults:{plugins:{tooltip:{enabled:true}}}};
  const buttons=Array.from({length:2},()=>({
    attributes:{},addEventListener(type,fn){this[type]=fn;},
    setAttribute(k,v){this.attributes[k]=v;}
  }));
  let saved=null;
  const storage={getItem:()=>saved,setItem:(k,v)=>saved=v};
  const ctl=createController({Chart,document:{querySelectorAll:()=>buttons},storage});
  ctl.mount();
  assert.equal(ctl.isEnabled(),false);
  assert.equal(chart.options.plugins.tooltip.enabled,false);
  assert.equal(Chart.defaults.plugins.tooltip.enabled,false);
  assert.equal(buttons[0].attributes['aria-pressed'],'false');
  buttons[0].click();
  assert.equal(ctl.isEnabled(),true);
  assert.equal(saved,'on');
  assert.equal(buttons[1].attributes['aria-pressed'],'true');
  assert.equal(chart.options.plugins.tooltip.enabled,true);
  buttons[1].click();
  assert.equal(chart.options.plugins.tooltip.enabled,false);
  assert.deepEqual(chart.active,[]);
  assert.deepEqual(chart.tooltip.active,[]);
  assert.equal(saved,'off');
});
