'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createPersistence}=require('../src/joint/persistence.js');

function fixture({failedOpen=false,databaseName='upm-joint-v1',forceTimeout=false}={}) {
  const stores={runs:new Map(),chunks:new Map()};
  const names=[],notices=[],incidents=[],initialized=[];
  const database={
    createObjectStore(name,{keyPath}={}) {
      initialized.push([name,keyPath]);
      if(!stores[name]) stores[name]=new Map();
      return stores[name];
    },
    transaction(which,mode) {
      const tx={oncomplete:null,onerror:null,onabort:null};
      let scheduled=false;
      tx.objectStore=name=>{
        assert.ok(stores[name], 'missing IndexedDB store: '+name);
        return {
          put:value=>{
            stores[name].set(value.key,structuredClone(value));
            if(!scheduled) {
              scheduled=true;
              queueMicrotask(()=>tx.oncomplete?.());
            }
          },
          getAll:range=>{
            const request={onsuccess:null,onerror:null,result:null};
            queueMicrotask(()=>{
              request.result=[...stores[name].values()]
                .filter(row=>!range||(row.key>=range.lower&&row.key<=range.upper))
                .sort((a,b)=>a.key.localeCompare(b.key))
                .map(row=>structuredClone(row));
              request.onsuccess?.();
            });
            return request;
          }
        };
      };
      return tx;
    }
  };
  const idb={
    open:(name,version)=>{
      names.push([name,version]);
      const request={result:database,error:new Error('mock IndexedDB unavailable')};
      queueMicrotask(()=>{
        if(failedOpen)request.onerror?.();
        else {request.onupgradeneeded?.();request.onsuccess?.();}
      });
      return request;
    }
  };
  const state={db:null,run:null,writeChain:Promise.resolve(),storageFailed:false,
    syncLog:[{offset:17,local:125}],persistedCount:0};
  const metadata=run=>({id:run.id,created:run.created,device:{...run.device},
    state:run.state||'recording'});
  const makeRun=(role='host')=>({
    id:'run-1',created:'2026-11-09T08:00:00.000Z',
    device:{id:'mobile-1',name:'iPhone',role},
    samples:[[0,1,2],[3,4,5]],persisted:0,chunkIndex:0
  });
  let nextTimeout=1;
  const timers=new Map();
  const schedule=(callback,ms)=>{
    assert.equal(ms,8000);
    const id=nextTimeout++;
    timers.set(id,callback);
    if(forceTimeout)queueMicrotask(()=>callback());
    return id;
  };
  const cancel=id=>timers.delete(id);
  const persistence=createPersistence({
    s:state,runMeta:metadata,incident:(...args)=>incidents.push(args),
    tell:(...args)=>notices.push(args),databaseName,indexedDB:idb,
    IDBKeyRange:{bound:(lower,upper)=>({lower,upper})},
    structuredClone,setTimeout:schedule,clearTimeout:cancel
  });
  return {persistence,state,stores,names,initialized,notices,incidents,makeRun,timers};
}

test('crea el mismo esquema runs/chunks y reutiliza la conexión',async()=>{
  const x=fixture();
  const first=await x.persistence.db(),second=await x.persistence.db();
  assert.equal(first,second);
  assert.deepEqual(x.names,[['upm-joint-v1',1]]);
  assert.deepEqual(x.initialized,[['runs','key'],['chunks','key']]);
  await x.persistence.persist();
  assert.equal(x.stores.runs.size,0);
});

test('guarda metadatos y muestras incrementalmente en lotes ordenados',async()=>{
  const x=fixture(),run=x.makeRun();
  x.state.run=run;
  await x.persistence.persist();
  assert.equal(run.persisted,2);
  assert.equal(run.chunkIndex,1);
  assert.equal(x.stores.runs.get('run-1:mobile-1').meta.id,'run-1');
  assert.deepEqual(x.stores.chunks.get('run-1:mobile-1:00000000').rows,[[0,1,2],[3,4,5]]);
  run.samples.push([6,7,8]);
  await x.persistence.persist(run);
  assert.deepEqual(x.stores.chunks.get('run-1:mobile-1:00000001').rows,[[6,7,8]]);
  assert.equal(run.persisted,3);
  await x.persistence.persist(run);
  assert.equal(x.stores.chunks.size,2,'no genera un lote vacío');
  assert.equal(run.chunkIndex,3,'mantiene el índice original por intento');
  assert.equal(x.stores.runs.size,1);
  assert.equal(x.notices.length,0);
});

test('conserva el registro de sincronización del participante y no muta el origen',async()=>{
  const x=fixture(),run=x.makeRun('guest');
  x.state.run=run;
  await x.persistence.persist();
  assert.deepEqual(run.sync,x.state.syncLog);
  assert.notEqual(run.sync,x.state.syncLog);
  assert.equal(x.stores.runs.get('run-1:mobile-1').meta.device.role,'guest');
});

test('recupera registros y los lotes en orden de clave, sin mezclar móviles',async()=>{
  const x=fixture(),first=x.makeRun();
  x.state.run=first;
  await x.persistence.persist();
  first.samples.push([6,7,8]);
  await x.persistence.persist();
  const second={...x.makeRun(),id:'run-2',created:'2026-11-10T08:00:00.000Z',
    device:{id:'mobile-2',name:'Android',role:'host'},samples:[[9,10,11]],
    persisted:0,chunkIndex:0};
  x.state.run=second;
  await x.persistence.persist();
  const entries=await x.persistence.storedRuns();
  assert.equal(entries.length,2);
  const records=await x.persistence.storedChunks('run-1:mobile-1');
  assert.equal(records.length,2);
  assert.deepEqual(records.flatMap(v=>v.rows),[[0,1,2],[3,4,5],[6,7,8]]);
  assert.deepEqual((await x.persistence.storedChunks('run-2:mobile-2')).flatMap(v=>v.rows),[[9,10,11]]);
  assert.deepEqual(await x.persistence.storedChunks('missing:device'),[]);
});

test('permite cambiar exclusivamente el nombre de la base de pruebas',async()=>{
  const x=fixture({databaseName:'upm-joint-vwoma-preview-v1'});
  await x.persistence.db();
  assert.equal(x.names[0][0],'upm-joint-vwoma-preview-v1');
});

test('notifica un fallo de IndexedDB una sola vez y mantiene las muestras en memoria',async()=>{
  const x=fixture({failedOpen:true}),run=x.makeRun();
  x.state.run=run;
  await x.persistence.persist();
  await x.persistence.persist();
  assert.equal(x.state.storageFailed,true);
  assert.equal(x.notices.length,1);
  assert.equal(x.incidents.length,1);
  assert.match(x.notices[0][0],/No se pudo guardar/);
  assert.equal(run.samples.length,2);
});

test('el cierre no queda bloqueado si IndexedDB tarda más de ocho segundos',async()=>{
  const x=fixture({forceTimeout:true}),run=x.makeRun();
  await x.persistence.persistBeforeClosing(run);
  assert.equal(x.state.storageFailed,true);
  assert.equal(x.timers.size,0);
  assert.match(x.notices.at(-1)[0],/pendiente/);
  assert.equal(x.incidents.at(-1)[0],'storage');
});

test('la misma implementación se expone como script clásico para Safari',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../src/joint/persistence.js'),'utf8');
  const browser={};
  vm.runInNewContext(script,browser);
  assert.equal(typeof browser.VWOMAPersistence.createPersistence,'function');
});
