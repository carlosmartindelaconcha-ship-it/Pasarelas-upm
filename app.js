/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. CONFIGURACIÓN
   ========================================================= */

/*
   Frecuencia solicitada en navegadores compatibles
   con Generic Sensor API.
*/
const requestedSensorFrequency = 250;


/*
   Ventana visible durante la adquisición.
*/
const visibleWindowSeconds = 5;


/*
   Actualización gráfica durante la medida.

   40 ms -> aproximadamente 25 FPS.
   Esto NO es la frecuencia de adquisición.
*/
const chartUpdateInterval = 40;


/*
   Ventana del RMS móvil.

   Se ha fijado en 1 segundo.
*/
const movingRmsWindowSeconds = 1;


/*
   Duración de las ventanas utilizadas
   para Welch.

   Si el ensayo es más corto,
   se reducirá automáticamente.
*/
const welchWindowSeconds = 4;


/*
   Colores de los canales.
*/
const COLOR_X = "#1565c0";
const COLOR_Y = "#d00000";
const COLOR_Z = "#198754";


/* =========================================================
   2. ELEMENTOS HTML
   ========================================================= */

const startButton =
    document.getElementById("startButton");

const mainMenu =
    document.getElementById("mainMenu");

const welcomeCard =
    document.querySelector(".welcome-card");

const registerBridgeButton =
    document.getElementById("registerBridgeButton");

const bridgeForm =
    document.getElementById("bridgeForm");

const gpsButton =
    document.getElementById("gpsButton");

const continueToPhotosButton =
    document.getElementById("continueToPhotosButton");

const photoForm =
    document.getElementById("photoForm");

const openCameraButton =
    document.getElementById("openCameraButton");

const cameraSection =
    document.getElementById("cameraSection");

const cameraPreview =
    document.getElementById("cameraPreview");

const cameraCanvas =
    document.getElementById("cameraCanvas");

const capturePhotoButton =
    document.getElementById("capturePhotoButton");

const closeCameraButton =
    document.getElementById("closeCameraButton");

const galleryInput =
    document.getElementById("galleryInput");

const photoPreview =
    document.getElementById("photoPreview");

const photoCounter =
    document.getElementById("photoCounter");

const continueToTestsButton =
    document.getElementById("continueToTestsButton");


/* =========================================================
   ELEMENTOS DEL ENSAYO
   ========================================================= */

const testForm =
    document.getElementById("testForm");

const testSetup =
    document.getElementById("testSetup");

const testDescription =
    document.getElementById("testDescription");

const recordButton =
    document.getElementById("recordButton");

const elapsedTimeElement =
    document.getElementById("elapsedTime");

const sampleCountElement =
    document.getElementById("sampleCount");

const samplingFrequencyElement =
    document.getElementById("samplingFrequency");

const sensorModeElement =
    document.getElementById("sensorMode");

const targetFrequencyElement =
    document.getElementById("targetFrequency");

const axValue =
    document.getElementById("axValue");

const ayValue =
    document.getElementById("ayValue");

const azValue =
    document.getElementById("azValue");


/* =========================================================
   RESULTADOS
   ========================================================= */

const resultsSection =
    document.getElementById("resultsSection");

const resultsDescription =
    document.getElementById("resultsDescription");

const downloadCsvButton =
    document.getElementById("downloadCsvButton");

const newTestButton =
    document.getElementById("newTestButton");

const finishTestsButton =
    document.getElementById("finishTestsButton");

const resetTimeZoomButton =
    document.getElementById("resetTimeZoomButton");

const resetSpectrumZoomButton =
    document.getElementById("resetSpectrumZoomButton");


/* =========================================================
   MÉTRICAS
   ========================================================= */

const peakX =
    document.getElementById("peakX");

const peakY =
    document.getElementById("peakY");

const peakZ =
    document.getElementById("peakZ");

const rmsX =
    document.getElementById("rmsX");

const rmsY =
    document.getElementById("rmsY");

const rmsZ =
    document.getElementById("rmsZ");

const movingRmsX =
    document.getElementById("movingRmsX");

const movingRmsY =
    document.getElementById("movingRmsY");

const movingRmsZ =
    document.getElementById("movingRmsZ");

const mtvvX =
    document.getElementById("mtvvX");

const mtvvY =
    document.getElementById("mtvvY");

const mtvvZ =
    document.getElementById("mtvvZ");


/* =========================================================
   CALIDAD
   ========================================================= */

const qualityFs =
    document.getElementById("qualityFs");

const qualityDtMean =
    document.getElementById("qualityDtMean");

const qualityDtMedian =
    document.getElementById("qualityDtMedian");

const qualityDtMax =
    document.getElementById("qualityDtMax");

const qualitySamples =
    document.getElementById("qualitySamples");

const qualityGaps =
    document.getElementById("qualityGaps");


/* =========================================================
   3. VARIABLES GENERALES
   ========================================================= */

let map = null;

let bridgeMarker = null;

let selectedPhotos = [];

let cameraStream = null;


/* =========================================================
   GPS
   ========================================================= */

let bestPosition = null;

let gpsWatchId = null;

let gpsTimeoutId = null;


/* =========================================================
   ADQUISICIÓN
   ========================================================= */

let isRecording = false;

let recordingStartTime = null;

let currentTestData = [];

let tests = [];

let accelerationChart = null;

let resultsTimeChart = null;

let resultsSpectrumChart = null;

let lastChartUpdate = 0;

let genericSensor = null;

let currentSensorMode = "";

let currentSensorType = "";


/* =========================================================
   4. NAVEGACIÓN
   ========================================================= */

startButton.addEventListener(
    "click",
    function () {

        welcomeCard.style.display =
            "none";

        mainMenu.style.display =
            "block";

    }
);


registerBridgeButton.addEventListener(
    "click",
    function () {

        mainMenu.style.display =
            "none";

        bridgeForm.style.display =
            "block";


        if (map === null) {

            map =
                new maplibregl.Map({

                    container:
                        "map",

                    style:
                        "https://tiles.openfreemap.org/styles/liberty",

                    center: [
                        -3.7038,
                        40.4168
                    ],

                    zoom:
                        10

                });


            map.addControl(
                new maplibregl.NavigationControl()
            );

        }


        setTimeout(
            function () {

                map.resize();

            },
            100
        );

    }
);


/* =========================================================
   5. GPS
   ========================================================= */

