/* VWOMA | Robust value inspection on charts (touch and mouse).
 * A stationary tap selects the nearest visible sample anywhere in the plot;
 * moving, pinching or zooming dismisses the label. No gesture is prevented.
 */
(function registerChartTooltips(root) {
  'use strict';

  function createController({Chart,document}={}) {
    const attached=new WeakMap();
    const DRAG_PX=15;
    const charts=()=>{
      const instances=Chart?.instances;
      return instances instanceof Map?[...instances.values()]:Object.values(instances||{});
    };
    function clearChart(chart) {
      if(!chart)return false;
      const tip=chart.tooltip?.getActiveElements?.()||[];
      const active=chart.getActiveElements?.()||[];
      if(!chart.$vwomaValueVisible&&!tip.length&&!active.length)return false;
      chart.setActiveElements?.([]);
      chart.tooltip?.setActiveElements?.([],{x:0,y:0});
      chart.$vwomaValueVisible=false;
      chart.update?.('none');
      return true;
    }
    function clearAll(){for(const chart of charts())clearChart(chart);}

    function localPosition(chart,event) {
      if(Number.isFinite(event?.x)&&Number.isFinite(event?.y)&&event?.vwomaLocal)
        return {x:event.x,y:event.y};
      if(Number.isFinite(event?.x)&&Number.isFinite(event?.y)&&!event?.native)
        return {x:event.x,y:event.y}; // Chart.js normalized click event
      const native=event?.native||event;
      const touch=native?.changedTouches?.[0]||native?.touches?.[0]||native;
      const bounds=chart?.canvas?.getBoundingClientRect?.();
      if(!bounds||!bounds.width||!bounds.height||
         !Number.isFinite(touch?.clientX)||!Number.isFinite(touch?.clientY))return null;
      return {
        x:(touch.clientX-bounds.left)*(chart.width/bounds.width),
        y:(touch.clientY-bounds.top)*(chart.height/bounds.height)
      };
    }

    function showClickedValue(event,elements,chart) {
      if(!chart)return false;
      const state=attached.get(chart)?.state;
      if(state?.ignoreClick&& !event?.vwomaLocal)return false;
      const p=localPosition(chart,event);
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
      const area=chart.chartArea;
      // Chart axes/legend remain clickable; a tap anywhere inside the actual
      // plot must work, even well away from a line or spectral peak.
      if(area&&(p.x<area.left||p.x>area.right||p.y<area.top||p.y>area.bottom))
        return false;
      // Chart.js expects a normalized ChartEvent. Without its native field
      // getRelativePosition interprets this object as a raw DOM event and
      // loses the coordinates (especially visible on spectrum charts).
      const request={type:'click',x:p.x,y:p.y,native:null};
      let active=chart.getElementsAtEventForMode?.(request,'nearest',
        {intersect:false,axis:'xy'},true)||[];
      if(!active.length) {
        const fallback=chart.getElementsAtEventForMode?.(request,'index',
          {intersect:false},true)||[];
        active=fallback.filter(item=>item?.element).sort(
          (a,b)=>Math.abs(a.element.y-p.y)-Math.abs(b.element.y-p.y)
        ).slice(0,1);
      }
      if(!active.length&&elements?.length)active=elements;
      const item=active[0];
      if(!item?.element)return false;
      clearAll();
      chart.setActiveElements?.([item]);
      chart.tooltip?.setActiveElements?.([item],{x:item.element.x,y:item.element.y});
      chart.$vwomaValueVisible=true;
      chart.update?.('none');
      return true;
    }

    function attach(chart) {
      const canvas=chart?.canvas;
      if(!canvas?.addEventListener||attached.has(chart))return;
      const state={
        pointer:null,pointers:new Set(),touch:null,ignoreClick:false,
        hadPointer:false,gesture:false
      };
      const clear=()=>clearAll();
      function onPointerDown(e) {
        state.hadPointer=true;
        state.pointers.add(e.pointerId);
        if(state.pointers.size>1){state.gesture=true;state.ignoreClick=true;clear();return;}
        state.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false};
        state.ignoreClick=false;
        clear();
      }
      function onPointerMove(e) {
        const start=state.pointer;
        if(start&&e.pointerId===start.id&&Number.isFinite(e.clientX)&&
           Math.hypot(e.clientX-start.x,e.clientY-start.y)>DRAG_PX){
          start.dragged=true;state.gesture=true;state.ignoreClick=true;clear();
        }
      }
      function onPointerUp(e) {
        state.pointers.delete(e.pointerId);
        const start=state.pointer;
        if(!start||e.pointerId!==start.id)return;
        state.pointer=null;
        if(!start.dragged&&!state.gesture&&state.pointers.size===0) {
          const p=localPosition(chart,{native:e});
          if(p)showClickedValue({...p,vwomaLocal:true},[],chart);
        } else state.ignoreClick=true;
        if(!state.pointers.size)state.gesture=false;
      }
      function onPointerCancel(e) {
        state.pointers.delete(e.pointerId);
        state.pointer=null;state.ignoreClick=true;state.gesture=true;clear();
        if(!state.pointers.size)state.gesture=false;
      }
      function onTouchStart(e) {
        if(e.touches?.length!==1){state.gesture=true;state.ignoreClick=true;clear();return;}
        const touch=e.touches[0];
        state.touch={x:touch.clientX,y:touch.clientY,dragged:false};
        clear();
      }
      function onTouchMove(e) {
        const start=state.touch,touch=e.touches?.[0];
        if(e.touches?.length>1||!start||!touch||
           Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>DRAG_PX){
          if(start)start.dragged=true;
          state.gesture=true;state.ignoreClick=true;clear();
        }
      }
      function onTouchEnd(e) {
        const start=state.touch;
        state.touch=null;
        if(!state.hadPointer&&start&&!start.dragged&&!state.gesture&&
           e.changedTouches?.length===1){
          const p=localPosition(chart,{native:e});
          if(p)showClickedValue({...p,vwomaLocal:true},[],chart);
        }
        if(!e.touches?.length)state.gesture=false;
      }
      function onTouchCancel(){state.touch=null;state.gesture=false;state.ignoreClick=true;clear();}
      function onWheel(){state.ignoreClick=true;clear();}
      // Click is retained only as a fallback for desktop mouse/keyboard.
      // Pointer-up does not depend on Chart.js translating touch to click.
      const handlers=[
        ['pointerdown',onPointerDown,{passive:true}],
        ['pointermove',onPointerMove,{passive:true}],
        ['pointerup',onPointerUp,{passive:true}],
        ['pointercancel',onPointerCancel,{passive:true}],
        ['touchstart',onTouchStart,{passive:true}],
        ['touchmove',onTouchMove,{passive:true}],
        ['touchend',onTouchEnd,{passive:true}],
        ['touchcancel',onTouchCancel,{passive:true}],
        ['wheel',onWheel,{passive:true}]
      ];
      for(const [type,handler,options] of handlers)
        canvas.addEventListener(type,handler,options);
      attached.set(chart,{
        state,
        dispose:()=>{for(const [type,handler,options] of handlers)
          canvas.removeEventListener?.(type,handler,options);}
      });
    }
    function detach(chart){attached.get(chart)?.dispose();attached.delete(chart);}
    function install() {
      if(!Chart)return;
      Chart.defaults.plugins ||= {};
      Chart.defaults.plugins.tooltip ||= {};
      Chart.defaults.plugins.tooltip.enabled=true;
      Chart.defaults.plugins.tooltip.events=['click'];
      Chart.register?.({id:'vwoma-gesture-values',afterInit:attach,beforeDestroy:detach});
      document?.addEventListener?.('pointerdown',clearAll,{capture:true,passive:true});
      document?.addEventListener?.('touchstart',clearAll,{capture:true,passive:true});
      document?.addEventListener?.('keydown',e=>{
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key))
          clearAll();
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
