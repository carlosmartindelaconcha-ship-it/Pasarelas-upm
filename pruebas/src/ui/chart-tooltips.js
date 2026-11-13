/* VWOMA | Display a measurement value on tap, dismiss on the next gesture.
 * This module never cancels events: one-finger pan, pinch zoom and wheel zoom
 * remain fully controlled by the existing Chart.js zoom plugin.
 */
(function registerChartTooltips(root) {
  'use strict';
  function createController({Chart,document}={}) {
    const listeners=new WeakMap();
    let lastGestureTime=-Infinity;
    const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
    const charts=()=>{
      const instances=Chart?.instances;
      return instances instanceof Map?[...instances.values()]:Object.values(instances||{});
    };
    function clearChart(chart) {
      if(!chart)return false;
      const current=chart.tooltip?.getActiveElements?.()||[];
      const highlighted=chart.getActiveElements?.()||[];
      if(!current.length&&!highlighted.length&&!chart.$vwomaValueVisible)return false;
      chart.setActiveElements?.([]);
      chart.tooltip?.setActiveElements?.([],{x:0,y:0});
      chart.$vwomaValueVisible=false;
      chart.update?.('none');
      return true;
    }
    function clearAll(){for(const chart of charts())clearChart(chart);}
    function showClickedValue(event,elements,chart) {
      if(!chart||now()-lastGestureTime<280)return;
      // Ignore the legend, scales and margins: only an actual plot tap counts.
      const area=chart.chartArea;
      if(area&&Number.isFinite(event?.x)&&Number.isFinite(event?.y)&&
        (event.x<area.left||event.x>area.right||event.y<area.top||event.y>area.bottom))return;
      const active=(elements?.length?elements:chart.getElementsAtEventForMode?.(event,'nearest',{intersect:false},true))||[];
      if(!active.length||!active[0]?.element)return;
      clearAll();
      const point=active[0];
      chart.setActiveElements?.([point]);
      chart.tooltip?.setActiveElements?.([point],{x:point.element.x,y:point.element.y});
      chart.$vwomaValueVisible=true;
      chart.update?.('none');
    }
    function attach(chart) {
      const canvas=chart?.canvas;
      if(!canvas?.addEventListener||listeners.has(chart))return;
      let start=null;
      const onDown=e=>{lastGestureTime=-Infinity;start={pointerId:e.pointerId,x:e.clientX,y:e.clientY};};
      const onMove=e=>{
        if(start&&e.pointerId===start.pointerId&&
          Math.hypot(e.clientX-start.x,e.clientY-start.y)>7){
          lastGestureTime=now();
          clearAll();
        }
      };
      const onUp=()=>{start=null;};
      const onTouch=e=>{if(e.touches?.length>1){lastGestureTime=now();clearAll();}};
      const onTouchMove=()=>{lastGestureTime=now();clearAll();};
      const onWheel=()=>{lastGestureTime=now();clearAll();};
      const events=[
        ['pointerdown',onDown,{passive:true}],
        ['pointermove',onMove,{passive:true}],
        ['pointerup',onUp,{passive:true}],
        ['pointercancel',onUp,{passive:true}],
        ['touchstart',onTouch,{passive:true}],
        ['touchmove',onTouchMove,{passive:true}],
        ['wheel',onWheel,{passive:true}]
      ];
      for(const [type,handler,opts] of events)canvas.addEventListener(type,handler,opts);
      listeners.set(chart,()=>{for(const [type,handler,opts] of events)
        canvas.removeEventListener?.(type,handler,opts);});
    }
    function detach(chart){listeners.get(chart)?.();listeners.delete(chart);}
    function install() {
      if(!Chart)return;
      Chart.defaults.plugins ||= {};
      Chart.defaults.plugins.tooltip ||= {};
      Chart.defaults.plugins.tooltip.enabled=true;
      // Never show tooltips on mouse hover or touch dragging; only click/tap.
      Chart.defaults.plugins.tooltip.events=['click'];
      Chart.register?.({id:'vwoma-gesture-values',afterInit:attach,beforeDestroy:detach});
      document?.addEventListener?.('pointerdown',clearAll,{capture:true,passive:true});
      document?.addEventListener?.('touchstart',clearAll,{capture:true,passive:true});
      document?.addEventListener?.('keydown',e=>{
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))clearAll();
      },{capture:true});
    }
    return Object.freeze({install,showClickedValue,clearChart,clearAll,attach,detach});
  }
  const api=Object.freeze({createController});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    const controller=createController({Chart:root.Chart,document:root.document});
    root.VWOMAChartTooltips=controller;
    controller.install();
  }
})(globalThis);