gpsButton.addEventListener(
    "click",
    function () {

        if (!navigator.geolocation) {

            alert(
                "Este navegador no permite utilizar la geolocalización."
            );

            return;

        }


        stopGPSWatch();

        bestPosition = null;

        gpsButton.textContent =
            "Buscando ubicación...";

        gpsButton.disabled =
            true;


        gpsWatchId =
            navigator.geolocation.watchPosition(

                function (position) {

                    if (
                        bestPosition === null ||
                        position.coords.accuracy <
                        bestPosition.coords.accuracy
                    ) {

                        bestPosition =
                            position;

                        updateGPSPosition(
                            position
                        );

                    }


                    if (
                        position.coords.accuracy <= 10
                    ) {

                        stopGPSWatch();

                    }

                },


                function (error) {

                    stopGPSWatch();


                    let message =
                        "Error de ubicación.";


                    if (error.code === 1) {

                        message =
                            "Permiso de ubicación denegado.";

                    }

                    else if (error.code === 2) {

                        message =
                            "La posición no está disponible.";

                    }

                    else if (error.code === 3) {

                        message =
                            "Tiempo de espera agotado.";

                    }


                    alert(
                        message +
                        "\n\n" +
                        error.message
                    );

                },


                {

                    enableHighAccuracy:
                        true,

                    timeout:
                        30000,

                    maximumAge:
                        10000

                }

            );


        gpsTimeoutId =
            setTimeout(
                stopGPSWatch,
                20000
            );

    }
);


function updateGPSPosition(position) {

    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const accuracy =
        position.coords.accuracy;


    document
        .getElementById("latitude")
        .textContent =
        latitude.toFixed(6);


    document
        .getElementById("longitude")
        .textContent =
        longitude.toFixed(6);


    document
        .getElementById("accuracy")
        .textContent =
        accuracy.toFixed(1);


    map.flyTo({

        center: [
            longitude,
            latitude
        ],

        zoom:
            17

    });


    if (bridgeMarker !== null) {

        bridgeMarker.remove();

    }


    bridgeMarker =
        new maplibregl.Marker()

            .setLngLat([
                longitude,
                latitude
            ])

            .addTo(map);

}


function stopGPSWatch() {

    if (gpsWatchId !== null) {

        navigator.geolocation.clearWatch(
            gpsWatchId
        );

        gpsWatchId =
            null;

    }


    if (gpsTimeoutId !== null) {

        clearTimeout(
            gpsTimeoutId
        );

        gpsTimeoutId =
            null;

    }


    gpsButton.textContent =
        "Obtener ubicación";

    gpsButton.disabled =
        false;

}


/* =========================================================
   6. FOTOGRAFÍAS
   ========================================================= */

continueToPhotosButton.addEventListener(
    "click",
    function () {

        stopGPSWatch();

        bridgeForm.style.display =
            "none";

        photoForm.style.display =
            "block";

    }
);


openCameraButton.addEventListener(
    "click",
    async function () {

        try {

            cameraStream =
                await navigator
                    .mediaDevices
                    .getUserMedia({

                        video: {

                            facingMode: {
                                ideal:
                                    "environment"
                            }

                        },

                        audio:
                            false

                    });


            cameraPreview.srcObject =
                cameraStream;

            cameraSection.style.display =
                "block";

            openCameraButton.style.display =
                "none";

        }

        catch (error) {

            alert(
                "No se pudo acceder a la cámara."
            );

        }

    }
);


capturePhotoButton.addEventListener(
    "click",
    function () {

        const width =
            cameraPreview.videoWidth;

        const height =
            cameraPreview.videoHeight;


        cameraCanvas.width =
            width;

        cameraCanvas.height =
            height;


        const context =
            cameraCanvas.getContext(
                "2d"
            );


        context.drawImage(

            cameraPreview,

            0,
            0,

            width,
            height

        );


        cameraCanvas.toBlob(

            function (blob) {

                const file =
                    new File(

                        [blob],

                        "foto_pasarela_" +
                        Date.now() +
                        ".jpg",

                        {
                            type:
                                "image/jpeg"
                        }

                    );


                addPhotoFile(
                    file
                );

            },

            "image/jpeg",

            0.9

        );

    }
);


closeCameraButton.addEventListener(
    "click",
    stopCamera
);


function stopCamera() {

    if (cameraStream === null) {

        return;

    }


    cameraStream
        .getTracks()
        .forEach(

            function (track) {

                track.stop();

            }

        );


    cameraPreview.srcObject =
        null;

    cameraStream =
        null;

    cameraSection.style.display =
        "none";

    openCameraButton.style.display =
        "block";

}


function addPhotoFile(file) {

    if (
        !file.type.startsWith(
            "image/"
        )
    ) {

        return;

    }


    selectedPhotos.push(
        file
    );


    const image =
        document.createElement(
            "img"
        );


    image.src =
        URL.createObjectURL(
            file
        );


    photoPreview.appendChild(
        image
    );


    photoCounter.textContent =
        selectedPhotos.length +
        " fotografías añadidas";

}


galleryInput.addEventListener(
    "change",
    function () {

        const files =
            galleryInput.files;


        for (
            let i = 0;
            i < files.length;
            i++
        ) {

            addPhotoFile(
                files[i]
            );

        }


        galleryInput.value =
            "";

    }
);


/* =========================================================
   7. IR A ENSAYOS
   ========================================================= */

continueToTestsButton.addEventListener(
    "click",
    function () {

        stopCamera();

        photoForm.style.display =
            "none";

        testForm.style.display =
            "block";


        if (
            accelerationChart === null
        ) {

            createAccelerationChart();

        }

    }
);


/* =========================================================
   8. GRÁFICA DE ADQUISICIÓN
   ========================================================= */

function createAccelerationChart() {

    const context =
        document
            .getElementById(
                "accelerationChart"
            )
            .getContext(
                "2d"
            );


    accelerationChart =
        new Chart(

            context,

            {

                type:
                    "line",


                data: {

                    datasets: [

                        {
                            label:
                                "X",

                            data:
                                [],

                            borderColor:
                                COLOR_X,

                            borderWidth:
                                2,

                            pointRadius:
                                0
                        },

                        {
                            label:
                                "Y",

                            data:
                                [],

                            borderColor:
                                COLOR_Y,

                            borderWidth:
                                2,

                            pointRadius:
                                0
                        },

                        {
                            label:
                                "Z",

                            data:
                                [],

                            borderColor:
                                COLOR_Z,

                            borderWidth:
                                2,

                            pointRadius:
                                0
                        }

                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    animation:
                        false,

                    events:
                        [],


                    scales: {

                        x: {

                            type:
                                "linear",

                            title: {

                                display:
                                    true,

                                text:
                                    "Tiempo (s)"

                            }

                        },


                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    "Aceleración (m/s²)"

                            }

                        }

                    }

                }

            }

        );

}


