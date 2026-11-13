/* VWOMA | One opt-in chart-value indicator across individual and joint plots.
 * Do not modify data, zoom ranges, file formats or acquisition timing.
 */
(function registerChartTooltips(root) {
  'use strict';
  function createController({Chart,document,storage,storageKey='vwoma.chart-values.preview.v1'}={}) {
    let visible=false;
    try { visible=storage?.getItem(storageKey)==='on'; } catch (_) {}
    function charts() {
      const instances=Chart?.instances;
      if(!instances)return [];
      return instances instanceof Map?[...instances.values()]:Object.values(instances);
    }
    function updateButtons() {
      document?.querySelectorAll?.('[data-vwoma-tooltip-toggle]').forEach(button=>{
        button.textContent=visible?'Valores: visibles':'Valores: ocultos';
        button.setAttribute('aria-pressed',String(visible));
        button.setAttribute('aria-label',visible?'Ocultar valores en todas las gráficas':'Mostrar valores al tocar las gráficas');
        button.title=visible?'Ocultar indicadores de valores':'Mostrar indicadores de valores';
      });
    }
    function updateCharts() {
      if(Chart?.defaults) {
        Chart.defaults.plugins ||= {};
        Chart.defaults.plugins.tooltip ||= {};
        Chart.defaults.plugins.tooltip.enabled=visible;
      }
      for(const chart of charts()) {
        if(!chart?.options)continue;
        chart.options.plugins ||= {};
        chart.options.plugins.tooltip ||= {};
        chart.options.plugins.tooltip.enabled=visible;
        if(!visible) {
          chart.setActiveElements?.([]);
          chart.tooltip?.setActiveElements?.([],{x:0,y:0});
        }
        chart.update?.('none');
      }
    }
    function setEnabled(value) {
      visible=!!value;
      try {storage?.setItem(storageKey,visible?'on':'off');} catch (_) {}
      updateCharts();updateButtons();
      return visible;
    }
    function mount() {
      updateCharts();
      document?.querySelectorAll?.('[data-vwoma-tooltip-toggle]').forEach(button=>
        button.addEventListener('click',()=>setEnabled(!visible)));
      updateButtons();
    }
    return Object.freeze({isEnabled:()=>visible,setEnabled,mount});
  }
  const api=Object.freeze({createController});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    const controller=createController({Chart:root.Chart,document:root.document,storage:root.localStorage});
    root.VWOMAChartTooltips=controller;
    controller.mount();
  }
})(globalThis);
