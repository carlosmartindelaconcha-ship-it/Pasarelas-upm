/* VWOMA | Default title for an individual acceleration test, in local time. */
(function registerTestNames(root) {
  'use strict';
  function defaultTestName(date=new Date()) {
    const pad=n=>String(n).padStart(2,'0');
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+
      ' '+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds());
  }
  const api=Object.freeze({defaultTestName});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMATestNames=api;
})(globalThis);
