'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
    getUniformSampleInterval, interpolateSignal, detrendSignal,
    buildProcessedSignal, calculateMovingRms
} = require('../src/signal/preprocessing.js');

const near = (a, b, epsilon = 1e-10) =>
    assert.ok(Math.abs(a - b) < epsilon, `Esperado ${b}, recibido ${a}`);

test('intervalo de muestreo: mediana de dt válidos y alternativa temporal', () => {
    near(getUniformSampleInterval([{time:0,dt:0.02}, {time:0.1,dt:0.01},
        {time:0.2,dt:NaN}, {time:0.3,dt:0.03}]),0.02);
    near(getUniformSampleInterval([{time:3}, {time:3.5}, {time:4}]),0.5);
});

test('interpolación lineal con tiempos no uniformes y límites', () => {
    const samples=[{time:0,ax:2},{time:0.25,ax:6},{time:1.0,ax:10}];
    near(interpolateSignal(samples,0.125,'ax',0),4);
    near(interpolateSignal(samples,0.625,'ax',0),8);
    near(interpolateSignal(samples,-1,'ax',0),2);
    near(interpolateSignal(samples,2,'ax',0),10);
});

test('detrend elimina desplazamiento y pendiente sin alterar la entrada', () => {
    const samples=Array.from({length:9},(_,i)=>({time:i*0.125,ax:7+3*i*0.125}));
    const output=detrendSignal(samples,'ax');
    assert.equal(output.length,samples.length);
    output.forEach(v=>near(v.value,0));
    near(samples[0].ax,7);
    near(samples[8].ax,10);
});

test('remuestreo a intervalos regulares y eliminación de tendencia por eje', () => {
    const source=[
        {time:4,dt:0.25,ax:5,ay:-3,az:10},
        {time:4.25,dt:0.25,ax:5.5,ay:-2.75,az:9.75},
        {time:4.5,dt:0.25,ax:6,ay:-2.5,az:9.5},
        {time:4.75,dt:0.25,ax:6.5,ay:-2.25,az:9.25}
    ];
    const processed=buildProcessedSignal(source);
    assert.equal(processed.length,4);
    processed.forEach((s,i)=>{
        near(s.time,i*.25);
        near(s.dt,.25);
        for(const axis of ['ax','ay','az'])near(s[axis],0);
    });
    assert.equal(buildProcessedSignal([]).length,0);
    near(source[0].ax,5);
});

test('RMS móvil conserva la ventana temporal y la entrada', () => {
    const input=[
        {time:0,ax:3,ay:0,az:0},{time:1,ax:4,ay:0,az:2},
        {time:2,ax:0,ay:0,az:0},{time:3,ax:0,ay:0,az:0}
    ];
    const values=calculateMovingRms(input,2);
    assert.equal(values.length,4);
    near(values[0].ax,3);
    near(values[1].ax,Math.sqrt(12.5));
    near(values[2].ax,Math.sqrt(8));
    near(values[3].ax,0);
    near(values[1].az,Math.sqrt(2));
    assert.equal(calculateMovingRms([],2).length,0);
    near(input[0].ax,3);
});

test('la versión para navegador conserva las funciones originales', () => {
    const browser={};
    const script=fs.readFileSync(path.join(__dirname,'../src/signal/preprocessing.js'),'utf8');
    vm.runInNewContext(script,browser);
    for(const name of ['getUniformSampleInterval','interpolateSignal','detrendSignal',
        'buildProcessedSignal','calculateMovingRms']){
        assert.equal(typeof browser[name],'function',name);
        assert.equal(browser[name],browser.VWOMAPreprocessing[name]);
    }
});
