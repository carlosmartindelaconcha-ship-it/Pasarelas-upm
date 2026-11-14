/* VWOMA | Stable multi-tab navigation on mobile browsers, including Android.
 * DOM layout and scroll position belong here; scientific controllers do not.
 */
(function registerTabNavigation(root) {
  'use strict';
  const NAMES=Object.freeze(['Plan','Devices','Sync','Measure','Results','Compare']);
  function createNavigation({$,window,raf,renderComparison,onMeasureVisible=()=>{},isRecording=()=>false,onChange=()=>{}}) {
    let current=null;
    // El fondo blanco y la zona segura pertenecen al contenedor sticky
    // #jointNavShell. No hay eventos de scroll ni máscaras JS.
    function tab(name) {
      if(!NAMES.includes(name))throw Error('Pestaña desconocida: '+name);
      if(current===name)return false; // Never reflow active content on repeat calls.
      // Do not abandon the instrument while an acquisition is pending or running.
      if(current==='Measure'&&name!=='Measure'&&isRecording())return false;
      const previous=current;
      current=name;
      for(const n of NAMES) {
        $('jointPanel'+n).hidden=n!==name;
        $('jointTab'+n).setAttribute('aria-selected',String(n===name));
        $('jointTab'+n).tabIndex=n===name?0:-1;
      }
      onChange(name,previous);
      if(name==='Compare')renderComparison();
      if(name==='Measure') {
        // Resize only after the panel is visible (important for Chrome Android).
        const resize=()=>{ try { onMeasureVisible?.(); }catch(_){} };
        if(typeof raf==='function')raf(resize);
      }
      const bar=$('jointTabs'),button=$('jointTab'+name);
      if(bar?.scrollTo && button?.getBoundingClientRect && bar.getBoundingClientRect) {
        const x=button.getBoundingClientRect().left-bar.getBoundingClientRect().left;
        const left=Math.max(0,(bar.scrollLeft||0)+x-((bar.clientWidth||0)-(button.offsetWidth||0))/2);
        bar.scrollTo({left,behavior:'smooth'});
      }
      // On mobile, replacing a tall prior panel can cause scroll anchoring to
      // jump to the page header. Align the visible tab bar after the reflow.
      if(previous!==null&&name!=='Measure'&&!isRecording()&&typeof window?.scrollTo==='function') {
        const align=()=>{
          if(current!==name||isRecording())return;
          // Alinear la cabecera completa, NO el inicio de sus botones:
          // su franja blanca superior debe permanecer dentro del viewport.
          const el=$('jointNavShell');
          if(!el?.getBoundingClientRect)return;
          const y=Math.max(0,(window.scrollY||0)+el.getBoundingClientRect().top);
          window.scrollTo({top:y,behavior:'instant'});
        };
        if(typeof raf==='function')raf(align);else align();
      }
      return true;
    }
    return Object.freeze({tab,current:()=>current});
  }
  const api=Object.freeze({createNavigation});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMATabNavigation=api;
})(globalThis);
