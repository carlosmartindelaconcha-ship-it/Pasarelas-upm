/* VWOMA — OMA calculation worker.
 * Off-load 14-channel Welch/CPSD and Hermitian eigen-decomposition from
 * the main UI thread. Same exact numerical module as synchronous fallback.
 */
'use strict';
importScripts('../signal/spectra.js?v=20261109-modular-spectra-v1',
  'efdd-core.js?v=20261117-demo14-v1');
self.onmessage=function(event){
  const payload=event.data||{};
  try{
    if(payload.action!=='compute')throw Error('Operación OMA desconocida.');
    if(!self.VWOMAEFDD)throw Error('Motor FDD/EFDD no cargado.');
    const result=self.VWOMAEFDD.compute(payload.inputs,payload.options||{});
    self.postMessage({id:payload.id,success:true,result});
  }catch(error){
    self.postMessage({id:payload.id,success:false,error:String(error?.message||error)});
  }
};