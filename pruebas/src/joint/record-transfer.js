/* VWOMA | Verified participant record transfer over the existing WebRTC DataChannel.
 * Original CHUNK=12000, SHA-256 integrity, ACK/retry and size limits retained.
 * The transport socket and results callbacks are dependencies, not globals.
 */
(function registerRecordTransfer(root) {
    'use strict';
    function createTransfer({s,MAX_SAMPLES,finite,send,renderResults,localRecord,uid,tell,
                             crypto,TextEncoder,Uint8Array,setTimeout,clearTimeout}) {
    async function hashText(text) {
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
    }
    function validateRecord(r,id,runId) {
        if(!r||r.schema!=='pasarelas-upm-joint-v1'||r.id!==runId||r.device?.id!==id||!Array.isArray(r.samples)||r.samples.length>MAX_SAMPLES)throw Error('Registro recibido incompatible.');
        if(!Array.isArray(r.incidents)||!r.windowMasterMs||![r.windowMasterMs.start,r.windowMasterMs.end].every(finite))throw Error('Ventana temporal no válida.');
        for(let i=0;i<r.samples.length;i++){const row=r.samples[i];if(!Array.isArray(row)||(row.length!==8&&row.length!==9)||row[0]!==i||![row[2],row[3],row[4],row[5],row[7]].every(finite)||(row.length===9&&!finite(row[8])))throw Error('Muestras recibidas no válidas.');}
    }
    async function acknowledged(p,message,index) {
        for(let attempt=0;attempt<3;attempt++) {
            if(p.channel?.readyState!=='open')throw Error('La conexión se ha cerrado. Reconecta y reenvía el registro.');
            const key=message.transferId+':'+index;
            try {
                await new Promise((resolve,reject)=>{
                    const timer=setTimeout(()=>{p.acks.delete(key);reject(Error('Sin confirmación del bloque.'));},4000);
                    p.acks.set(key,()=>{clearTimeout(timer);resolve();});
                    if(!send(p,message)){clearTimeout(timer);p.acks.delete(key);reject(Error('No se pudo enviar el bloque.'));}
                });return;
            }catch(e){if(attempt===2)throw e;}
        }
    }
    async function sendRecord() {
        if(s.role!=='guest')return;
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        if(s.transfer)throw Error('Hay una transferencia en curso.');
        const host=[...s.peers.values()][0];if(!host||host.channel?.readyState!=='open')throw Error('No hay conexión con el maestro. Descarga tus datos localmente.');
        s.transfer={percent:0};renderResults();
        try {
            const text=JSON.stringify(localRecord()),hash=await hashText(text),transferId=uid(),count=Math.ceil(text.length/12000);
            if(text.length>80000000)throw Error('Registro demasiado grande para transferir. Descárgalo localmente.');
            await acknowledged(host,{type:'TRANSFER_BEGIN',transferId,runId:s.run.id,size:text.length,count,hash},-1);
            for(let i=0;i<count;i++) {
                await acknowledged(host,{type:'TRANSFER_CHUNK',transferId,index:i,data:text.slice(i*12000,(i+1)*12000)},i);
                s.transfer.percent=Math.round(100*(i+1)/count);renderResults();
            }
            await acknowledged(host,{type:'TRANSFER_END',transferId},count);
            s.run.transferred=true;tell('El maestro ha recibido el registro y verificado su integridad.');
        }finally{s.transfer=null;renderResults();}
    }

    async function handleTransferMessage(p,m) {
        if(m.type==='TRANSFER_BEGIN'&&s.role==='host') {
            if(!s.run||s.run.id!==m.runId||!Number.isInteger(m.size)||m.size<1||m.size>80000000||!Number.isInteger(m.count)||m.count!==Math.ceil(m.size/12000)||typeof m.hash!=='string')throw Error('Transferencia no válida.');
            p.incoming={id:m.transferId,runId:m.runId,size:m.size,count:m.count,hash:m.hash,parts:[],length:0,next:0};
            send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:-1});return;
        }
        if(m.type==='TRANSFER_CHUNK'&&s.role==='host') {
            const t=p.incoming;if(!t||t.id!==m.transferId)return;
            if(m.index<t.next){send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;}
            if(m.index!==t.next||typeof m.data!=='string'||m.data.length>12000||t.length+m.data.length>t.size)throw Error('Bloque de datos no válido.');
            t.parts.push(m.data);t.length+=m.data.length;t.next++;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;
        }
        if(m.type==='TRANSFER_END'&&s.role==='host') {
            const t=p.incoming;
            if(!t||t.id!==m.transferId){if(p.completedTransfer?.id===m.transferId)send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:p.completedTransfer.count});return;}
            if(t.length!==t.size||t.next!==t.count)throw Error('Registro incompleto. Solicita el reenvío.');
            const text=t.parts.join('');if(await hashText(text)!==t.hash)throw Error('La comprobación de integridad no coincide. Reenvía el registro.');
            const record=JSON.parse(text);validateRecord(record,p.id,t.runId);
            s.results.set(p.id,record);p.completedTransfer={id:t.id,count:t.count};p.incoming=null;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:t.count});renderResults();return;
        }
        if(m.type==='TRANSFER_ACK') {const key=m.transferId+':'+m.index,resolve=p.acks.get(key);if(resolve){p.acks.delete(key);resolve();}return;}
    }

        return Object.freeze({hashText,validateRecord,acknowledged,sendRecord,handleTransferMessage});
    }
    const api=Object.freeze({createTransfer});
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.VWOMARecordTransfer=api;
})(globalThis);