/* =========================================================
   9. PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        if (isRecording) {

            stopRecording();

            return;

        }


        await startRecording();

    }
);


/* =========================================================
   10. INICIAR ENSAYO
   ========================================================= */

async function startRecording() {

    if (
        testDescription
            .value
            .trim() === ""
    ) {

        alert(
            "Escribe una descripción del ensayo antes de comenzar."
        );

        return;

    }


    const permissionOK =
        await requestIOSMotionPermissionIfNeeded();


    if (!permissionOK) {

        alert(
            "No se concedió permiso para utilizar el acelerómetro."
        );

        return;

    }


    stopSensor();


    currentTestData =
        [];


    accelerationChart
        .data
        .datasets
        .forEach(

            function (dataset) {

                dataset.data =
                    [];

            }

        );


    accelerationChart.update(
        "none"
    );


    elapsedTimeElement.textContent =
        "00:00.00";

    sampleCountElement.textContent =
        "0";

    samplingFrequencyElement.textContent =
        "-- Hz";


    sensorModeElement.textContent =
        "Inicializando...";

    targetFrequencyElement.textContent =
        "--";


    const sensorStarted =
        await startBestAvailableSensor();


    if (!sensorStarted) {

        alert(
            "No se ha podido acceder al acelerómetro."
        );

        return;

    }


    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    isRecording =
        true;


    document.body.classList.add(
        "recording-lock"
    );


    testForm.classList.add(
        "measurement-active"
    );


    recordButton.textContent =
        "■ Detener ensayo";


    recordButton.classList.add(
        "recording"
    );


    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );

}


/* =========================================================
   11. PERMISO IOS
   ========================================================= */

async function requestIOSMotionPermissionIfNeeded() {

    if (

        typeof DeviceMotionEvent !==
            "undefined" &&

        typeof DeviceMotionEvent
            .requestPermission ===
            "function"

    ) {

        try {

            const permission =
                await DeviceMotionEvent
                    .requestPermission();


            return (
                permission ===
                "granted"
            );

        }

        catch {

            return false;

        }

    }


    return true;

}


/* =========================================================
   12. DETECTAR IOS
   ========================================================= */

function isIOSDevice() {

    return (

        /iPhone|iPad|iPod/i.test(
            navigator.userAgent
        )

        ||

        (
            navigator.platform ===
                "MacIntel"

            &&

            navigator.maxTouchPoints >
                1
        )

    );

}


/* =========================================================
   13. SELECCIONAR SENSOR
   ========================================================= */

async function startBestAvailableSensor() {

    /*
       En iOS usamos DeviceMotion directamente.
    */
    if (isIOSDevice()) {

        return startDeviceMotionSensor();

    }


    /*
       En Android / Chromium intentamos
       Generic Sensor API.
    */
    if (
        "Accelerometer" in window
    ) {

        const worked =
            await tryGenericAccelerometer();


        if (worked) {

            return true;

        }

    }


    /*
       Fallback.
    */
    return startDeviceMotionSensor();

}


/* =========================================================
   14. GENERIC SENSOR
   ========================================================= */

function tryGenericAccelerometer() {

    return new Promise(

        function (resolve) {

            try {

                const sensor =
                    new Accelerometer({

                        frequency:
                            requestedSensorFrequency

                    });


                let confirmed =
                    false;


                const timeout =
                    setTimeout(

                        function () {

                            if (confirmed) {

                                return;

                            }


                            try {

                                sensor.stop();

                            }

                            catch {}


                            resolve(false);

                        },

                        1000
                    );


                sensor.addEventListener(
                    "reading",
                    function () {

                        if (!confirmed) {

                            confirmed =
                                true;


                            clearTimeout(
                                timeout
                            );


                            genericSensor =
                                sensor;


                            currentSensorMode =
                                "Generic Sensor API";


                            currentSensorType =
                                "Accelerometer";


                            sensorModeElement.textContent =
                                "Accelerometer";


                            targetFrequencyElement.textContent =
                                requestedSensorFrequency +
                                " Hz";


                            resolve(true);

                            return;

                        }


                        processAccelerationSample(

                            sensor.x ?? 0,

                            sensor.y ?? 0,

                            sensor.z ?? 0

                        );

                    }
                );


                sensor.addEventListener(
                    "error",
                    function () {

                        if (!confirmed) {

                            clearTimeout(
                                timeout
                            );


                            resolve(false);

                        }

                    }
                );


                sensor.start();

            }

            catch {

                resolve(false);

            }

        }

    );

}


/* =========================================================
   15. DEVICEMOTION
   ========================================================= */

function startDeviceMotionSensor() {

    if (
        typeof DeviceMotionEvent ===
        "undefined"
    ) {

        return false;

    }


    currentSensorMode =
        "DeviceMotionEvent";


    currentSensorType =
        "DeviceMotionEvent";


    sensorModeElement.textContent =
        "DeviceMotionEvent";


    targetFrequencyElement.textContent =
        "Automática";


    window.addEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    return true;

}


function handleDeviceMotion(event) {

    if (!isRecording) {

        return;

    }


    let acceleration =
        event.acceleration;


    if (

        !acceleration ||

        acceleration.x === null

    ) {

        acceleration =
            event.accelerationIncludingGravity;

    }


    if (!acceleration) {

        return;

    }


    processAccelerationSample(

        acceleration.x ?? 0,

        acceleration.y ?? 0,

        acceleration.z ?? 0

    );

}


/* =========================================================
   16. PROCESAR MUESTRA
   ========================================================= */

function processAccelerationSample(
    ax,
    ay,
    az
) {

    if (!isRecording) {

        return;

    }


    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    let dt =
        null;


    if (
        currentTestData.length >
        0
    ) {

        dt =
            time -
            currentTestData[
                currentTestData.length - 1
            ].time;

    }


    currentTestData.push({

        time:
            time,

        dt:
            dt,

        ax:
            ax,

        ay:
            ay,

        az:
            az

    });


    axValue.textContent =
        ax.toFixed(3);

    ayValue.textContent =
        ay.toFixed(3);

    azValue.textContent =
        az.toFixed(3);


    elapsedTimeElement.textContent =
        formatTime(time);


    sampleCountElement.textContent =
        currentTestData.length;


    updateRealSamplingFrequency();


    const now =
        performance.now();


    if (
        now -
        lastChartUpdate >=
        chartUpdateInterval
    ) {

        updateAcquisitionChart(
            time
        );


        lastChartUpdate =
            now;

    }

}


/* =========================================================
   17. FS REAL
   ========================================================= */

