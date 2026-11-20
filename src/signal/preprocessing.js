/* VWOMA | Sample interpolation, linear detrending, uniform resampling and RMS.
 * These pure numerical functions are intentionally unchanged from the legacy app.
 * Classic-script namespace in browsers; CommonJS exports for deterministic tests.
 */
(function initialisePreprocessing(root) {
    'use strict';

function getUniformSampleInterval(data) {

    const intervals = data
        .map(function (sample) {
            return Number(sample.dt);
        })
        .filter(function (value) {
            return Number.isFinite(value) && value > 0;
        })
        .sort(function (a, b) {
            return a - b;
        });

    if (intervals.length > 0) {
        return intervals[Math.floor(intervals.length / 2)];
    }

    const duration =
        data[data.length - 1].time - data[0].time;

    return duration > 0
        ? duration / Math.max(data.length - 1, 1)
        : 1 / 60;

}


function interpolateSignal(data, time, component, startIndex) {

    let index = startIndex;

    while (
        index < data.length - 2 &&
        data[index + 1].time < time
    ) {
        index += 1;
    }

    const first = data[index];
    const second = data[Math.min(index + 1, data.length - 1)];
    const interval = second.time - first.time;

    if (!Number.isFinite(interval) || interval <= 0) {
        return Number(first[component]) || 0;
    }

    const ratio = Math.max(
        0,
        Math.min(1, (time - first.time) / interval)
    );

    return (
        (Number(first[component]) || 0) * (1 - ratio) +
        (Number(second[component]) || 0) * ratio
    );

}


function detrendSignal(data, component) {

    const n = data.length;
    let sumTime = 0;
    let sumValue = 0;
    let sumTimeSquared = 0;
    let sumTimeValue = 0;

    data.forEach(function (sample) {
        const time = sample.time;
        const value = sample[component];
        sumTime += time;
        sumValue += value;
        sumTimeSquared += time * time;
        sumTimeValue += time * value;
    });

    const denominator =
        n * sumTimeSquared - sumTime * sumTime;
    const slope = Math.abs(denominator) > 1e-12
        ? (n * sumTimeValue - sumTime * sumValue) / denominator
        : 0;
    const intercept =
        (sumValue - slope * sumTime) / Math.max(n, 1);

    return data.map(function (sample) {
        return {
            time: sample.time,
            value: sample[component] - (intercept + slope * sample.time)
        };
    });

}


function buildProcessedSignal(data) {

    if (!data || data.length < 2) {
        return [];
    }

    const interval = getUniformSampleInterval(data);
    const duration =
        data[data.length - 1].time - data[0].time;
    const count = Math.max(
        2,
        Math.floor(duration / interval) + 1
    );
    const uniform = [];
    let sourceIndex = 0;

    for (let index = 0; index < count; index += 1) {
        const time = Math.min(
            duration,
            index * interval
        );

        uniform.push({
            time: time,
            ax: interpolateSignal(data, time + data[0].time, "ax", sourceIndex),
            ay: interpolateSignal(data, time + data[0].time, "ay", sourceIndex),
            az: interpolateSignal(data, time + data[0].time, "az", sourceIndex)
        });

        while (
            sourceIndex < data.length - 2 &&
            data[sourceIndex + 1].time < time + data[0].time
        ) {
            sourceIndex += 1;
        }
    }

    const detrendedX = detrendSignal(uniform, "ax");
    const detrendedY = detrendSignal(uniform, "ay");
    const detrendedZ = detrendSignal(uniform, "az");

    return uniform.map(function (sample, index) {
        return {
            time: sample.time,
            dt: interval,
            ax: detrendedX[index].value,
            ay: detrendedY[index].value,
            az: detrendedZ[index].value
        };
    });

}


function calculateMovingRms(data, windowSeconds) {

    if (!data || data.length === 0) {
        return [];
    }

    const interval =
        Number(data[1] && data[1].time - data[0].time) ||
        1 / 60;
    const windowSamples = Math.max(
        1,
        Math.round(windowSeconds / interval)
    );
    const sums = {
        ax: [0],
        ay: [0],
        az: [0]
    };

    data.forEach(function (sample, index) {
        ["ax", "ay", "az"].forEach(function (component) {
            const previous = sums[component][index];
            sums[component].push(
                previous + sample[component] * sample[component]
            );
        });
    });

    return data.map(function (sample, index) {
        const first = Math.max(
            0,
            index + 1 - windowSamples
        );
        const count = index + 1 - first;
        const values = {};

        ["ax", "ay", "az"].forEach(function (component) {
            values[component] = Math.sqrt(
                Math.max(
                    0,
                    (sums[component][index + 1] - sums[component][first]) /
                    count
                )
            );
        });

        return {
            time: sample.time,
            ax: values.ax,
            ay: values.ay,
            az: values.az
        };
    });

}



    const api = Object.freeze({
        getUniformSampleInterval,
        interpolateSignal,
        detrendSignal,
        buildProcessedSignal,
        calculateMovingRms
    });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMAPreprocessing = api;
        // Compatibility for existing classic scripts accessing original global names.
        Object.assign(root, api);
    }
})(globalThis);
