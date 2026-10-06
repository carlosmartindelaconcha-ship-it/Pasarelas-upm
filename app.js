/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. CONFIGURACIÓN
   ========================================================= */

/*
   Frecuencia solicitada para Generic Sensor API.

   Solo se utiliza si el navegador permite controlar
   la frecuencia del acelerómetro.
*/
const requestedSensorFrequency = 250;


/*
   Segundos visibles en la gráfica.
*/
const visibleWindowSeconds = 5;


/*
   La gráfica se redibuja aproximadamente
   cada 40 ms = 25 veces por segundo.

   IMPORTANTE:
   esto NO limita la frecuencia de adquisición.
*/
const chartUpdateInterval = 40;


/* =========================================================
   2. ELEMENTOS DEL HTML
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

const testDescription =
    document.getElementById("testDescription");

const recordButton =
    document.getElementById("recordButton");

const newTestButton =
    document.getElementById("newTestButton");

const downloadCsvButton =
    document.getElementById("downloadCsvButton");

const finishTestsButton =
    document.getElementById("finishTestsButton");

const finishedTestButtons =
    document.getElementById("finishedTestButtons");

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
   3. VARIABLES GENERALES
   ========================================================= */

let map = null;

let bridgeMarker = null;

let selectedPhotos = [];

let cameraStream = null;


/* =========================================================
   4. GPS
   ========================================================= */

let bestPosition = null;

let gpsWatchId = null;

let gpsTimeoutId = null;


/* =========================================================
   5. VARIABLES DEL ENSAYO
   ========================================================= */

let isRecording = false;

let recordingStartTime = null;

let currentTestData = [];

let tests = [];

let accelerationChart = null;

let lastChartUpdate = 0;


/*
   Objeto Generic Sensor API si está funcionando.
*/
let genericSensor = null;


/*
   Información del sistema utilizado.
*/
let currentSensorMode = "";

let currentSensorType = "";


/*
   true cuando ya hemos recibido al menos
   una muestra del sensor del ensayo actual.
*/
let receivedFirstSample = false;


/* =========================================================
   6. NAVEGACIÓN
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

                    container: "map",

                    style:
                        "https://tiles.openfreemap.org/styles/liberty",

                    center: [
                        -3.7038,
                        40.4168
                    ],

                    zoom: 10

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
   7. GPS
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
                        "";


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

                    else {

                        message =
                            "Error desconocido de ubicación.";

                    }


                    alert(
                        message +
                        "\n\n" +
                        error.message
                    );


                    console.log(
                        "Error GPS:",
                        error
                    );

                },


                {

                    enableHighAccuracy: true,

                    timeout: 30000,

                    maximumAge: 10000

                }

            );


        gpsTimeoutId =
            setTimeout(
                stopGPSWatch,
                20000
            );

    }
);


/* =========================================================
   8. ACTUALIZAR GPS
   ========================================================= */

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

        zoom: 17

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


/* =========================================================
   9. DETENER GPS
   ========================================================= */

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
   10. PASAR A FOTOGRAFÍAS
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


/* =========================================================
   11. CÁMARA
   ========================================================= */

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

                        audio: false

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

            console.log(error);

        }

    }
);


/* =========================================================
   12. CAPTURAR FOTO
   ========================================================= */

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


/* =========================================================
   13. CERRAR CÁMARA
   ========================================================= */

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


/* =========================================================
   14. AÑADIR FOTO
   ========================================================= */

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


    const imageURL =
        URL.createObjectURL(
            file
        );


    const image =
        document.createElement(
            "img"
        );


    image.src =
        imageURL;


    photoPreview.appendChild(
        image
    );


    updatePhotoCounter();

}


/* =========================================================
   15. GALERÍA
   ========================================================= */

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
   16. CONTADOR FOTOS
   ========================================================= */

function updatePhotoCounter() {

    photoCounter.textContent =
        selectedPhotos.length +
        " fotografías añadidas";

}


