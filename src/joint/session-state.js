/* VWOMA | Independent joint-session state, no DOM or network.
 * A new mutable state is allocated for each coordinator instance.
 */
(function registerJointState(root) {
    'use strict';
    function createState(uid) {
        if(typeof uid!=='function')throw TypeError('Se requiere un generador de identificadores.');
        return {
        id: uid(), name: 'Mi móvil', role: null, session: null, peers: new Map(),
        plan: {length:30, width:3, name:'Ensayo multipunto', points:[]}, selected:null,
        sensor:false, sensorEnabled:false, sensorSource:'', lastSample:0, recent:[], rateTimes:[],
        calibration:{map:{},active:null,complete:false,guidePhase:'idle'},
        run:null, pending:null, results:new Map(), preview:[], transfer:null,
        scan:null, scanFrame:null, currentInvite:null, pairBusy:false, capturePermission:false,
        pendingOffer:null, qrPages:[], qrPageIndex:0, qrPageTimer:null, qrInbound:null,
        lastPairDiagnostic:'', drag:null, planView:null, planPan:null, planPointers:new Map(), planPinch:null, planTapStart:null, lastPlanTap:null, rowSwipe:null,
        syncModel:{offset:0, drift:0, reference:0, rtt:null, count:0, updated:0},
        syncLog:[], incidents:[], db:null, writeChain:Promise.resolve(), persistedCount:0,
        storageFailed:false, uiTick:0, wake:null, returnTo:null, transaction:null,
        compareExport:null, compareCharts:[], jointCharts:{time:null,spectrum:null},
        syncCharts:[], syncView:{bins:12,focus:{}},
        syncCalibration:{phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0},
        duringSyncTimer:null
    };
    }
    const api=Object.freeze({createState});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAJointState=api;
})(globalThis);
