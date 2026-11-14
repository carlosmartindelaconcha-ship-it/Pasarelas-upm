/* VWOMA | Stable multi-tab navigation on mobile browsers, including Android.
 * DOM layout and scroll position belong here; scientific controllers do not.
 */
(function registerTabNavigation(root) {
  'use strict';
  const NAMES=Object.freeze(['Plan','Devices','Sync','Setups','Measure','Results','Compare']);
  function createNavigation({$,window,raf,renderComparison,onMeasureVisible=()=>{},isRecording=()=>false,onChange=()=>{}}) {
    let current=null;
    const shell=$('jointNavShell'),sentinel=$('jointNavSentinel');
    // IntersectionObserver solo activa el fondo que forma parte de la barra
    // cuando la barra realmente alcanza su posición sticky. NO crea bloques
    // blancos ni modifica dimensiones o posición durante el scroll.
    const inset=()=>{
      const v=parseFloat(window?.getComputedStyle?.(shell)?.top||'0');
      return Number.isFinite(v)?Math.max(0,v):0;
    };
    function updateSticky(){
      if(!shell||!sentinel)return;
      const hidden=shell.closest?.('[hidden]')||
        (typeof document!=='undefined'&&document.body.classList.contains('joint-measure-fixed'));
      const stuck=!hidden&&shell.getBoundingClientRect().height>0&&
        sentinel.getBoundingClientRect().top < inset()-.5;
      shell.classList.toggle('is-stuck',!!stuck);
    }
    let observer=null,observedInset=null,rafPending=false;
    function scheduleSticky(){
      if(rafPending)return;
      rafPending=true;
      const update=()=>{rafPending=false;updateSticky();};
      if(typeof raf==='function')raf(update);
      else update();
    }
    function observeSticky(){
      if(!shell||!sentinel)return;
      const targetInset=inset();
      if(observer&&observedInset===targetInset){scheduleSticky();return;}
      if(observer)observer.disconnect();
      observedInset=targetInset;
      if(typeof window?.IntersectionObserver==='function'){
        observer=new window.IntersectionObserver(scheduleSticky,{
          root:null,rootMargin:`-${targetInset}px 0px 0px 0px`,threshold:0
        });
        observer.observe(sentinel);
      }else if(!observer&&typeof window?.addEventListener==='function'){
        // Solo para navegadores muy antiguos sin IntersectionObserver.
        window.addEventListener('scroll',scheduleSticky,{passive:true});
      }
      scheduleSticky();
    }
    observeSticky();
    if(typeof window?.addEventListener==='function')
      window.addEventListener('resize',observeSticky,{passive:true});
    function tab(name,options={}) {
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
      scheduleSticky();
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
      // Only an explicit tap on a navigation tab may realign the page.
      // Programmatic transitions (e.g. acquisition finished -> Results)
      // must NEVER issue a window.scrollTo while someone is scrolling.
      // QR, camera and calibration retain their separate revealTarget calls.
      if(options.fromUser===true&&previous!==null&&name!=='Measure'&&!isRecording()&&typeof window?.scrollTo==='function') {
        const align=()=>{
          if(current!==name||isRecording())return;
          // Alinear la cabecera completa, NO el inicio de sus botones:
          // su franja blanca superior debe permanecer dentro del viewport.
          const el=$('jointNavShell');
          if(!el?.getBoundingClientRect)return;
          const y=Math.max(0,(window.scrollY||0)+el.getBoundingClientRect().top-inset());
          window.scrollTo({top:y,behavior:'instant'});
          scheduleSticky();
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