/* =========================================================
   17. PASAR A ENSAYOS
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
   18. CREAR GRÁFICA
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

                type: "line",


                data: {

                    datasets: [

                        {
                            label: "X",
                            data: [],
                            borderColor:
                                "#1565c0",
                            borderWidth: 2,
                            pointRadius: 0
                        },

                        {
                            label: "Y",
                            data: [],
                            borderColor:
                                "#c62828",
                            borderWidth: 2,
                            pointRadius: 0
                        },

                        {
                            label: "Z",
                            data: [],
                            borderColor:
                                "#2e7d32",
                            borderWidth: 2,
                            pointRadius: 0
                        }

                    ]

                },


                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    animation: false,

                    events: [],


                    scales: {

                        x: {

                            type: "linear",

                            title: {

                                display: true,

                                text:
                                    "Tiempo (s)"

                            },

                            grid: {

                                color:
                                    "rgba(0,0,0,0.08)"

                            }

                        },


                        y: {

                            title: {

                                display: true,

                                text:
                                    "Aceleración (m/s²)"

                            },

                            grid: {

                                color:
                                    "rgba(0,0,0,0.08)"

                            }

                        }

                    }

                }

            }

        );

}


/* =========================================================
   19. PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        /*
           Si estamos grabando,
           este clic significa STOP.
        */
        if (isRecording) {

            stopRecording();

            return;

        }


        /*
           Si no estamos grabando,
           este clic significa PLAY.
        */
        await startRecording();

    }
);


/* =========================================================
   20. COMENZAR ENSAYO
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


    /*
       Primero pedimos permisos en iPhone.

       IMPORTANTE:
       esto se hace directamente como consecuencia
       del clic del usuario.
    */
    const motionPermissionOK =
        await requestIOSMotionPermissionIfNeeded();


    if (
        !motionPermissionOK
    ) {

        alert(
            "No se concedió permiso para utilizar el acelerómetro."
        );

        return;

    }


    /*
       Detenemos cualquier sensor anterior.
    */
    stopSensor();


    /*
       Limpiamos datos.
    */
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


    /*
       Reiniciamos interfaz.
    */
    elapsedTimeElement.textContent =
        "00:00.00";


    sampleCountElement.textContent =
        "0";


    samplingFrequencyElement.textContent =
        "-- Hz";


    sensorModeElement.textContent =
        "Detectando...";


    targetFrequencyElement.textContent =
        "--";


    /*
       Todavía NO activamos isRecording.

       Primero comprobamos qué sensor podemos utilizar.
    */
    const sensorStarted =
        await startBestAvailableSensor();


    if (
        !sensorStarted
    ) {

        sensorModeElement.textContent =
            "No disponible";


        alert(
            "No se ha podido acceder al acelerómetro."
        );


        return;

    }


    /*
       AHORA sabemos que tenemos un sensor.
       Comienza oficialmente el ensayo.
    */
    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    receivedFirstSample =
        false;


    isRecording =
        true;


    /*
       Pantalla compacta.
    */
    document.body.classList.add(
        "recording-lock"
    );


    testForm.classList.add(
        "measurement-active"
    );


    testDescription.disabled =
        true;


    finishedTestButtons.style.display =
        "none";


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
   21. PERMISO IPHONE
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

        catch (error) {

            console.log(
                "Error permiso iOS:",
                error
            );


            return false;

        }

    }


    /*
       En dispositivos donde este permiso
       no existe no hace falta pedirlo.
    */
    return true;

}


/* =========================================================
   22. ELEGIR SENSOR
   ========================================================= */

async function startBestAvailableSensor() {

    /*
       Primero intentamos Generic Sensor API.
    */

    if (
        "LinearAccelerationSensor" in window
    ) {

        const worked =
            await tryGenericSensor(
                "LinearAccelerationSensor"
            );


        if (worked) {

            return true;

        }

    }


    if (
        "Accelerometer" in window
    ) {

        const worked =
            await tryGenericSensor(
                "Accelerometer"
            );


        if (worked) {

            return true;

        }

    }


    /*
       Si no funciona Generic Sensor,
       utilizamos DeviceMotionEvent.
    */
    return startDeviceMotionSensor();

}