function updateRealSamplingFrequency() {

    if (
        currentTestData.length <
        2
    ) {

        return;

    }


    const end =
        currentTestData.length - 1;


    const finalTime =
        currentTestData[end].time;


    const minimumTime =
        Math.max(
            0,
            finalTime - 1
        );


    let first =
        end;


    while (

        first > 0 &&

        currentTestData[
            first - 1
        ].time >=
        minimumTime

    ) {

        first--;

    }


    const duration =
        currentTestData[end].time -
        currentTestData[first].time;


    const intervals =
        end - first;


    if (
        duration <= 0 ||
        intervals <= 0
    ) {

        return;

    }


    const fs =
        intervals /
        duration;


    samplingFrequencyElement.textContent =
        fs.toFixed(1) +
        " Hz";

}


/* =========================================================
   18. GRÁFICA DURANTE ADQUISICIÓN
   ========================================================= */

function updateAcquisitionChart(
    currentTime
) {

    const minimumTime =
        Math.max(

            0,

            currentTime -
            visibleWindowSeconds

        );


    const visible =
        currentTestData.filter(

            function (sample) {

                return (
                    sample.time >=
                    minimumTime
                );

            }

        );


    accelerationChart
        .data
        .datasets[0]
        .data =
        visible.map(
            sample => ({
                x: sample.time,
                y: sample.ax
            })
        );


    accelerationChart
        .data
        .datasets[1]
        .data =
        visible.map(
            sample => ({
                x: sample.time,
                y: sample.ay
            })
        );


    accelerationChart
        .data
        .datasets[2]
        .data =
        visible.map(
            sample => ({
                x: sample.time,
                y: sample.az
            })
        );


    accelerationChart
        .options
        .scales
        .x
        .min =
        minimumTime;


    accelerationChart
        .options
        .scales
        .x
        .max =
        Math.max(
            visibleWindowSeconds,
            currentTime
        );


    let maximum =
        0.1;


    visible.forEach(
        function (sample) {

            maximum =
                Math.max(

                    maximum,

                    Math.abs(sample.ax),

                    Math.abs(sample.ay),

                    Math.abs(sample.az)

                );

        }
    );


    const limit =
        maximum *
        1.15;


    accelerationChart
        .options
        .scales
        .y
        .min =
        -limit;


    accelerationChart
        .options
        .scales
        .y
        .max =
        limit;


    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   19. DETENER SENSOR
   ========================================================= */

function stopSensor() {

    window.removeEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    if (
        genericSensor !== null
    ) {

        try {

            genericSensor.stop();

        }

        catch {}


        genericSensor =
            null;

    }

}


/* =========================================================
   20. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    if (!isRecording) {

        return;

    }


    isRecording =
        false;


    stopSensor();


    document.body.classList.remove(
        "recording-lock"
    );


    testForm.classList.remove(
        "measurement-active"
    );


    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    if (
        currentTestData.length <
        2
    ) {

        alert(
            "No se han recibido suficientes muestras."
        );

        return;

    }


    const averageFrequency =
        calculateAverageFrequency(
            currentTestData
        );


    const test = {

        description:
            testDescription
                .value
                .trim(),

        sensorMode:
            currentSensorMode,

        sensorType:
            currentSensorType,

        requestedFrequency:

            currentSensorMode ===
                "Generic Sensor API"

                ? requestedSensorFrequency

                : null,

        averageFrequency:
            averageFrequency,

        data:
            currentTestData.map(
                sample => ({
                    ...sample
                })
            )

    };


    tests.push(
        test
    );


    /*
       Procesamos y mostramos los resultados.
    */
    showResults(
        test
    );

}


/* =========================================================
   21. MOSTRAR RESULTADOS
   ========================================================= */

function showResults(test) {

    /*
       Ocultamos elementos de adquisición.
    */
    testSetup.style.display =
        "none";


    document
        .getElementById(
            "acquisitionChartCard"
        )
        .style
        .display =
        "none";


    document
        .getElementById(
            "liveValues"
        )
        .style
        .display =
        "none";


    document
        .getElementById(
            "testInfo"
        )
        .style
        .display =
        "none";


    recordButton.style.display =
        "none";


    resultsSection.style.display =
        "block";


    resultsDescription.textContent =
        test.description +
        " · " +
        test.data.length +
        " muestras · fs media " +
        test.averageFrequency.toFixed(2) +
        " Hz";


    /*
       Preprocesado.
    */
    const processed =
        preprocessSignal(
            test.data
        );


    /*
       Métricas.
    */
    const metrics =
        calculateServiceMetrics(
            processed
        );


    updateMetricsUI(
        metrics
    );


    /*
       Calidad.
    */
    const quality =
        calculateAcquisitionQuality(
            test.data
        );


    updateQualityUI(
        quality
    );


    /*
       Gráfica temporal.
    */
    createResultsTimeChart(
        processed
    );


    /*
       PSD.
    */
    const psd =
        calculateWelchPSD(
            processed
        );


    createResultsSpectrumChart(
        psd
    );


    /*
       Dejamos la pantalla arriba de resultados.
    */
    window.scrollTo({

        top:
            testForm.offsetTop,

        behavior:
            "smooth"

    });

}


/* =========================================================
   22. PREPROCESADO
   ========================================================= */

function preprocessSignal(data) {

    /*
       Eliminamos tiempos repetidos agrupando
       las muestras que tengan exactamente
       el mismo timestamp.
    */
    const grouped =
        new Map();


    data.forEach(
        function (sample) {

            const key =
                sample.time;


            if (!grouped.has(key)) {

                grouped.set(
                    key,
                    {
                        time:
                            sample.time,

                        axSum:
                            0,

                        aySum:
                            0,

                        azSum:
                            0,

                        count:
                            0
                    }
                );

            }


            const item =
                grouped.get(key);


            item.axSum +=
                sample.ax;

            item.aySum +=
                sample.ay;

            item.azSum +=
                sample.az;

            item.count++;

        }
    );


    const uniqueData =
        Array.from(
            grouped.values()
        )
        .map(
            item => ({

                time:
                    item.time,

                ax:
                    item.axSum /
                    item.count,

                ay:
                    item.aySum /
                    item.count,

                az:
                    item.azSum /
                    item.count

            })
        )
        .sort(
            (a, b) =>
                a.time -
                b.time
        );


    /*
       Normalizamos t=0.
    */
    const t0 =
        uniqueData[0].time;


    uniqueData.forEach(
        sample => {

            sample.time -=
                t0;

        }
    );


    /*
       Calculamos dt positivos.
    */
    const dts =
        [];


    for (
        let i = 1;
        i < uniqueData.length;
        i++
    ) {

        const dt =
            uniqueData[i].time -
            uniqueData[i - 1].time;


        if (
            Number.isFinite(dt) &&
            dt > 0
        ) {

            dts.push(dt);

        }

    }


    const dtMedian =
        median(dts);


    const fs =
        1 /
        dtMedian;


    /*
       Reamostrado uniforme.
    */
    const endTime =
        uniqueData[
            uniqueData.length - 1
        ].time;


    const uniformTime =
        [];


    for (
        let t = 0;
        t <= endTime;
        t += dtMedian
    ) {

        uniformTime.push(t);

    }


    const originalTime =
        uniqueData.map(
            s => s.time
        );


    const originalX =
        uniqueData.map(
            s => s.ax
        );


    const originalY =
        uniqueData.map(
            s => s.ay
        );


    const originalZ =
        uniqueData.map(
            s => s.az
        );


    const axUniform =
        linearInterpolateSeries(
            originalTime,
            originalX,
            uniformTime
        );


    const ayUniform =
        linearInterpolateSeries(
            originalTime,
            originalY,
            uniformTime
        );


    const azUniform =
        linearInterpolateSeries(
            originalTime,
            originalZ,
            uniformTime
        );


    /*
       Detrend lineal.
    */
    const ax =
        detrendLinear(
            axUniform
        );


    const ay =
        detrendLinear(
            ayUniform
        );


    const az =
        detrendLinear(
            azUniform
        );


    return {

        time:
            uniformTime,

        ax:
            ax,

        ay:
            ay,

        az:
            az,

        fs:
            fs,

        dt:
            dtMedian

    };

}


