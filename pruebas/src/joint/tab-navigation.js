/* VWOMA | Stable multi-tab navigation on mobile browsers, including Android.
 * DOM layout and scroll position belong here; scientific controllers do not.
 */
(function registerTabNavigation(root) {
  'use strict';
  const NAMES=Object.freeze(['Plan','Devices','Sync','Measure','Results','Compare']);
  function createNavigation({$,window,raf,renderComparison,onMeasureVisible=()=>{},isRecording=()=>false,onChange=()=>{}}) {
    let current=null;
    // Safari iOS deja ver el contenido que pasa por la zona SUPERIOR a la
    // barra sticky. Una máscara fija blanca sigue exactamente el borde superior
    // de las pestañas. El sentinel distingue barra fija de barra en su sitio.
    const tabs=$('jointTabs'),topMask=$('jointTabsTopMask'),sentinel=$('jointTabsTopSentinel');
    let maskScheduled=false;
    function refreshTopMask(){
      maskScheduled=false;
      if(!tabs||!topMask||!sentinel)return;
      const workspace=$('jointWorkspace'),app=$('jointApp');
      if(workspace?.hidden||app?.hidden||
          (typeof document!=='undefined'&&document.body.classList.contains('joint-measure-fixed'))){
        topMask.style.visibility='hidden';
        topMask.style.height='0px';
        return;
      }
      const bar=tabs.getBoundingClientRect(),edge=sentinel.getBoundingClientRect();
      // Sin desplazamiento: los dos empiezan juntos. Cuando la barra se pega
      // arriba, el sentinel sube y deja de coincidir con ella.
      const stuck=edge.top<bar.top-1;
      const height=stuck?Math.max(0,Math.ceil(bar.top)):0;
      topMask.style.height=height+'px';
      topMask.style.visibility=stuck&&height>0?'visible':'hidden';
    }
    function scheduleTopMask(){
      if(maskScheduled)return;
      maskScheduled=true;
      if(typeof raf==='function')raf(refreshTopMask);
      else refreshTopMask();
    }
    if(typeof window?.addEventListener==='function'){
      window.addEventListener('scroll',scheduleTopMask,{passive:true});
      window.addEventListener('resize',scheduleTopMask,{passive:true});
      if(window.visualViewport?.addEventListener){
        window.visualViewport.addEventListener('scroll',scheduleTopMask,{passive:true});
        window.visualViewport.addEventListener('resize',scheduleTopMask,{passive:true});
      }
    }
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
      scheduleTopMask();
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
