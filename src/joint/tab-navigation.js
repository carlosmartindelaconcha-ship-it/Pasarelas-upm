/* VWOMA | Stable multi-tab navigation on mobile browsers, including Android.
 * DOM layout and scroll position belong here; scientific controllers do not.
 */
(function registerTabNavigation(root) {
  'use strict';
  const NAMES=Object.freeze(['Plan','Devices','Sync','Measure','Results','Compare']);
  function createNavigation({$,window,raf,renderComparison,isRecording=()=>false}) {
    let current=null;
    function tab(name) {
      if(!NAMES.includes(name))throw Error('Pestaña desconocida: '+name);
      if(current===name)return false; // Never reflow active content on repeat calls.
      const previous=current;
      current=name;
      for(const n of NAMES) {
        $('jointPanel'+n).hidden=n!==name;
        $('jointTab'+n).setAttribute('aria-selected',String(n===name));
        $('jointTab'+n).tabIndex=n===name?0:-1;
      }
      if(name==='Compare')renderComparison();
      const bar=$('jointTabs'),button=$('jointTab'+name);
      if(bar?.scrollTo && button?.getBoundingClientRect && bar.getBoundingClientRect) {
        const x=button.getBoundingClientRect().left-bar.getBoundingClientRect().left;
        const left=Math.max(0,(bar.scrollLeft||0)+x-((bar.clientWidth||0)-(button.offsetWidth||0))/2);
        bar.scrollTo({left,behavior:'smooth'});
      }
      // On mobile, replacing a tall prior panel can cause scroll anchoring to
      // jump to the page header. Align the visible tab bar after the reflow.
      if(previous!==null&&!isRecording()&&typeof window?.scrollTo==='function') {
        const align=()=>{
          if(current!==name||isRecording())return;
          const el=$('jointTabs');
          if(!el?.getBoundingClientRect)return;
          const y=Math.max(0,(window.scrollY||0)+el.getBoundingClientRect().top-6);
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