/* =========================================================
   23. INTERPOLACIÓN LINEAL
   ========================================================= */

function linearInterpolateSeries(
    x,
    y,
    xNew
) {

    const result =
        [];


    let j =
        0;


    for (
        let i = 0;
        i < xNew.length;
        i++
    ) {

        const target =
            xNew[i];


        while (

            j <
            x.length - 2 &&

            x[j + 1] <
            target

        ) {

            j++;

        }


        if (
            target <=
            x[0]
        ) {

            result.push(
                y[0]
            );

            continue;

        }


        if (
            target >=
            x[
                x.length - 1
            ]
        ) {

            result.push(
                y[
                    y.length - 1
                ]
            );

            continue;

        }


        const x1 =
            x[j];

        const x2 =
            x[j + 1];

        const y1 =
            y[j];

        const y2 =
            y[j + 1];


        const alpha =
            (
                target -
                x1
            )
            /
            (
                x2 -
                x1
            );


        result.push(

            y1 +
            alpha *
            (
                y2 -
                y1
            )

        );

    }


    return result;

}


/* =========================================================
   24. DETREND LINEAL
   ========================================================= */

function detrendLinear(values) {

    const n =
        values.length;


    if (n < 2) {

        return [
            ...values
        ];

    }


    let sumX =
        0;

    let sumY =
        0;

    let sumXX =
        0;

    let sumXY =
        0;


    for (
        let i = 0;
        i < n;
        i++
    ) {

        sumX +=
            i;

        sumY +=
            values[i];

        sumXX +=
            i * i;

        sumXY +=
            i *
            values[i];

    }


    const denominator =
        n *
        sumXX -
        sumX *
        sumX;


    const slope =
        (
            n *
            sumXY -
            sumX *
            sumY
        )
        /
        denominator;


    const intercept =
        (
            sumY -
            slope *
            sumX
        )
        /
        n;


    return values.map(

        function (
            value,
            i
        ) {

            return (
                value -
                (
                    slope *
                    i +
                    intercept
                )
            );

        }

    );

}


/* =========================================================
   25. MÉTRICAS DE SERVICIO
   ========================================================= */

function calculateServiceMetrics(
    processed
) {

    const windowSamples =
        Math.max(

            1,

            Math.round(
                movingRmsWindowSeconds *
                processed.fs
            )

        );


    function metricsForChannel(
        values
    ) {

        /*
           Pico absoluto.
        */
        let peak =
            0;


        values.forEach(
            function (value) {

                peak =
                    Math.max(
                        peak,
                        Math.abs(value)
                    );

            }
        );


        /*
           RMS global.
        */
        const rms =
            Math.sqrt(

                values.reduce(

                    (
                        sum,
                        value
                    ) =>
                        sum +
                        value *
                        value,

                    0

                )

                /

                values.length

            );


        /*
           RMS móvil eficiente usando
           suma acumulativa de cuadrados.
        */
        let runningSumSquares =
            0;


        let maximumMovingRms =
            0;


        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            runningSumSquares +=
                values[i] *
                values[i];


            if (
                i >=
                windowSamples
            ) {

                const oldValue =
                    values[
                        i -
                        windowSamples
                    ];


                runningSumSquares -=
                    oldValue *
                    oldValue;

            }


            const currentWindowLength =
                Math.min(
                    i + 1,
                    windowSamples
                );


            const movingRms =
                Math.sqrt(
                    runningSumSquares /
                    currentWindowLength
                );


            maximumMovingRms =
                Math.max(
                    maximumMovingRms,
                    movingRms
                );

        }


        return {

            peak:
                peak,

            rms:
                rms,

            maximumMovingRms:
                maximumMovingRms,

            /*
               Por ahora MTVV no ponderado.
            */
            mtvv:
                maximumMovingRms

        };

    }


    return {

        x:
            metricsForChannel(
                processed.ax
            ),

        y:
            metricsForChannel(
                processed.ay
            ),

        z:
            metricsForChannel(
                processed.az
            )

    };

}


/* =========================================================
   26. MOSTRAR MÉTRICAS
   ========================================================= */

function updateMetricsUI(
    metrics
) {

    peakX.textContent =
        metrics.x.peak.toFixed(4);

    peakY.textContent =
        metrics.y.peak.toFixed(4);

    peakZ.textContent =
        metrics.z.peak.toFixed(4);


    rmsX.textContent =
        metrics.x.rms.toFixed(4);

    rmsY.textContent =
        metrics.y.rms.toFixed(4);

    rmsZ.textContent =
        metrics.z.rms.toFixed(4);


    movingRmsX.textContent =
        metrics.x
            .maximumMovingRms
            .toFixed(4);

    movingRmsY.textContent =
        metrics.y
            .maximumMovingRms
            .toFixed(4);

    movingRmsZ.textContent =
        metrics.z
            .maximumMovingRms
            .toFixed(4);


    mtvvX.textContent =
        metrics.x.mtvv.toFixed(4);

    mtvvY.textContent =
        metrics.y.mtvv.toFixed(4);

    mtvvZ.textContent =
        metrics.z.mtvv.toFixed(4);

}


/* =========================================================
   27. CALIDAD DE ADQUISICIÓN
   ========================================================= */

