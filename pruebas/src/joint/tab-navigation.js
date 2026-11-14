/* VWOMA | Stable multi-tab navigation on mobile browsers, including Android.
 * DOM layout and scroll position belong here; scientific controllers do not.
 */
(function registerTabNavigation(root) {
  'use strict';
  const NAMES=Object.freeze(['Plan','Devices','Sync','Measure','Results','Compare']);
  function createNavigation({$,window,raf,renderComparison,onMeasureVisible=()=>{},isRecording=()=>false,onChange=()=>{}}) {
    let current=null;
    // Barra horizontal: mantiene un fondo BLANCO real hasta su borde superior.
    // El velo se traslada a document.body: dentro del panel, iOS Safari puede
    // recortarlo o componerlo por debajo del contenido anterior al sticky.
    const tabs=$('jointTabs'),topMask=$('jointTabsTopMask');
    if(topMask && typeof document!=='undefined' && document.body &&
        topMask.parentElement!==document.body)document.body.appendChild(topMask);
    let maskScheduled=false;
    function refreshTopMask(){
      maskScheduled=false;
      if(!tabs||!topMask)return;
      const workspace=$('jointWorkspace'),app=$('jointApp');
      if(workspace?.hidden||app?.hidden||
          (typeof document!=='undefined'&&document.body.classList.contains('joint-measure-fixed'))){
        topMask.style.visibility='hidden';
        topMask.style.height='0px';
        return;
      }
      const bar=tabs.getBoundingClientRect();
      const viewportHeight=window?.visualViewport?.height||window?.innerHeight||800;
      // No esperar a que Safari reconozca el elemento como sticky:
      // los textos de antes de las pestañas también deben quedar tapados.
      // Activar solo cuando la barra entra en la franja superior visible,
      // evitando ocultar la cabecera y formularios al iniciar una sesión.
      const nearTop=bar.bottom>0&&bar.top<=Math.min(280,viewportHeight*.44)&&bar.top>=0;
      const height=nearTop?Math.max(0,Math.ceil(bar.top)):0;
      topMask.style.height=height+'px';
      topMask.style.visibility=height>0?'visible':'hidden';
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
    $('jointExit')?.addEventListener?.('click',()=>{
      if(topMask){topMask.style.visibility='hidden';topMask.style.height='0px';}
    });
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
