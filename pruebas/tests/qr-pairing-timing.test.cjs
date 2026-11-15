'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTransport}=require('../src/joint/webrtc-transport.js');
const app=fs.readFileSync(path.join(__dirname,'../src/joint/joint-app.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../src/joint/webrtc-transport.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fixture(){
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,{
      value:'',textContent:'',hidden:true,replaceChildren(){this.innerHTML='';},innerHTML:'',disabled:false
    });
    return elements.get(id);
  };
  const s={role:'guest',pendingOffer:{host:'host'},peers:new Map(),qrPages:[],qrPageIndex:0,
    qrPageTimer:null,qrInbound:null};
  const transport=createTransport({
    s,VERSION:4,STUN_SERVERS:[],MAX_PEERS:8,MAX_TOKEN:50000,MAX_MESSAGE:90000,
    QR_CHUNK_SIZE:430,MAX_QR_PAGES:256,uid:()=> 'a1b2c3d4e5f6',now:()=>100,
    finite:Number.isFinite,$,running:()=>false,tell:()=>{},incident:()=>{},
    guard:fn=>fn,tab:()=>{},open:()=>{},workspace:()=>{},requireHostEdit:()=>{},
    localStatus:()=>{},renderDevices:()=>{},savePlan:()=>{},renderPlan:()=>{},
    startSync:()=>{},onMessage:()=>{},revealActionTarget:()=>{}
  });
  return {s,$,transport};
}
test('las páginas QR grandes del laboratorio reducen la cantidad a escanear',()=>{
  assert.match(app,/QR_CHUNK_SIZE = 430/);
  assert.match(source,/setInterval\(\(\)=>\{s\.qrPageIndex=[^;]+;renderQrPage\(\);\},2300\)/);
  assert.match(source,/createSvgTag\(\{cellSize:4,margin:3,scalable:true\}\)/);
  const {transport}=fixture();
  const token='J1z.'+'a'.repeat(1290);
  const pages=transport.qrTransferPages(token);
  assert.equal(pages.length,4);
  const oldPageCount=Math.ceil(token.length/175);
  assert.ok(pages.length<oldPageCount);
  assert.ok(pages.every(p=>p.startsWith('JQ1.')));
});
test('los fragmentos QR, incluso desordenados, reconstruyen la respuesta original',()=>{
  const {transport}=fixture();
  const code='J1z.'+'c'.repeat(1710);
  const pages=transport.qrTransferPages(code);
  let token=null;
  for(const page of [...pages].reverse())token=transport.acceptQrPage(page);
  assert.equal(token,code);
});
test('una respuesta con sello temporal se decodifica sin cambiar la versión ni el SDP',async()=>{
  const {transport}=fixture();
  const generatedAt=Date.now();
  const payload={
    v:4,kind:'answer',network:'local',session:'campana',host:'host',peer:'guest',
    expires:generatedAt+60000,generatedAt,
    sdp:{type:'answer',sdp:'v=0\r\na=candidate:1 1 udp 100 172.20.10.3 60595 typ host\r\n'}
  };
  const code=await transport.encodeToken(payload);
  assert.match(code,/^J1z?\./);
  const decoded=await transport.decodeToken(code);
  assert.equal(decoded.v,4);
  assert.equal(decoded.generatedAt,generatedAt);
  assert.equal(decoded.sdp.sdp,payload.sdp.sdp);
});
test('el maestro obtiene la edad de la respuesta y el participante ve tiempo hasta ICE failed',()=>{
  assert.match(source,/generatedAt:Date\.now\(\)/);
  assert.match(source,/p\.answerQrAgeMs=Date\.now\(\)-t\.generatedAt/);
  assert.match(source,/p\.guestAnswerShownAt=now\(\)/);
  assert.match(source,/tiempo desde QR de respuesta/);
  assert.match(source,/relojes de ambos móviles/);
});
test('escáner usa el ritmo y resolución probados en Safari sin alterar la adquisición',()=>{
  assert.match(source,/if\(frameAt-lastScanAt<125\)/);
  assert.match(source,/Math\.min\(1,760\/video\.videoWidth\)/);
  assert.match(html,/webrtc-transport\.js\?v=20261115-fase1-lab-replacement-v1/);
  assert.match(html,/joint-app\.js\?v=20261115-qr-pair-lab-v1/);
});