function calculateAcquisitionQuality(
    data
) {

    const dts =
        [];


    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        const dt =
            data[i].time -
            data[i - 1].time;


        if (
            Number.isFinite(dt) &&
            dt > 0
        ) {

            dts.push(dt);

        }

    }


    const dtMean =
        mean(dts);


    const dtMedian =
        median(dts);


    const dtMax =
        Math.max(
            ...dts
        );


    const duration =
        data[
            data.length - 1
        ].time -
        data[0].time;


    const fs =
        (
            data.length - 1
        )
        /
        duration;


    const gaps =
        dts.filter(

            dt =>
                dt >
                2 *
                dtMedian

        ).length;


    return {

        fs:
            fs,

        dtMean:
            dtMean,

        dtMedian:
            dtMedian,

        dtMax:
            dtMax,

        samples:
            data.length,

        gaps:
            gaps

    };

}


/* =========================================================
   28. MOSTRAR CALIDAD
   ========================================================= */

function updateQualityUI(
    quality
) {

    qualityFs.textContent =
        quality.fs.toFixed(2) +
        " Hz";


    qualityDtMean.textContent =
        (
            quality.dtMean *
            1000
        )
        .toFixed(2) +
        " ms";


    qualityDtMedian.textContent =
        (
            quality.dtMedian *
            1000
        )
        .toFixed(2) +
        " ms";


    qualityDtMax.textContent =
        (
            quality.dtMax *
            1000
        )
        .toFixed(2) +
        " ms";


    qualitySamples.textContent =
        quality.samples;


    qualityGaps.textContent =
        quality.gaps;

}


/* =========================================================
   29. GRÁFICA TEMPORAL DE RESULTADOS
   ========================================================= */

function createResultsTimeChart(
    processed
) {

    if (
        resultsTimeChart !== null
    ) {

        resultsTimeChart.destroy();

    }


    const context =
        document
            .getElementById(
                "resultsTimeChart"
            )
            .getContext(
                "2d"
            );


    resultsTimeChart =
        new Chart(

            context,

            {

                type:
                    "line",


                data: {

                    datasets: [

                        {
                            label:
                                "X",

                            data:
                                processed.time.map(
                                    (
                                        t,
                                        i
                                    ) => ({
                                        x: t,
                                        y: processed.ax[i]
                                    })
                                ),

                            borderColor:
                                COLOR_X,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        },

                        {
                            label:
                                "Y",

                            data:
                                processed.time.map(
                                    (
                                        t,
                                        i
                                    ) => ({
                                        x: t,
                                        y: processed.ay[i]
                                    })
                                ),

                            borderColor:
                                COLOR_Y,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        },

                        {
                            label:
                                "Z",

                            data:
                                processed.time.map(
                                    (
                                        t,
                                        i
                                    ) => ({
                                        x: t,
                                        y: processed.az[i]
                                    })
                                ),

                            borderColor:
                                COLOR_Z,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        }

                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    animation:
                        false,


                    interaction: {

                        mode:
                            "nearest",

                        intersect:
                            false

                    },


                    plugins: {

                        tooltip: {

                            enabled:
                                true,

                            callbacks: {

                                title:
                                    function (
                                        items
                                    ) {

                                        if (
                                            items.length === 0
                                        ) {

                                            return "";

                                        }


                                        return (
                                            "t = " +
                                            Number(
                                                items[0]
                                                    .parsed
                                                    .x
                                            )
                                            .toFixed(4) +
                                            " s"
                                        );

                                    },


                                label:
                                    function (
                                        context
                                    ) {

                                        return (
                                            context.dataset.label +
                                            " = " +
                                            context.parsed.y.toFixed(5) +
                                            " m/s²"
                                        );

                                    }

                            }

                        },


                        zoom: {

                            pan: {

                                enabled:
                                    true,

                                mode:
                                    "x"

                            },


                            zoom: {

                                wheel: {

                                    enabled:
                                        true

                                },

                                pinch: {

                                    enabled:
                                        true

                                },

                                mode:
                                    "x"

                            }

                        }

                    },


                    scales: {

                        x: {

                            type:
                                "linear",

                            title: {

                                display:
                                    true,

                                text:
                                    "Tiempo (s)"

                            }

                        },


                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    "Aceleración (m/s²)"

                            }

                        }

                    }

                }

            }

        );

}


/* =========================================================
   30. PSD WELCH
   ========================================================= */

function calculateWelchPSD(
    processed
) {

    /*
       Ventana de Welch aproximada.
    */
    let segmentLength =
        Math.round(
            welchWindowSeconds *
            processed.fs
        );


    /*
       Limitamos a la longitud disponible.
    */
    segmentLength =
        Math.min(

            segmentLength,

            processed.ax.length

        );


    /*
       FFT radix-2:
       usamos la potencia de 2 inferior
       para evitar rellenar ventanas enormes.
    */
    segmentLength =
        previousPowerOfTwo(
            segmentLength
        );


    segmentLength =
        Math.max(
            16,
            segmentLength
        );


    /*
       Si la señal es muy corta.
    */
    if (
        segmentLength >
        processed.ax.length
    ) {

        segmentLength =
            previousPowerOfTwo(
                processed.ax.length
            );

    }


    const overlap =
        Math.floor(
            segmentLength /
            2
        );


    const step =
        segmentLength -
        overlap;


    const window =
        hannWindow(
            segmentLength
        );


    /*
       Normalización energética de la ventana.
    */
    const windowPower =
        window.reduce(

            (
                sum,
                value
            ) =>
                sum +
                value *
                value,

            0

        );


    function welchForChannel(
        values
    ) {

        const half =
            Math.floor(
                segmentLength /
                2
            ) +
            1;


        const accumulated =
            new Array(
                half
            )
            .fill(0);


        let segments =
            0;


        for (

            let start = 0;

            start +
            segmentLength <=
            values.length;

            start +=
            step

        ) {

            const segment =
                new Array(
                    segmentLength
                );


            for (
                let i = 0;
                i < segmentLength;
                i++
            ) {

                segment[i] =
                    values[
                        start + i
                    ]
                    *
                    window[i];

            }


            const spectrum =
                fftReal(
                    segment
                );


            for (
                let k = 0;
                k < half;
                k++
            ) {

                const re =
                    spectrum.real[k];

                const im =
                    spectrum.imag[k];


                let power =
                    (
                        re *
                        re +
                        im *
                        im
                    )
                    /
                    (
                        processed.fs *
                        windowPower
                    );


                /*
                   PSD unilateral.
                */
                if (
                    k > 0 &&
                    k <
                    half - 1
                ) {

                    power *=
                        2;

                }


                accumulated[k] +=
                    power;

            }


            segments++;

        }


        if (
            segments === 0
        ) {

            return accumulated;

        }


        return accumulated.map(

            value =>
                value /
                segments

        );

    }


    const px =
        welchForChannel(
            processed.ax
        );


    const py =
        welchForChannel(
            processed.ay
        );


    const pz =
        welchForChannel(
            processed.az
        );


    const frequency =
        px.map(

            (
                _,
                index
            ) =>

                index *
                processed.fs /
                segmentLength

        );


    return {

        frequency:
            frequency,

        px:
            px,

        py:
            py,

        pz:
            pz

    };

}