/* =========================================================
   23. GENERIC SENSOR API
   ========================================================= */

function tryGenericSensor(
    sensorClassName
) {

    return new Promise(

        function (resolve) {

            try {

                const SensorClass =
                    window[
                        sensorClassName
                    ];


                const sensor =
                    new SensorClass({

                        frequency:
                            requestedSensorFrequency

                    });


                let firstReadingReceived =
                    false;


                /*
                   Si no llega ninguna muestra
                   en 1 segundo, hacemos fallback.
                */
                const fallbackTimer =
                    setTimeout(

                        function () {

                            if (
                                firstReadingReceived
                            ) {

                                return;

                            }


                            try {

                                sensor.stop();

                            }

                            catch (error) {

                                console.log(
                                    error
                                );

                            }


                            resolve(
                                false
                            );

                        },

                        1000

                    );


                sensor.addEventListener(
                    "reading",
                    function () {

                        /*
                           Primera lectura:
                           confirmamos sensor.
                        */
                        if (
                            !firstReadingReceived
                        ) {

                            firstReadingReceived =
                                true;


                            clearTimeout(
                                fallbackTimer
                            );


                            genericSensor =
                                sensor;


                            currentSensorMode =
                                "Generic Sensor API";


                            currentSensorType =
                                sensorClassName;


                            sensorModeElement.textContent =
                                sensorClassName;


                            targetFrequencyElement.textContent =
                                requestedSensorFrequency +
                                " Hz";


                            resolve(
                                true
                            );


                            /*
                               IMPORTANTE:

                               Esta primera lectura sucede ANTES
                               de que isRecording sea true.

                               No la guardamos.
                               La adquisición oficial comenzará
                               justo después.
                            */
                            return;

                        }


                        /*
                           A partir de aquí ya estamos grabando.
                        */
                        processAccelerationSample(

                            sensor.x ?? 0,

                            sensor.y ?? 0,

                            sensor.z ?? 0

                        );

                    }
                );


                sensor.addEventListener(
                    "error",
                    function (event) {

                        console.log(
                            "Error Generic Sensor:",
                            event.error
                        );


                        if (
                            !firstReadingReceived
                        ) {

                            clearTimeout(
                                fallbackTimer
                            );


                            resolve(
                                false
                            );

                        }

                    }
                );


                sensor.start();

            }

            catch (error) {

                console.log(
                    sensorClassName +
                    " no disponible:",
                    error
                );


                resolve(
                    false
                );

            }

        }

    );

}


/* =========================================================
   24. DEVICEMOTION
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


/* =========================================================
   25. EVENTO DEVICEMOTION
   ========================================================= */

