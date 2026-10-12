/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. CONFIGURACIÓN
   ========================================================= */

/*
   Frecuencia que pedimos cuando el navegador
   soporta Generic Sensor API.

   IMPORTANTE:
   250 Hz es una frecuencia SOLICITADA.
   Después calculamos siempre la frecuencia real.
*/
const requestedSensorFrequency = 250;


/*
   La gráfica muestra únicamente
   los últimos 5 segundos.
*/
const visibleWindowSeconds = 5;


/*
   Redibujamos la gráfica aproximadamente
   25 veces por segundo.

   Esto NO limita la frecuencia de adquisición.
*/
const chartUpdateInterval = 40;


/* El espectro provisional se recalcula una vez por segundo. */
const spectrumUpdateInterval = 1000;


/* =========================================================
   2. ELEMENTOS DE LA INTERFAZ
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

const spectrumCanvas =
    document.getElementById("spectrumChart");

const resetTemporalZoomButton =
    document.getElementById("resetTemporalZoom");

const resetSpectrumZoomButton =
    document.getElementById("resetSpectrumZoom");


/* =========================================================
   3. VARIABLES GENERALES
   ========================================================= */

let map = null;

let bridgeMarker = null;

let selectedPhotos = [];

let cameraStream = null;


/* =========================================================
   4. VARIABLES GPS
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

let spectrumChart = null;

let lastChartUpdate = 0;

let lastSpectrumUpdate = 0;


/*
   Sensor de Generic Sensor API.

   Será null cuando utilicemos DeviceMotionEvent.
*/
let genericSensor = null;


/*
   Información del sistema de adquisición.
*/
let currentSensorMode = "";

let currentSensorType = "";


/* Tipografía coherente y nítida para todos los textos de Chart.js. */
if (typeof Chart !== "undefined") {

    Chart.defaults.font.family = "Arial, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.font.lineHeight = 1.2;

}


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


        /*
           Creamos el mapa solamente
           la primera vez.
        */
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


        bestPosition =
            null;


        gpsButton.textContent =
            "Buscando ubicación...";


        gpsButton.disabled =
            true;


        gpsWatchId =
            navigator.geolocation.watchPosition(


                /* =========================================
                   NUEVA POSICIÓN
                   ========================================= */

                function (position) {

                    /*
                       Nos quedamos únicamente
                       con posiciones mejores.
                    */
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


                    /*
                       Si conseguimos precisión <= 10 m,
                       dejamos de buscar.
                    */
                    if (
                        position.coords.accuracy <= 10
                    ) {

                        stopGPSWatch();

                    }

                },


                /* =========================================
                   ERROR GPS
                   ========================================= */

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


                /* =========================================
                   CONFIGURACIÓN
                   ========================================= */

                {

                    enableHighAccuracy:
                        true,

                    timeout:
                        30000,

                    maximumAge:
                        10000

                }

            );


        /*
           Máximo 20 segundos buscando
           una posición mejor.
        */
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

function updateGPSPosition(
    position
) {

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


    if (
        bridgeMarker !== null
    ) {
        bridgeMarker.remove();

    }


    bridgeMarker =
        new maplibregl.Marker()

            .setLngLat([
                longitude,
                latitude
            ])

            .setPopup(

                new maplibregl.Popup()
                    .setHTML(

                        "<strong>Ubicación de la pasarela</strong><br>" +
                        "Precisión: " +
                        accuracy.toFixed(1) +
                        " m"

                    )

            )

            .addTo(
                map
            );

}


/* =========================================================
   9. DETENER GPS
   ========================================================= */

