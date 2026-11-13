/* Scroll the nearest visible context to an action that just became available. */
(function registerScrollNavigation(root) {
    'use strict';
    function revealTarget(target, position='start') {
        if (!target || target.hidden || typeof target.getBoundingClientRect!=='function') return false;
        const doc=target.ownerDocument || (typeof document!=='undefined'?document:null);
        const view=doc?.defaultView || (typeof window!=='undefined'?window:null);
        if (!view || doc?.body?.classList?.contains('recording-lock')) return false;
        const reduced=typeof view.matchMedia==='function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior=reduced?'auto':'smooth';
        const center=position==='center';
        const align=()=>{
            if (target.hidden || target.isConnected===false || doc?.body?.classList?.contains('recording-lock')) return;
            const rect=target.getBoundingClientRect();
            if (rect.width===0 && rect.height===0) return;
            const dialog=typeof target.closest==='function'?target.closest('dialog[open]'):null;
            if (dialog?.open) {
                // A modal dialog has its own scrollable viewport. Never scroll the page behind it.
                const topInDialog=rect.top-dialog.getBoundingClientRect().top+(dialog.scrollTop||0);
                const inset=center?Math.max(14,(dialog.clientHeight-rect.height)/2):18;
                const maxTop=Math.max(0,dialog.scrollHeight-dialog.clientHeight);
                const top=Math.min(maxTop,Math.max(0,topInDialog-inset));
                if (typeof dialog.scrollTo==='function') dialog.scrollTo({top,behavior});
                else dialog.scrollTop=top;
                return;
            }
            if (typeof view.scrollTo!=='function') return;
            const tabs=doc?.getElementById?.('jointTabs');
            const sticky=tabs&&!tabs.hidden&&view.getComputedStyle?.(tabs)?.position==='sticky'
                ?tabs.getBoundingClientRect().height||0:0;
            const inset=center?Math.max(14,(view.innerHeight-rect.height)/2):sticky+14;
            const top=Math.max(0,(view.scrollY||view.pageYOffset||0)+rect.top-inset);
            view.scrollTo({top,behavior});
        };
        if (typeof view.requestAnimationFrame==='function') view.requestAnimationFrame(align);
        else align();
        return true;
    }
    const api=Object.freeze({revealTarget});
    if (typeof module==='object' && module.exports) module.exports=api;
    else root.VWOMAScrollNavigation=api;
})(globalThis);