function handleDeviceMotion(
    event
) {

    if (
        !isRecording
    ) {

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


    if (
        !acceleration
    ) {

        return;

    }


    processAccelerationSample(

        acceleration.x ?? 0,

        acceleration.y ?? 0,

        acceleration.z ?? 0

    );

}


/* =========================================================
   26. PROCESAR MUESTRA
   ========================================================= */

function processAccelerationSample(
    ax,
    ay,
    az
) {

    if (
        !isRecording
    ) {

        return;

    }


    receivedFirstSample =
        true;


    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    let dt =
        null;


    if (
        currentTestData.length > 0
    ) {

        const previousSample =
            currentTestData[
                currentTestData.length - 1
            ];


        dt =
            time -
            previousSample.time;

    }


    /*
       Guardamos SIEMPRE la muestra.
    */
    currentTestData.push({

        time: time,

        dt: dt,

        ax: ax,

        ay: ay,

        az: az

    });


    /*
       Valores numéricos.
    */
    axValue.textContent =
        ax.toFixed(3);


    ayValue.textContent =
        ay.toFixed(3);


    azValue.textContent =
        az.toFixed(3);


    elapsedTimeElement.textContent =
        formatTime(
            time
        );


    sampleCountElement.textContent =
        currentTestData.length;


    updateRealSamplingFrequency();


    /*
       La gráfica se repinta aproximadamente
       a 25 FPS.
    */
    const now =
        performance.now();


    if (
        now -
        lastChartUpdate >=
        chartUpdateInterval
    ) {

        updateChart(
            time
        );


        lastChartUpdate =
            now;

    }

}


/* =========================================================
   27. FRECUENCIA REAL
   ========================================================= */

function updateRealSamplingFrequency() {

    if (
        currentTestData.length <
        2
    ) {

        return;

    }


    /*
       Utilizamos aproximadamente
       el último segundo de datos.
    */
    const finalIndex =
        currentTestData.length - 1;


    const finalTime =
        currentTestData[
            finalIndex
        ].time;


    const minimumTime =
        Math.max(
            0,
            finalTime - 1
        );


    let firstIndex =
        finalIndex;


    while (

        firstIndex > 0 &&

        currentTestData[
            firstIndex - 1
        ].time >=
        minimumTime

    ) {

        firstIndex--;

    }


    const duration =
        finalTime -
        currentTestData[
            firstIndex
        ].time;


    const intervals =
        finalIndex -
        firstIndex;


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
   28. ACTUALIZAR GRÁFICA
   ========================================================= */

function updateChart(
    currentTime
) {

    const minimumTime =
        Math.max(

            0,

            currentTime -
            visibleWindowSeconds

        );


    const visibleData =
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

        visibleData.map(

            function (sample) {

                return {

                    x:
                        sample.time,

                    y:
                        sample.ax

                };

            }

        );


    accelerationChart
        .data
        .datasets[1]
        .data =

        visibleData.map(

            function (sample) {

                return {

                    x:
                        sample.time,

                    y:
                        sample.ay

                };

            }

        );


    accelerationChart
        .data
        .datasets[2]
        .data =

        visibleData.map(

            function (sample) {

                return {

                    x:
                        sample.time,

                    y:
                        sample.az

                };

            }

        );


    /*
       Eje temporal.
    */
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


    /*
       Autoescala vertical.
    */
    let maximumAcceleration =
        0.1;


    visibleData.forEach(

        function (sample) {

            maximumAcceleration =
                Math.max(

                    maximumAcceleration,

                    Math.abs(
                        sample.ax
                    ),

                    Math.abs(
                        sample.ay
                    ),

                    Math.abs(
                        sample.az
                    )

                );

        }

    );


    const yLimit =
        maximumAcceleration *
        1.15;


    accelerationChart
        .options
        .scales
        .y
        .min =
        -yLimit;


    accelerationChart
        .options
        .scales
        .y
        .max =
        yLimit;


    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   29. DETENER SENSOR
   ========================================================= */

function stopSensor() {

    /*
       DeviceMotion.
    */
    window.removeEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    /*
       Generic Sensor.
    */
    if (
        genericSensor !== null
    ) {

        try {

            genericSensor.stop();

        }

        catch (error) {

            console.log(
                error
            );

        }


        genericSensor =
            null;

    }

}


/* =========================================================
   30. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    if (
        !isRecording
    ) {

        return;

    }


    /*
       Primero marcamos que ya no grabamos.
    */
    isRecording =
        false;


    /*
       Después detenemos físicamente el sensor.
    */
    stopSensor();


    /*
       Salimos de la pantalla cerrada.
    */
    document.body.classList.remove(
        "recording-lock"
    );


    testForm.classList.remove(
        "measurement-active"
    );


    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    /*
       Recuperamos interfaz normal.
    */
    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    testDescription.disabled =
        false;


    /*
       Guardamos únicamente si realmente
       hemos recibido datos.
    */
    if (
        currentTestData.length >
        0
    ) {

        const averageFrequency =
            calculateAverageFrequency(
                currentTestData
            );


        tests.push({

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
                [...currentTestData]

        });


        finishedTestButtons.style.display =
            "block";

    }

    else {

        /*
           Si no hubo ninguna muestra,
           avisamos porque eso es un fallo real.
        */
        alert(
            "El ensayo se ha detenido, pero no se recibió ninguna muestra del acelerómetro."
        );

    }

}


/* =========================================================
   31. FRECUENCIA MEDIA
   ========================================================= */

function calculateAverageFrequency(
    data
) {

    if (
        data.length <
        2
    ) {

        return null;

    }


    const duration =
        data[
            data.length - 1
        ].time -
        data[0].time;


    if (
        duration <= 0
    ) {

        return null;

    }


    return (
        data.length - 1
    ) / duration;

}


/* =========================================================
   32. OTRO ENSAYO
   ========================================================= */

newTestButton.addEventListener(
    "click",
    function () {

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


        finishedTestButtons.style.display =
            "none";


        testDescription.focus();

    }
);


/* =========================================================
   33. DESCARGAR CSV
   ========================================================= */

downloadCsvButton.addEventListener(
    "click",
    async function () {

        if (
            tests.length ===
            0
        ) {

            alert(
                "No hay ensayos disponibles para descargar."
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

                const testId =
                    testIndex + 1;


                const description =
                    '"' +

                    test.description.replaceAll(
                        '"',
                        '""'
                    ) +

                    '"';


                const requestedFrequency =
                    test.requestedFrequency === null
                        ? ""
                        : test.requestedFrequency;


                const averageFrequency =
                    test.averageFrequency === null
                        ? ""
                        : test.averageFrequency.toFixed(3);


                test.data.forEach(

                    function (sample) {

                        const dtValue =
                            sample.dt === null
                                ? ""
                                : sample.dt.toFixed(6);


                        csv +=

                            testId +
                            "," +

                            description +
                            "," +

                            test.sensorMode +
                            "," +

                            test.sensorType +
                            "," +

                            requestedFrequency +
                            "," +

                            averageFrequency +
                            "," +

                            sample.time.toFixed(6) +
                            "," +

                            dtValue +
                            "," +

                            sample.ax.toFixed(6) +
                            "," +

                            sample.ay.toFixed(6) +
                            "," +

                            sample.az.toFixed(6) +
                            "\n";

                    }

                );

            }

        );


        const timestamp =
            new Date()
                .toISOString()
                .replaceAll(
                    ":",
                    "-"
                )
                .replaceAll(
                    ".",
                    "-"
                );


        const fileName =
            "ensayos_pasarela_" +
            timestamp +
            ".csv";


        const csvFile =
            new File(

                [csv],

                fileName,

                {
                    type:
                        "text/csv;charset=utf-8"
                }

            );


        /*
           En iPhone intentamos compartir
           el archivo mediante el menú nativo.
        */
        if (

            navigator.share &&

            navigator.canShare &&

            navigator.canShare({

                files: [
                    csvFile
                ]

            })

        ) {

            try {

                await navigator.share({

                    files: [
                        csvFile
                    ],

                    title:
                        "Ensayos de pasarela"

                });


                return;

            }

            catch (error) {

                if (
                    error.name ===
                    "AbortError"
                ) {

                    return;

                }


                console.log(
                    error
                );

            }

        }


        /*
           Descarga tradicional.
        */
        const blob =
            new Blob(

                [csv],

                {
                    type:
                        "text/csv;charset=utf-8"
                }

            );


        const url =
            URL.createObjectURL(
                blob
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


        document.body.removeChild(
            link
        );


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
   34. TERMINAR
   ========================================================= */

finishTestsButton.addEventListener(
    "click",
    function () {

        alert(

            "Ensayos terminados. " +
            tests.length +
            " ensayo(s) guardado(s) temporalmente."

        );

    }
);


/* =========================================================
   35. FORMATEAR TIEMPO
   ========================================================= */

function formatTime(
    seconds
) {

    const minutes =
        Math.floor(
            seconds /
            60
        );


    const remainingSeconds =
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

        remainingSeconds
            .toFixed(2)
            .padStart(
                5,
                "0"
            )

    );

}
