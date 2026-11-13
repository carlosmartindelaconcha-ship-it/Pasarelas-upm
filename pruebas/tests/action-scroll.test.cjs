'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {revealTarget}=require('../src/joint/scroll-navigation.js');
function fixture({dialog=false,reduced=false,recording=false,hidden=false,stale=false}={}) {
    const calls=[];
    const modal={open:true,clientHeight:440,scrollHeight:1200,scrollTop:60,
        getBoundingClientRect:()=>({top:120,height:440}),
        scrollTo:value=>calls.push(['modal',value])};
    const tabs={hidden:false,getBoundingClientRect:()=>({height:58})};
    const view={scrollY:120,innerHeight:720,
        matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({position:'sticky'}),
        requestAnimationFrame:fn=>fn(),scrollTo:value=>calls.push(['page',value])};
    const doc={defaultView:view,body:{classList:{contains:()=>recording}},getElementById:()=>tabs};
    const target={hidden,isConnected:!stale,ownerDocument:doc,
        getBoundingClientRect:()=>({top:520,height:220,width:320}),
        closest:()=>dialog?modal:null};
    return {calls,target};
}
test('calibration image scrolls below the sticky tabs without hiding it',()=>{
    const f=fixture();assert.equal(revealTarget(f.target,'start'),true);
    assert.deepEqual(f.calls,[['page',{top:568,behavior:'smooth'}]]);
});
test('the QR camera scrolls only its own open dialog, and is centered',()=>{
    const f=fixture({dialog:true});revealTarget(f.target,'center');
    assert.deepEqual(f.calls,[['modal',{top:350,behavior:'smooth'}]]);
});
test('reduced motion uses an instant move instead of smooth animation',()=>{
    const f=fixture({reduced:true});revealTarget(f.target,'start');
    assert.equal(f.calls[0][1].behavior,'auto');
});
test('no scroll when measuring, hidden, or already detached',()=>{
    for(const settings of [{recording:true},{hidden:true},{stale:true}]){
        const f=fixture(settings);revealTarget(f.target);
        assert.equal(f.calls.length,0);
    }
});
test('the QR generation and camera opening are connected to the scroll helper',()=>{
    const src=fs.readFileSync(path.join(__dirname,'../src/joint/webrtc-transport.js'),'utf8');
    assert.match(src,/renderQrPage\(\);\s*revealActionTarget\('jointQr','center'\)/);
    assert.match(src,/await video\.play\(\);\s*\/\/[^\n]*\n\s*revealActionTarget\('jointScanner','center'\)/);
    const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
    assert.match(html,/src\/joint\/scroll-navigation\.js\?v=20261113-reveal-actions-v1/);
});
