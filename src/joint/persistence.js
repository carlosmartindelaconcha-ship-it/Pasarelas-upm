/* VWOMA | IndexedDB acquisition persistence and recovery.
 * Preserve the 'runs'/'chunks' stores, record schemas, chunk keys and
 * batched writing semantics. The database name and browser APIs are injected.
 * UI for browsing recovered runs stays in joint-app.js.
 */
(function registerPersistence(root) {
    'use strict';
    function createPersistence({s, runMeta, incident, tell, databaseName, indexedDB,
                                IDBKeyRange, structuredClone, setTimeout, clearTimeout}) {
    // Local durable chunks. Sensor callbacks only push to memory; storage is batched.
    async function db() {
        if(s.db)return s.db;
        s.db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open(databaseName,1);
            req.onupgradeneeded=()=>{req.result.createObjectStore('runs',{keyPath:'key'});req.result.createObjectStore('chunks',{keyPath:'key'});};
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        });return s.db;
    }
    async function storeBatch(run,rows,index) {
        const database=await db();
        await new Promise((resolve,reject)=>{
            const tx=database.transaction(['runs','chunks'],'readwrite');
            tx.objectStore('runs').put({key:run.id+':'+run.device.id,meta:runMeta(run)});
            if(rows.length)tx.objectStore('chunks').put({key:run.id+':'+run.device.id+':'+String(index).padStart(8,'0'),rows});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Guardado interrumpido'));
        });
    }
    function persist(run=s.run) {
        if(!run)return s.writeChain;
        if(run.device.role==='guest') run.sync=structuredClone(s.syncLog);
        const start=run.persisted||0,rows=run.samples.slice(start);run.persisted=run.samples.length;
        const index=run.chunkIndex||0;run.chunkIndex=index+1;
        s.writeChain=s.writeChain.then(()=>storeBatch(run,rows,index)).catch(e=>{
            if(!s.storageFailed){s.storageFailed=true;incident('storage','Guardado local fallido: '+e.message);tell('No se pudo guardar en el navegador. Conserva la página abierta y descarga el registro.',true);}
        });return s.writeChain;
    }
    async function persistBeforeClosing(run) {
        // IndexedDB puede quedar pendiente en móviles cuando el navegador cambia de
        // estado. Nunca debe impedir cerrar bien un ensayo ni arrancar el siguiente.
        let timer;
        try {
            await Promise.race([
                persist(run),
                new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('El guardado local tardó demasiado.')),8000);})
            ]);
        } catch(error) {
            s.storageFailed=true;incident('storage',error.message);
            s.writeChain=Promise.resolve();
            tell('El guardado local sigue pendiente. El registro permanece en memoria: descárgalo antes de cerrar.',true);
        } finally {clearTimeout(timer);}
    }

        async function storedRuns() {
            const database=await db();
            return await new Promise((resolve,reject)=>{
                const req=database.transaction('runs').objectStore('runs').getAll();
                req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
            });
        }
        async function storedChunks(key) {
            const database=await db();
            const range=IDBKeyRange.bound(key+':',key+':\uffff');
            return await new Promise((resolve,reject)=>{
                const req=database.transaction('chunks').objectStore('chunks').getAll(range);
                req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
            });
        }
        return Object.freeze({db, storeBatch, persist, persistBeforeClosing, storedRuns, storedChunks});
    }
    const api=Object.freeze({createPersistence});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMAPersistence=api;
})(globalThis);
