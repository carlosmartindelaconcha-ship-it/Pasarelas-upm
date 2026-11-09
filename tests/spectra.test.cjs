'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSpectrum, calculateWelchPsd, nextPowerOfTwo, fft } =
  require('../src/signal/spectra.js');

test('FFT: transform of unit impulse has unit amplitude at all bins', () => {
  const real = [1, 0, 0, 0];
  const imaginary = [0, 0, 0, 0];
  fft(real, imaginary);
  assert.deepEqual(real, [1, 1, 1, 1]);
  assert.deepEqual(imaginary, [0, 0, 0, 0]);
  assert.equal(nextPowerOfTwo(0), 1);
  assert.equal(nextPowerOfTwo(17), 32);
});

test('amplitude spectrum preserves the frequency and amplitude of a clean sine', () => {
  const fs = 128;
  const count = 512;
  const target = 8;
  const samples = Array.from({ length: count }, (_, i) => ({
    ax: Math.sin(2 * Math.PI * target * i / fs),
    ay: 0,
    az: 0
  }));
  const points = calculateSpectrum(samples, 'ax', fs);
  const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
  assert.equal(peak.x, target);
  assert.ok(Math.abs(peak.y - 1) < 1e-10, `amplitud calculada: ${peak.y}`);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('Welch PSD reports positive power near a known sine frequency', () => {
  const fs = 128;
  const target = 8;
  const count = 1024;
  const samples = Array.from({ length: count }, (_, i) => ({
    ax: Math.sin(2 * Math.PI * target * i / fs)
  }));
  const points = calculateWelchPsd(samples, 'ax', fs);
  const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
  const df = fs / nextPowerOfTwo(Math.floor(count / 3));
  const totalVariance = points.reduce((sum, point) => sum + point.y * df, 0);
  assert.ok(Math.abs(peak.x - target) <= df, `pico: ${peak.x} Hz`);
  assert.ok(totalVariance > 0.4 && totalVariance < 0.6, `potencia integrada: ${totalVariance}`);
  assert.ok(points.every(p => p.x >= 0 && p.x <= 30 && p.y >= 0 && Number.isFinite(p.y)));
});

test('browser classic script preserves the original global function names', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/signal/spectra.js'), 'utf8');
  const browser = {};
  vm.runInNewContext(source, browser);
  for (const name of ['fft', 'nextPowerOfTwo', 'calculateSpectrum', 'calculateWelchPsd']) {
    assert.equal(typeof browser[name], 'function', `falta ${name}`);
    assert.equal(browser[name], browser.VWOMASpectra[name]);
  }
});