/* =========================================================
   31. GRÁFICA PSD
   ========================================================= */

function createResultsSpectrumChart(
    psd
) {

    if (
        resultsSpectrumChart !== null
    ) {

        resultsSpectrumChart.destroy();

    }


    const context =
        document
            .getElementById(
                "resultsSpectrumChart"
            )
            .getContext(
                "2d"
            );


    /*
       Para escala logarítmica evitamos
       valores exactamente cero.
    */
    const epsilon =
        1e-20;


    resultsSpectrumChart =
        new Chart(

            context,

            {

                type:
                    "line",


                data: {

                    datasets: [

                        {
                            label:
                                "X",

                            data:
                                psd.frequency.map(
                                    (
                                        f,
                                        i
                                    ) => ({
                                        x: f,
                                        y: Math.max(
                                            psd.px[i],
                                            epsilon
                                        )
                                    })
                                ),

                            borderColor:
                                COLOR_X,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        },

                        {
                            label:
                                "Y",

                            data:
                                psd.frequency.map(
                                    (
                                        f,
                                        i
                                    ) => ({
                                        x: f,
                                        y: Math.max(
                                            psd.py[i],
                                            epsilon
                                        )
                                    })
                                ),

                            borderColor:
                                COLOR_Y,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        },

                        {
                            label:
                                "Z",

                            data:
                                psd.frequency.map(
                                    (
                                        f,
                                        i
                                    ) => ({
                                        x: f,
                                        y: Math.max(
                                            psd.pz[i],
                                            epsilon
                                        )
                                    })
                                ),

                            borderColor:
                                COLOR_Z,

                            borderWidth:
                                1.5,

                            pointRadius:
                                0,

                            pointHitRadius:
                                8
                        }

                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    animation:
                        false,


                    interaction: {

                        mode:
                            "nearest",

                        intersect:
                            false

                    },


                    plugins: {

                        tooltip: {

                            callbacks: {

                                title:
                                    function (
                                        items
                                    ) {

                                        if (
                                            items.length === 0
                                        ) {

                                            return "";

                                        }


                                        return (
                                            "f = " +
                                            items[0]
                                                .parsed
                                                .x
                                                .toFixed(3) +
                                            " Hz"
                                        );

                                    },


                                label:
                                    function (
                                        context
                                    ) {

                                        return (
                                            context.dataset.label +
                                            " = " +
                                            context.parsed.y.toExponential(3) +
                                            " (m/s²)²/Hz"
                                        );

                                    }

                            }

                        },


                        zoom: {

                            pan: {

                                enabled:
                                    true,

                                mode:
                                    "x"

                            },


                            zoom: {

                                wheel: {

                                    enabled:
                                        true

                                },

                                pinch: {

                                    enabled:
                                        true

                                },

                                mode:
                                    "x"

                            }

                        }

                    },


                    scales: {

                        x: {

                            type:
                                "linear",

                            title: {

                                display:
                                    true,

                                text:
                                    "Frecuencia (Hz)"

                            }

                        },


                        y: {

                            type:
                                "logarithmic",

                            title: {

                                display:
                                    true,

                                text:
                                    "PSD ((m/s²)²/Hz)"

                            }

                        }

                    }

                }

            }

        );

}


/* =========================================================
   32. FFT RADIX-2
   ========================================================= */

function fftReal(
    input
) {

    const n =
        input.length;


    /*
       Partes real e imaginaria.
    */
    const real =
        input.slice();


    const imag =
        new Array(n)
            .fill(0);


    /*
       Reordenamiento bit-reversal.
    */
    let j =
        0;


    for (
        let i = 1;
        i < n;
        i++
    ) {

        let bit =
            n >>
            1;


        while (
            j &
            bit
        ) {

            j ^=
                bit;

            bit >>=
                1;

        }


        j ^=
            bit;


        if (
            i <
            j
        ) {

            [
                real[i],
                real[j]
            ] =
            [
                real[j],
                real[i]
            ];


            [
                imag[i],
                imag[j]
            ] =
            [
                imag[j],
                imag[i]
            ];

        }

    }


    /*
       Cooley-Tukey.
    */
    for (
        let length = 2;
        length <= n;
        length <<= 1
    ) {

        const angle =
            -2 *
            Math.PI /
            length;


        const wLengthReal =
            Math.cos(
                angle
            );


        const wLengthImag =
            Math.sin(
                angle
            );


        for (
            let i = 0;
            i < n;
            i += length
        ) {

            let wReal =
                1;

            let wImag =
                0;


            const half =
                length >>
                1;


            for (
                let k = 0;
                k < half;
                k++
            ) {

                const even =
                    i + k;

                const odd =
                    even + half;


                const oddReal =
                    real[odd] *
                    wReal -
                    imag[odd] *
                    wImag;


                const oddImag =
                    real[odd] *
                    wImag +
                    imag[odd] *
                    wReal;


                const evenReal =
                    real[even];

                const evenImag =
                    imag[even];


                real[even] =
                    evenReal +
                    oddReal;


                imag[even] =
                    evenImag +
                    oddImag;


                real[odd] =
                    evenReal -
                    oddReal;


                imag[odd] =
                    evenImag -
                    oddImag;


                const nextWReal =
                    wReal *
                    wLengthReal -
                    wImag *
                    wLengthImag;


                const nextWImag =
                    wReal *
                    wLengthImag +
                    wImag *
                    wLengthReal;


                wReal =
                    nextWReal;

                wImag =
                    nextWImag;

            }

        }

    }


    return {

        real:
            real,

        imag:
            imag

    };

}


/* =========================================================
   33. VENTANA HANN
   ========================================================= */

function hannWindow(
    n
) {

    if (
        n === 1
    ) {

        return [1];

    }


    const window =
        [];


    for (
        let i = 0;
        i < n;
        i++
    ) {

        window.push(

            0.5 *
            (
                1 -
                Math.cos(

                    2 *
                    Math.PI *
                    i /
                    (
                        n -
                        1
                    )

                )
            )

        );

    }


    return window;

}


/* =========================================================
   34. POTENCIA DE 2 INFERIOR
   ========================================================= */

function previousPowerOfTwo(
    value
) {

    if (
        value < 1
    ) {

        return 1;

    }


    return Math.pow(

        2,

        Math.floor(
            Math.log2(
                value
            )
        )

    );

}


/* =========================================================
   35. RESET ZOOM
   ========================================================= */

resetTimeZoomButton.addEventListener(
    "click",
    function () {

        if (
            resultsTimeChart
        ) {

            resultsTimeChart.resetZoom();

        }

    }
);


resetSpectrumZoomButton.addEventListener(
    "click",
    function () {

        if (
            resultsSpectrumChart
        ) {

            resultsSpectrumChart.resetZoom();

        }

    }
);


/* =========================================================
   36. OTRO ENSAYO
   ========================================================= */

newTestButton.addEventListener(
    "click",
    function () {

        resultsSection.style.display =
            "none";


        testSetup.style.display =
            "block";


        document
            .getElementById(
                "acquisitionChartCard"
            )
            .style
            .display =
            "block";


        document
            .getElementById(
                "liveValues"
            )
            .style
            .display =
            "grid";


        document
            .getElementById(
                "testInfo"
            )
            .style
            .display =
            "grid";


        recordButton.style.display =
            "block";


        testDescription.value =
            "";


        currentTestData =
            [];


        elapsedTimeElement.textContent =
            "00:00.00";


        sampleCountElement.textContent =
            "0";


        samplingFrequencyElement.textContent =
            "-- Hz";


        sensorModeElement.textContent =
            "Sin iniciar";


        targetFrequencyElement.textContent =
            "--";


        axValue.textContent =
            "0.000";

        ayValue.textContent =
            "0.000";

        azValue.textContent =
            "0.000";


        accelerationChart
            .data
            .datasets
            .forEach(

                function (dataset) {

                    dataset.data =
                        [];

                }

            );


        delete accelerationChart
            .options
            .scales
            .x
            .min;


        delete accelerationChart
            .options
            .scales
            .x
            .max;


        delete accelerationChart
            .options
            .scales
            .y
            .min;


        delete accelerationChart
            .options
            .scales
            .y
            .max;


        accelerationChart.update(
            "none"
        );


        testDescription.focus();

    }
);


/* =========================================================
   37. DESCARGAR CSV
   ========================================================= */

downloadCsvButton.addEventListener(
    "click",
    async function () {

        if (
            tests.length ===
            0
        ) {

            alert(
                "No hay ensayos para descargar."
            );

            return;

        }


        let csv =
            "test_id,description,sensor_mode,sensor_type," +
            "requested_frequency_hz,average_frequency_hz," +
            "time_s,dt_s,ax_m_s2,ay_m_s2,az_m_s2\n";


        tests.forEach(

            function (
                test,
                testIndex
            ) {

                const description =
                    '"' +

                    test.description
                        .replaceAll(
                            '"',
                            '""'
                        )

                    +

                    '"';


                test.data.forEach(

                    function (
                        sample
                    ) {

                        csv +=

                            (
                                testIndex +
                                1
                            )
                            +
                            ","
                            +
                            description
                            +
                            ","
                            +
                            test.sensorMode
                            +
                            ","
                            +
                            test.sensorType
                            +
                            ","
                            +
                            (
                                test.requestedFrequency ??
                                ""
                            )
                            +
                            ","
                            +
                            test.averageFrequency
                                .toFixed(4)
                            +
                            ","
                            +
                            sample.time
                                .toFixed(6)
                            +
                            ","
                            +
                            (
                                sample.dt === null

                                    ? ""

                                    : sample.dt
                                        .toFixed(6)
                            )
                            +
                            ","
                            +
                            sample.ax
                                .toFixed(6)
                            +
                            ","
                            +
                            sample.ay
                                .toFixed(6)
                            +
                            ","
                            +
                            sample.az
                                .toFixed(6)
                            +
                            "\n";

                    }

                );

            }

        );


        const fileName =
            "ensayos_pasarela_" +
            Date.now() +
            ".csv";


        const file =
            new File(

                [csv],

                fileName,

                {
                    type:
                        "text/csv;charset=utf-8"
                }

            );


        /*
           iPhone / Android:
           intentamos utilizar compartir.
        */
        if (

            navigator.share &&

            navigator.canShare &&

            navigator.canShare({

                files:
                    [file]

            })

        ) {

            try {

                await navigator.share({

                    files:
                        [file],

                    title:
                        "Ensayos de pasarela"

                });


                return;

            }

            catch (
                error
            ) {

                if (
                    error.name ===
                    "AbortError"
                ) {

                    return;

                }

            }

        }


        /*
           Fallback tradicional.
        */
        const url =
            URL.createObjectURL(
                file
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            fileName;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        setTimeout(

            function () {

                URL.revokeObjectURL(
                    url
                );

            },

            1500

        );

    }
);


/* =========================================================
   38. TERMINAR
   ========================================================= */

finishTestsButton.addEventListener(
    "click",
    function () {

        alert(

            "Ensayos terminados. " +
            tests.length +
            " ensayo(s) realizados."

        );

    }
);


/* =========================================================
   39. FUNCIONES ESTADÍSTICAS
   ========================================================= */

function mean(values) {

    if (
        values.length ===
        0
    ) {

        return NaN;

    }


    return values.reduce(

        (
            sum,
            value
        ) =>
            sum +
            value,

        0

    )
    /
    values.length;

}


function median(values) {

    if (
        values.length ===
        0
    ) {

        return NaN;

    }


    const sorted =
        [
            ...values
        ]
        .sort(
            (
                a,
                b
            ) =>
                a - b
        );


    const middle =
        Math.floor(
            sorted.length /
            2
        );


    if (
        sorted.length %
        2 ===
        0
    ) {

        return (

            sorted[
                middle - 1
            ]

            +

            sorted[
                middle
            ]

        )
        /
        2;

    }


    return sorted[
        middle
    ];

}


/* =========================================================
   40. FS MEDIA
   ========================================================= */

function calculateAverageFrequency(
    data
) {

    if (
        data.length <
        2
    ) {

        return NaN;

    }


    const duration =
        data[
            data.length - 1
        ].time -
        data[0].time;


    return (
        data.length -
        1
    )
    /
    duration;

}


/* =========================================================
   41. FORMATEAR TIEMPO
   ========================================================= */

function formatTime(
    seconds
) {

    const minutes =
        Math.floor(
            seconds /
            60
        );


    const remaining =
        seconds -
        minutes *
        60;


    return (

        String(
            minutes
        )
        .padStart(
            2,
            "0"
        )

        +

        ":"

        +

        remaining
            .toFixed(2)
            .padStart(
                5,
                "0"
            )

    );

}
