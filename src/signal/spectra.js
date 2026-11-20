/* VWOMA | Pure spectrum and FFT calculations.
 * No DOM, network, or acquisition side effects.
 * Classic browser script for compatibility; CommonJS export for Node tests.
 */
(function initialiseSpectra(root) {
    'use strict';

function calculateWelchPsd(source, component, sampleRate) {

    const numberOfWindows = 5;
    const windowLength = Math.floor(
        source.length / 3
    );

    if (windowLength < 2 || sampleRate <= 0) {
        return [];
    }

    const hopLength = Math.floor(windowLength / 2);
    const fftLength = nextPowerOfTwo(windowLength);
    const window = [];
    let windowPower = 0;

    for (let index = 0; index < windowLength; index += 1) {
        const weight = 0.5 - 0.5 * Math.cos(
            (2 * Math.PI * index) / (windowLength - 1)
        );

        window.push(weight);
        windowPower += weight * weight;
    }

    const averagedPsd =
        new Array(Math.floor(fftLength / 2) + 1).fill(0);

    for (
        let windowIndex = 0;
        windowIndex < numberOfWindows;
        windowIndex += 1
    ) {
        const start = windowIndex * hopLength;
        const real = new Array(fftLength).fill(0);
        const imag = new Array(fftLength).fill(0);

        for (let index = 0; index < windowLength; index += 1) {
            real[index] =
                (Number(source[start + index][component]) || 0) *
                window[index];
        }

        fft(real, imag);

        for (let bin = 0; bin < averagedPsd.length; bin += 1) {
            let power =
                (real[bin] * real[bin] + imag[bin] * imag[bin]) /
                (sampleRate * windowPower);

            if (bin > 0 && bin < fftLength / 2) {
                power *= 2;
            }

            averagedPsd[bin] += power;
        }
    }

    const frequencyResolution = sampleRate / fftLength;
    const maximumBin = Math.min(
        Math.floor(30 / frequencyResolution),
        averagedPsd.length - 1
    );

    return averagedPsd
        .slice(0, maximumBin + 1)
        .map(function (power, bin) {
            return {
                x: bin * frequencyResolution,
                y: power / numberOfWindows
            };
        });

}


function calculateSpectrum(source, component, sampleRate) {

    const n = nextPowerOfTwo(source.length);
    const values = new Array(n).fill(0);
    const mean = source.reduce(
        (sum, sample) => sum + sample[component],
        0
    ) / source.length;

    source.forEach((sample, index) => {
        values[index] = sample[component] - mean;
    });

    const real = values.slice();
    const imag = new Array(n).fill(0);
    fft(real, imag);

    const points = [];
    const frequencyResolution = sampleRate / n;
    const maximumBin = Math.min(
        Math.floor(30 / frequencyResolution),
        Math.floor(n / 2)
    );

    for (let k = 0; k <= maximumBin; k++) {

        let amplitude =
            Math.sqrt(real[k] ** 2 + imag[k] ** 2) / n;

        if (k > 0 && k < n / 2) {
            amplitude *= 2;
        }

        points.push({
            x: k * frequencyResolution,
            y: amplitude
        });

    }

    return points;

}


function nextPowerOfTwo(value) {

    let result = 1;

    while (result < value) {
        result *= 2;
    }

    return result;

}


function fft(real, imag) {

    const n = real.length;

    for (let i = 1, j = 0; i < n; i++) {

        let bit = n >> 1;

        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }

        j ^= bit;

        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
        }

    }

    for (let length = 2; length <= n; length <<= 1) {

        const angle = -2 * Math.PI / length;
        const wlenReal = Math.cos(angle);
        const wlenImag = Math.sin(angle);

        for (let start = 0; start < n; start += length) {

            let wReal = 1;
            let wImag = 0;
            const half = length >> 1;

            for (let offset = 0; offset < half; offset++) {

                const even = start + offset;
                const odd = even + half;
                const oddReal =
                    real[odd] * wReal - imag[odd] * wImag;
                const oddImag =
                    real[odd] * wImag + imag[odd] * wReal;

                real[odd] = real[even] - oddReal;
                imag[odd] = imag[even] - oddImag;
                real[even] += oddReal;
                imag[even] += oddImag;

                const nextWReal =
                    wReal * wlenReal - wImag * wlenImag;
                wImag =
                    wReal * wlenImag + wImag * wlenReal;
                wReal = nextWReal;

            }

        }

    }

}


    const api = Object.freeze({
        calculateWelchPsd,
        calculateSpectrum,
        nextPowerOfTwo,
        fft
    });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMASpectra = api;
        // Keep the original classic-script globals during migration.
        Object.assign(root, api);
    }
})(globalThis);
