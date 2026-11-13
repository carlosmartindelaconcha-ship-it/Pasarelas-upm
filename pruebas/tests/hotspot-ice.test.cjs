'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {IP,withHotspotCandidates}=require('../src/joint/hotspot-ice.js');
const t=fs.readFileSync(path.join(__dirname,'../src/joint/webrtc-transport.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const sdp='v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
  'a=candidate:hostX 1 udp 2122260223 phone.local 40101 typ host\r\n'+
  'a=candidate:hostY 1 udp 2122260223 10.210.217.193 43561 typ host\r\n'+
  'a=candidate:stun1 1 udp 1677729535 5.64.188.93 60173 typ srflx raddr 0.0.0.0 rport 0\r\n'+
  'a=end-of-candidates\r\n';
test('adds all remote UDP ports to the gateway and retains every original candidate',()=>{
  const input={type:'offer',sdp},result=withHotspotCandidates(input,true);
  assert.equal(result.added,3);assert.equal(result.remotePorts,3);
  for(const port of [40101,43561,60173])assert.ok(result.description.sdp.includes(IP+' '+port+' typ host'));
  for(const candidate of sdp.split('\r\n').filter(x=>x.startsWith('a=candidate:')))
      assert.ok(result.description.sdp.includes(candidate));
  assert.ok(result.description.sdp.indexOf('a=candidate:ihot3')<result.description.sdp.indexOf('a=end-of-candidates'));
  assert.equal(input.sdp,sdp);
});
test('disabled case preserves SDP object exactly',()=>{
  const desc={type:'offer',sdp},r=withHotspotCandidates(desc,false);
  assert.equal(r.description,desc);assert.equal(r.added,0);
});
test('same port/component and existing hotspot candidate are deduplicated',()=>{
  const text='m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+
    'a=candidate:a 1 udp 100 phone.local 40101 typ host\r\n'+
    'a=candidate:b 1 udp 100 other.local 40101 typ host\r\n'+
    'a=candidate:c 1 udp 100 172.20.10.1 43561 typ host\r\n'+
    'a=candidate:d 1 udp 100 other.local 43561 typ host\r\n';
  const result=withHotspotCandidates({type:'answer',sdp:text},true);
  assert.equal(result.added,1);
});
test('never guesses TCP ports and preserves ICE component/port with lower priority',()=>{
  const tcp=withHotspotCandidates({type:'answer',sdp:'a=candidate:a 1 tcp 1 myphone.local 9 typ host tcptype passive'},true);
  assert.equal(tcp.added,0);
  const udp=withHotspotCandidates({type:'answer',sdp},true);
  assert.match(udp.description.sdp,/a=candidate:ihot1 1 udp 2122260222 172\.20\.10\.1 40101 typ host/);
});
test('optional gateway candidates are added to both remote SDP paths, never QR tokens',()=>{
  assert.equal((t.match(/await setRemoteDescriptionWithHotspot\(p,t\.sdp\);/g)||[]).length,2);
  assert.match(t,/const enabled=isIOS && p\.network==='local'/);
  assert.match(t,/return p\.pc\.setRemoteDescription\(description\)/);
  assert.ok(html.indexOf('hotspot-ice.js')<html.indexOf('webrtc-transport.js'));
});
