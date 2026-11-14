'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('device list updates in place, not via once-per-second innerHTML rebuild',()=>{
    const src=read('src/joint/joint-app.js');
    assert.match(src,/function patchDeviceMarkup\(container,markup\)/);
    assert.match(src,/patchDeviceMarkup\(\$\('jointDevices'\),html\)/);
    assert.doesNotMatch(src,/\$\('jointDevices'\)\.innerHTML\s*=/);
    assert.match(src,/if\(current\.nodeValue!==wanted\.nodeValue\)current\.nodeValue=wanted\.nodeValue/);
});

test('hidden calibration panels are not updated every 250 ms',()=>{
    const src=read('src/joint/joint-app.js');
    const tick=src.split('function tick() {')[1]?.split('function resetSession()')[0];
    assert.ok(tick);
    assert.match(tick,/if\(!\$\('jointPanelSync'\)\.hidden\)renderSyncCalibration\(\)/);
});

test('sync text nodes are preserved while the value stays unchanged',()=>{
    const src=read('src/joint/calibration-controller.js');
    assert.match(src,/const syncTextCache=new WeakMap\(\)/);
    assert.match(src,/if\(syncTextCache\.get\(element\)===value\)return/);
    assert.match(src,/stableSyncText\(instruction,instructionText\)/);
});

test('mobile browser overscroll is contained without disabling native scroll',()=>{
    const css=read('style.css');
    assert.match(css,/html\.vwoma-android\.joint-workspace-active,[\s\S]*?overscroll-behavior-y:\s*contain;/);
    assert.match(read('src/joint/joint-app.js'),/\/Android\/i\.test\(navigator\.userAgent\|\|''\)/);
    assert.doesNotMatch(css,/html\.joint-workspace-active,[\s\S]*?overflow-anchor\s*:\s*none/);
});

test('changes remain isolated to the preview directory',()=>{
    const src=read('index.html');
    assert.match(src,/src\/joint\/joint-app\.js\?v=20261114-android-dom-stable-v2/);
});