function stopGPSWatch() {

    if (
        gpsWatchId !== null
    ) {

        navigator
            .geolocation
            .clearWatch(
                gpsWatchId
            );


        gpsWatchId =
            null;

    }


    if (
        gpsTimeoutId !== null
    ) {

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
   11. ABRIR CÁMARA
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


            console.log(
                error
            );

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

    if (
        cameraStream === null
    ) {

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

function addPhotoFile(
    file
) {

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


    image.alt =
        "Fotografía de la pasarela";


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
   16. CONTADOR DE FOTOS
   ========================================================= */

function updatePhotoCounter() {

    const numberOfPhotos =
        selectedPhotos.length;


    if (
        numberOfPhotos === 1
    ) {

        photoCounter.textContent =
            "1 fotografía añadida";

    }

    else {

        photoCounter.textContent =
            numberOfPhotos +
            " fotografías añadidas";

    }

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

            createSpectrumChart();

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
                                "#1565c0",

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
                                "#c62828",
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
                                "#2e7d32",

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


                    /*
                       Chart.js no necesita recibir
                       toques o gestos.
                    */
                    events:
                        [],

                    plugins: {

                        zoom: {

                            pan: {
                                enabled: true,
                                mode: "x",
                                onPan: function (context) {
                                    clampTemporalXAxis(context.chart);
                                    keepTemporalYAxisCentered(
                                        context.chart
                                    );
                                },
                                onPanComplete: function (context) {
                                    clampTemporalXAxis(context.chart);
                                    keepTemporalYAxisCentered(
                                        context.chart
                                    );
                                }
                            },

                            zoom: {
                                wheel: {
                                    enabled: true
                                },
                                pinch: {
                                    enabled: true
                                },
                                mode: "xy",
                                onZoom: function (context) {
                                    clampTemporalXAxis(context.chart);
                                    keepTemporalYAxisCentered(
                                        context.chart
                                    );
                                },
                                onZoomComplete: function (context) {
                                    clampTemporalXAxis(context.chart);
                                    keepTemporalYAxisCentered(
                                        context.chart
                                    );
                                }
                            },

                            limits: {

                            x: {
                                min: 0,
                                max: 1
                            }

                            },

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

                            },

                            grid: {

                                color:
                                    "rgba(0,0,0,0.08)"

                            }

                        },


                        y: {

                            title: {

                                display:
                                    true,

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
   18 bis. CREAR GRÁFICA DEL ESPECTRO
   ========================================================= */

function createSpectrumChart() {

    spectrumChart = new Chart(

        spectrumCanvas.getContext("2d"),

        {
            type: "line",

            data: {
                datasets: [
                    {
                        label: "X",
                        data: [],
                        borderColor: "#1565c0",
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: "Y",
                        data: [],
                        borderColor: "#c62828",
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: "Z",
                        data: [],
                        borderColor: "#2e7d32",
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                parsing: false,
                scales: {
                    x: {
                        type: "linear",
                        min: 0,
                        max: 30,
                        title: {
                            display: true,
                            text: "Frecuencia (Hz)"
                        },
                        grid: {
                            color: "rgba(0,0,0,0.08)"
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "Amplitud"
                        },
                        grid: {
                            color: "rgba(0,0,0,0.08)"
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: "xy",
                            onPan: function (context) {
                                clampSpectrumAxes(context.chart);
                            },
                            onPanComplete: function (context) {
                                clampSpectrumAxes(context.chart);
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: true
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: "xy",
                            onZoom: function (context) {
                                clampSpectrumAxes(context.chart);
                            },
                            onZoomComplete: function (context) {
                                clampSpectrumAxes(context.chart);
                            }
                        },

                        limits: {

                            x: {
                                min: 0,
                                max: 30
                            },

                            y: {
                                min: 0
                            }

                        }
                    }
                }
            }
        }
    );

}


resetTemporalZoomButton.addEventListener("click", function () {

    if (accelerationChart && typeof accelerationChart.resetZoom === "function") {
        accelerationChart.resetZoom();
    }

});


resetSpectrumZoomButton.addEventListener("click", function () {

    if (spectrumChart && typeof spectrumChart.resetZoom === "function") {
        spectrumChart.resetZoom();
    }

});


/* =========================================================
   19. BOTÓN PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        /*
           Si ya estamos grabando,
           el botón funciona como STOP.
        */
        if (
            isRecording
        ) {

            stopRecording();

            return;

        }


        /*
           Si no estamos grabando,
           iniciamos un nuevo ensayo.
        */
        await startRecording();

    }
);


/* =========================================================
   20. COMENZAR ENSAYO
   ========================================================= */

async function startRecording() {

    /*
       La descripción es obligatoria.
    */
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
       =====================================================
       IPHONE / IPAD

       Pedimos primero el permiso de movimiento.

       Debe hacerse directamente después
       de pulsar el botón.
       =====================================================
    */

    const permissionOK =
        await requestIOSMotionPermissionIfNeeded();


    if (
        !permissionOK
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
       Limpiamos datos anteriores.
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


    if (spectrumChart) {

        spectrumChart.data.datasets.forEach(function (dataset) {
            dataset.data = [];
        });

        spectrumChart.options.scales.x.min = 0;
        spectrumChart.options.scales.x.max = 30;

        if (typeof spectrumChart.resetZoom === "function") {
            spectrumChart.resetZoom();
        }

        spectrumChart.update("none");

    }


    /*
       Reiniciamos indicadores.
    */
    elapsedTimeElement.textContent =
        "00:00.00";


    sampleCountElement.textContent =
        "0";


    samplingFrequencyElement.textContent =
        "-- Hz";


    sensorModeElement.textContent =
        "Inicializando sensor...";


    targetFrequencyElement.textContent =
        "--";


    /*
       Elegimos el sensor.

       IMPORTANTE:
       todavía NO estamos oficialmente grabando.
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
       =====================================================
       AQUÍ COMIENZA OFICIALMENTE EL ENSAYO
       =====================================================
    */

    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    lastSpectrumUpdate =
        recordingStartTime;


    isRecording =
        true;


    disableChartNavigation();


    /*
       Bloqueamos scroll y activamos
       pantalla compacta.
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
   21. PERMISO DE MOVIMIENTO EN IOS
   ========================================================= */

async function requestIOSMotionPermissionIfNeeded() {

    /*
       Safari iPhone requiere permiso explícito.
    */
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
                "Error solicitando permiso de movimiento:",
                error
            );


            return false;

        }

    }


    /*
       Android / ordenador:
       este permiso específico no existe.
    */
    return true;

}


/* =========================================================
   22. DETECTAR IOS
   ========================================================= */

function isIOSDevice() {

    /*
       iPhone / iPad / iPod tradicionales.
    */
    const classicIOS =
        /iPhone|iPad|iPod/i.test(
            navigator.userAgent
        );


    /*
       Algunos iPad modernos se identifican
       como Macintosh.
    */
    const modernIPad =
        navigator.platform ===
            "MacIntel" &&
        navigator.maxTouchPoints >
            1;


    return (
        classicIOS ||
        modernIPad
    );

}


/* =========================================================
   23. ELEGIR EL MEJOR SENSOR
   ========================================================= */

async function startBestAvailableSensor() {

    /*
       =====================================================
       IOS

       Aquí NO intentamos Generic Sensor API.

       Vamos directamente al sistema que ya sabemos
       que funciona en Safari/iPhone.
       =====================================================
    */

    if (
        isIOSDevice()
    ) {

        console.log(
            "iOS detectado → DeviceMotionEvent"
        );


        return startDeviceMotionSensor();

    }


    /*
       =====================================================
       ANDROID / CHROME

       Intentamos Generic Sensor API.
       =====================================================
    */

    if (
        "Accelerometer" in window
    ) {

        console.log(
            "Accelerometer disponible → intentando " +
            requestedSensorFrequency +
            " Hz"
        );


        const worked =
            await tryGenericAccelerometer();


        if (
            worked
        ) {

            return true;

        }

    }


    /*
       =====================================================
       FALLBACK

       Si Generic Sensor API no existe o falla,       usamos DeviceMotionEvent.
       =====================================================
    */

    console.log(
        "Fallback → DeviceMotionEvent"
    );


    return startDeviceMotionSensor();

}


/* =========================================================
   24. GENERIC SENSOR API
   ========================================================= */

function tryGenericAccelerometer() {

    return new Promise(

        function (resolve) {

            try {

                /*
                   Creamos el acelerómetro solicitando
                   250 Hz.
                */
                const sensor =
                    new Accelerometer({

                        frequency:
                            requestedSensorFrequency

                    });


                let confirmed =
                    false;


                /*
                   Si en 1 segundo no obtenemos
                   ninguna lectura, hacemos fallback.
                */
                const timeout =
                    setTimeout(

                        function () {

                            if (
                                confirmed
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


                /*
                   Lectura del sensor.
                */
                sensor.addEventListener(
                    "reading",
                    function () {

                        /*
                           La primera lectura solo
                           confirma que funciona.
                        */
                        if (
                            !confirmed
                        ) {

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


                            resolve(
                                true
                            );


                            /*
                               Esta primera lectura ocurre
                               antes del comienzo oficial.
                            */
                            return;

                        }


                        /*
                           Después del inicio oficial
                           procesamos muestras.
                        */
                        processAccelerationSample(

                            sensor.x ?? 0,

                            sensor.y ?? 0,

                            sensor.z ?? 0

                        );

                    }
                );


                /*
                   Error del sensor.
                */
                sensor.addEventListener(
                    "error",
                    function (event) {

                        console.log(
                            "Error Generic Sensor:",
                            event.error
                        );


                        if (
                            !confirmed
                        ) {

                            clearTimeout(
                                timeout
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
                    "Generic Sensor API no disponible:",
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
   25. DEVICEMOTION
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


    /*
       DeviceMotionEvent no permite seleccionar
       manualmente la frecuencia.
    */
    targetFrequencyElement.textContent =
        "Automática";


    window.addEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    return true;

}


/* =========================================================
   26. RECIBIR DEVICEMOTION
   ========================================================= */

function handleDeviceMotion(
    event
) {

    if (
        !isRecording
    ) {

        return;

    }


    /*
       Preferimos aceleración sin gravedad.
    */
    let acceleration =
        event.acceleration;


    /*
       Algunos dispositivos solo proporcionan
       accelerationIncludingGravity.
    */
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
   27. PROCESAR MUESTRA
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


    /*
       Tiempo desde el inicio.
    */
    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    /*
       Diferencia temporal con la muestra anterior.
    */
    let dt =
        null;


    if (
        currentTestData.length >
        0
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
       IMPORTANTE:

       Guardamos TODAS las muestras.
    */
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


    /*
       Valores instantáneos.
    */
    axValue.textContent =
        ax.toFixed(3);


    ayValue.textContent =
        ay.toFixed(3);


    azValue.textContent =
        az.toFixed(3);


    /*
       Tiempo.
    */
    elapsedTimeElement.textContent =
        formatTime(
            time
        );


    /*
       Nº de muestras.
    */
    sampleCountElement.textContent =
        currentTestData.length;


    /*
       Frecuencia real.
    */
    updateRealSamplingFrequency();


    /*
       Repintamos la gráfica más lentamente
       que la adquisición.
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


    /*
       Actualizamos el espectro con todo el registro acumulado,
       pero con mucha menor frecuencia que la señal temporal.
       Esto no interviene en la adquisición del sensor.
    */
    if (
        now -
        lastSpectrumUpdate >=
        spectrumUpdateInterval
    ) {

        updateSpectrumChart(
            currentTestData,
            false
        );

        lastSpectrumUpdate =
            now;

    }

}


/* =========================================================
   28. FRECUENCIA REAL
   ========================================================= */

function updateRealSamplingFrequency() {

    if (
        currentTestData.length <
        2
    ) {

        return;

    }


    /*
       Calculamos fs aproximadamente
       sobre el último segundo.
    */
    const finalIndex =
        currentTestData.length - 1;


    const finalTime =
        currentTestData[            finalIndex
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
   29. ACTUALIZAR GRÁFICA
   ========================================================= */

function updateChart(
    currentTime
) {

    /*
       Inicio de la ventana visible.
    */
    const minimumTime =
        Math.max(

            0,

            currentTime -
            visibleWindowSeconds

        );


    /*
       Solo enviamos a Chart.js
       los últimos 5 segundos.
    */
    const visibleData =
        currentTestData.filter(

            function (sample) {

                return (
                    sample.time >=
                    minimumTime
                );

            }

        );


    /* X */
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


    /* Y */
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


    /* Z */
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
       Ventana temporal.
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


    accelerationChart.options.plugins.zoom.limits.x.max =
        Math.max(currentTime, 0.001);


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


    /*
       15 % de margen.
    */
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
   30. DETENER SENSOR
   ========================================================= */

function stopSensor() {

    /*
       DeviceMotionEvent.
    */
    window.removeEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    /*
       Generic Sensor API.
    */
    if (
        genericSensor !== null
    ) {

        try {

            genericSensor.stop();

        }

        catch (error) {

            console.log(
                "Error al detener sensor:",
                error
            );

        }


        genericSensor =
            null;

    }

}


/* =========================================================
   31. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    if (
        !isRecording
    ) {

        return;

    }


    /*
       Marcamos inmediatamente
       que la adquisición termina.
    */
    isRecording =
        false;


    /*
       Detenemos sensor.
    */
    stopSensor();


    /*
       Recuperamos scroll.
    */
    document.body.classList.remove(
        "recording-lock"
    );


    /*
       Recuperamos pantalla normal.
    */
    testForm.classList.remove(
        "measurement-active"
    );


    if (currentTestData.length > 0) {

        updateChart(
            currentTestData[currentTestData.length - 1].time
        );

    }

    enableResultChartNavigation();


    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    /*
       Botón vuelve a estado Play.
    */
    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    testDescription.disabled =
        false;


    /*
       Si hay datos, guardamos el ensayo.
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

        updateSpectrumChart(currentTestData, true);


        /*
           Mostramos:
           otro ensayo,
           CSV,
           terminar.
        */
        finishedTestButtons.style.display =
            "block";

    }

    else {

        /*
           Esto nos ayudará a diagnosticar
           cualquier dispositivo problemático.
        */
        alert(
            "El ensayo se detuvo, pero no se recibió ninguna muestra del acelerómetro."
        );

    }

}


function enableResultChartNavigation() {

    setChartNavigationEnabled(true);

}


function disableChartNavigation() {

    setChartNavigationEnabled(false);

}


function setChartNavigationEnabled(enabled) {

    [accelerationChart, spectrumChart].forEach(function (chart) {

        if (!chart) {
            return;
        }

        chart.options.events = enabled
            ? [
                "wheel",
                "mousedown",
                "mousemove",
                "mouseup",
                "touchstart",
                "touchmove",
                "touchend"
            ]
            : [];

        chart.options.plugins.zoom.pan.enabled = enabled;
        chart.options.plugins.zoom.zoom.wheel.enabled = enabled;
        chart.options.plugins.zoom.zoom.pinch.enabled = enabled;
        chart.update("none");

    });

}


function keepTemporalYAxisCentered(chart) {

    if (!chart || !chart.scales || !chart.scales.y) {
        return;
    }

    const scale = chart.scales.y;
    const halfRange = Math.max(
        Math.abs(scale.min),
        Math.abs(scale.max),
        0.000001
    );

    chart.options.scales.y.min = -halfRange;
    chart.options.scales.y.max = halfRange;

    chart.scales.y.options.min = -halfRange;
    chart.scales.y.options.max = halfRange;
    chart.update("none");

}


function clampTemporalXAxis(chart) {

    if (!chart || !chart.scales || !chart.scales.x) {
        return;
    }

    const scale = chart.scales.x;
    const lower = 0;
    const upper = Math.max(
        chart.options.plugins.zoom.limits.x.max,
        0.001
    );
    const range = scale.max - scale.min;

    let min = scale.min;
    let max = scale.max;

    if (range >= upper - lower) {
        min = lower;
        max = upper;
    } else {
        if (min < lower) {
            min = lower;
            max = min + range;
        }

        if (max > upper) {
            max = upper;
            min = max - range;
        }
    }

    chart.options.scales.x.min = min;
    chart.options.scales.x.max = max;
    scale.options.min = min;
    scale.options.max = max;
    chart.update("none");

}


function clampSpectrumAxes(chart) {

    if (!chart || !chart.scales || !chart.scales.x || !chart.scales.y) {
        return;
    }

    const x = chart.scales.x;
    const y = chart.scales.y;
    const xLower = 0;
    const xUpper = 30;
    const xRange = x.max - x.min;

    let xMin = x.min;
    let xMax = x.max;

    if (xRange >= xUpper - xLower) {
        xMin = xLower;
        xMax = xUpper;
    } else {
        if (xMin < xLower) {
            xMin = xLower;
            xMax = xMin + xRange;
        }

        if (xMax > xUpper) {
            xMax = xUpper;
            xMin = xMax - xRange;
        }
    }

    let yMin = y.min;
    let yMax = y.max;

    if (yMin < 0) {
        yMax -= yMin;
        yMin = 0;
    }

    chart.options.scales.x.min = xMin;
    chart.options.scales.x.max = xMax;
    chart.options.scales.y.min = yMin;
    chart.options.scales.y.max = yMax;
    x.options.min = xMin;
    x.options.max = xMax;
    y.options.min = yMin;
    y.options.max = yMax;
    chart.update("none");

}


/* =========================================================
   32. FRECUENCIA MEDIA DEL ENSAYO
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
   32 bis. ESPECTRO MEDIANTE FFT
   ========================================================= */

function updateSpectrumChart(data, resetZoom = true) {

    if (
        !spectrumChart ||
        data.length < 2
    ) {

        return;

    }

    const duration =
        data[data.length - 1].time - data[0].time;

    if (duration <= 0) {

        return;

    }

    const sampleRate =
        (data.length - 1) / duration;

    /* La FFT necesita una señal uniformemente muestreada. */
    /* Se utiliza todo el registro acumulado. */
    const source = data;

    spectrumChart.data.datasets[0].data = calculateSpectrum(source, "ax", sampleRate);
    spectrumChart.data.datasets[1].data = calculateSpectrum(source, "ay", sampleRate);
    spectrumChart.data.datasets[2].data = calculateSpectrum(source, "az", sampleRate);
    spectrumChart.options.scales.x.min = 0;
    spectrumChart.options.scales.x.max = 30;
    if (
        resetZoom &&
        typeof spectrumChart.resetZoom === "function"
    ) {
        spectrumChart.resetZoom();
    }
    spectrumChart.update("none");

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

/* =========================================================
   33. HACER OTRO ENSAYO
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


        /*
           Limpiamos gráfica.
        */
        accelerationChart
            .data
            .datasets
            .forEach(

                function (dataset) {

                    dataset.data =
                        [];

                }

            );


        /*
           Eliminamos escalas anteriores.
        */
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
   34. DESCARGAR / COMPARTIR CSV
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


        /*
           Cabecera CSV.
        */
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


        /*
           Nombre del fichero.
        */
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


        /*
           Creamos archivo.
        */
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
           =================================================
           IPHONE / MÓVIL

           Utilizamos el menú de compartir
           si el navegador lo permite.
           =================================================
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
                        "Ensayos de pasarela",

                    text:
                        "Datos de aceleración"

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
                    "Error al compartir CSV:",
                    error
                );

            }

        }


        /*
           =================================================
           DESCARGA TRADICIONAL
           =================================================
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
   35. TERMINAR
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
   36. FORMATEAR TIEMPO
   ========================================================= */

function formatTime(
    seconds
) {

    const minutes =
        Math.floor(
            seconds / 60
        );


    const remainingSeconds =
        seconds -
        minutes * 60;


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
