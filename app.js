/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. ELEMENTOS DE LA INTERFAZ
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

const sensorStatus =
    document.getElementById("sensorStatus");

const axValue =
    document.getElementById("axValue");

const ayValue =
    document.getElementById("ayValue");

const azValue =
    document.getElementById("azValue");


/* =========================================================
   2. VARIABLES GENERALES
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
   ENSAYOS
   ========================================================= */

let isRecording = false;

let recordingStartTime = null;

let currentTestData = [];

let tests = [];

let accelerationChart = null;


/*
   Momento del último repintado de la gráfica.

   IMPORTANTE:
   Esto solo afecta a la representación,
   NO al guardado de muestras.
*/
let lastChartUpdate = 0;


/*
   Mostramos siempre los últimos 5 segundos.
*/
const visibleWindowSeconds = 5;


/* =========================================================
   3. NAVEGACIÓN
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
   4. GPS
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
                   POSICIÓN RECIBIDA
                   ========================================= */
                function (position) {

                    if (
                        bestPosition === null ||
                        position.coords.accuracy <
                        bestPosition.coords.accuracy
                    ) {

                        bestPosition =
                            position;


                        updateGPSPosition(
                            bestPosition
                        );

                    }


                    /*
                       Si conseguimos 10 m o mejor,
                       dejamos de buscar.
                    */
                    if (
                        position.coords.accuracy <= 10
                    ) {

                        stopGPSWatch();

                    }

                },


                /* =========================================
                   ERROR
                   ========================================= */
                function (error) {

                    stopGPSWatch();


                    let message =
                        "";


                    if (error.code === 1) {

                        message =
                            "ERROR 1: permiso de ubicación denegado.";

                    }

                    else if (error.code === 2) {

                        message =
                            "ERROR 2: posición no disponible.";

                    }

                    else if (error.code === 3) {

                        message =
                            "ERROR 3: tiempo de espera agotado.";

                    }

                    else {

                        message =
                            "Error desconocido de geolocalización.";

                    }


                    alert(
                        message +
                        "\n\n" +
                        "Mensaje del navegador: " +
                        error.message
                    );


                    console.log(
                        "Error GPS:",
                        error.code,
                        error.message
                    );

                },


                /* =========================================
                   OPCIONES
                   ========================================= */
                {

                    enableHighAccuracy: true,

                    timeout: 30000,

                    maximumAge: 10000

                }

            );


        /*
           Máximo 20 s buscando una posición mejor.
        */
        gpsTimeoutId =
            setTimeout(
                function () {

                    stopGPSWatch();

                },
                20000
            );

    }
);


/* =========================================================
   ACTUALIZAR GPS
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
            .setPopup(

                new maplibregl.Popup()
                    .setHTML(
                        "<strong>Ubicación de la pasarela</strong><br>" +
                        "Precisión: " +
                        accuracy.toFixed(1) +
                        " m"
                    )

            )
            .addTo(map);

}


/* =========================================================
   DETENER GPS
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
   5. PASAR A FOTOS
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
   6. CÁMARA
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
                                ideal: "environment"
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
   CAPTURAR FOTO
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
            cameraCanvas.getContext("2d");


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
                            type: "image/jpeg"
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
   CERRAR CÁMARA
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
   AÑADIR FOTO
   ========================================================= */

function addPhotoFile(file) {

    if (!file.type.startsWith("image/")) {

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
   GALERÍA
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
   CONTADOR FOTOS
   ========================================================= */

function updatePhotoCounter() {

    photoCounter.textContent =
        selectedPhotos.length +
        " fotografías añadidas";

}


/* =========================================================
   7. PASAR A ENSAYOS
   ========================================================= */

continueToTestsButton.addEventListener(
    "click",
    function () {

        stopCamera();


        photoForm.style.display =
            "none";


        testForm.style.display =
            "block";


        if (accelerationChart === null) {

            createAccelerationChart();

        }

    }
);


/* =========================================================
   8. CREAR GRÁFICA
   ========================================================= */

function createAccelerationChart() {

    const context =
        document
            .getElementById(
                "accelerationChart"
            )
            .getContext("2d");


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


                    /*
                       IMPORTANTE PARA EL SCROLL:

                       Desactivamos eventos internos de Chart.js.

                       Así la gráfica no intenta interpretar
                       toques, movimientos o clics.
                    */
                    events: [],


                    interaction: {

                        intersect: false

                    },


                    scales: {

                        x: {

                            type: "linear",

                            title: {

                                display: true,

                                text: "Tiempo (s)"

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
   9. BOTÓN PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        if (!isRecording) {

            await startRecording();

        }

        else {

            stopRecording();

        }

    }
);


/* =========================================================
   10. COMENZAR ENSAYO
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
       En iPhone hay que pedir permiso
       explícitamente al acelerómetro.
    */
    if (
        typeof DeviceMotionEvent !==
            "undefined" &&
        typeof DeviceMotionEvent
            .requestPermission ===
            "function"
    ) {

        const permission =
            await DeviceMotionEvent
                .requestPermission();


        if (
            permission !==
            "granted"
        ) {

            alert(
                "No se concedió permiso para utilizar el acelerómetro."
            );

            return;

        }

    }


    /*
       Limpiamos datos del ensayo anterior.
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


    accelerationChart.update();


    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    isRecording =
        true;


    recordButton.textContent =
        "■ Detener";


    recordButton.classList.add(
        "recording"
    );


    finishedTestButtons.style.display =
        "none";


    testDescription.disabled =
        true;


    sensorStatus.textContent =
        "● Midiendo";


    /*
       Aquí se reciben las muestras.

       IMPORTANTE:
       La adquisición NO depende de la gráfica.
    */
    window.addEventListener(
        "devicemotion",
        handleMotion
    );

}


/* =========================================================
   11. PROCESAR CADA MUESTRA
   ========================================================= */

function handleMotion(event) {

    if (!isRecording) {

        return;

    }


    /*
       Intentamos utilizar aceleración
       sin gravedad.
    */
    let acceleration =
        event.acceleration;


    /*
       Si el teléfono no la proporciona,
       usamos accelerationIncludingGravity.
    */
    if (
        acceleration === null ||
        acceleration.x === null
    ) {

        acceleration =
            event.accelerationIncludingGravity;

    }


    if (!acceleration) {

        return;

    }


    const ax =
        acceleration.x ?? 0;

    const ay =
        acceleration.y ?? 0;

    const az =
        acceleration.z ?? 0;


    /*
       Tiempo real desde el inicio.
    */
    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    /*
       Calculamos dt respecto
       de la muestra anterior.

       Esto nos permitirá comprobar
       si hubo huecos durante el scroll.
    */
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
       IMPORTANTE:

       Guardamos SIEMPRE la muestra.

       Esto ocurre antes de cualquier actualización
       de la gráfica.
    */
    currentTestData.push({

        time: time,

        dt: dt,

        ax: ax,

        ay: ay,

        az: az

    });


    /*
       Actualizamos valores numéricos.
    */
    axValue.textContent =
        ax.toFixed(3);

    ayValue.textContent =
        ay.toFixed(3);

    azValue.textContent =
        az.toFixed(3);


    /*
       Tiempo y nº de muestras.
    */
    elapsedTimeElement.textContent =
        formatTime(
            time
        );


    sampleCountElement.textContent =
        currentTestData.length;


    /*
       Estimación de fs media.
    */
    if (
        currentTestData.length > 1
    ) {

        const firstTime =
            currentTestData[0].time;


        const lastTime =
            currentTestData[
                currentTestData.length - 1
            ].time;


        const fs =
            (
                currentTestData.length - 1
            ) /
            (
                lastTime -
                firstTime
            );


        samplingFrequencyElement.textContent =
            "fs: " +
            fs.toFixed(1) +
            " Hz";

    }


    /*
       La gráfica se actualiza más despacio
       que la adquisición.

       Aunque Safari tarde en repintar,
       las muestras ya están guardadas.
    */
    const now =
        performance.now();


    if (
        now - lastChartUpdate >
        40
    ) {

        updateChart(
            time
        );


        lastChartUpdate =
            now;

    }

}


/* =========================================================
   12. ACTUALIZAR GRÁFICA
   ========================================================= */

function updateChart(currentTime) {

    /*
       Solo mostramos últimos 5 segundos.
    */
    const minimumTime =
        Math.max(
            0,
            currentTime -
            visibleWindowSeconds
        );


    /*
       IMPORTANTE:

       La gráfica usa solo una vista de los datos.

       currentTestData sigue conteniendo
       TODO el ensayo.
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

                    x: sample.time,

                    y: sample.ax

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

                    x: sample.time,

                    y: sample.ay

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

                    x: sample.time,

                    y: sample.az

                };

            }
        );


    /*
       Ventana móvil X.
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
       AUTOESCALA Y.
    */
    let maximumAcceleration =
        0.1;


    visibleData.forEach(
        function (sample) {

            maximumAcceleration =
                Math.max(
                    maximumAcceleration,
                    Math.abs(sample.ax),
                    Math.abs(sample.ay),
                    Math.abs(sample.az)
                );

        }
    );


    /*
       Margen del 15 %.
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


    /*
       Repintado sin animación.
    */
    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   13. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    isRecording =
        false;


    window.removeEventListener(
        "devicemotion",
        handleMotion
    );


    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    testDescription.disabled =
        false;


    sensorStatus.textContent =
        "Ensayo finalizado";


    /*
       Guardamos el ensayo completo.

       Incluye TODOS los datos,
       no solo los 5 s visibles.
    */
    tests.push({

        description:
            testDescription.value.trim(),

        data:
            [...currentTestData]

    });


    finishedTestButtons.style.display =
        "block";

}


/* =========================================================
   14. HACER OTRO ENSAYO
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
            "fs: -- Hz";


        sensorStatus.textContent =
            "Sensor preparado";


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


        accelerationChart.update();


        finishedTestButtons.style.display =
            "none";


        testDescription.focus();

    }
);


/* =========================================================
   15. DESCARGAR CSV
   ========================================================= */

downloadCsvButton.addEventListener(
    "click",
    function () {

        /*
           Comprobamos que haya ensayos.
        */
        if (
            tests.length === 0
        ) {

            alert(
                "No hay ensayos disponibles para descargar."
            );

            return;

        }


        /*
           Cabecera CSV.

           dt se expresa en segundos.
        */
        let csv =
            "test_id,description,time,dt,ax,ay,az\n";


        /*
           Recorremos todos los ensayos.
        */
        tests.forEach(
            function (
                test,
                testIndex
            ) {

                const testId =
                    testIndex + 1;


                /*
                   Escapamos comillas
                   de la descripción.
                */
                const description =
                    '"' +
                    test.description
                        .replaceAll(
                            '"',
                            '""'
                        ) +
                    '"';


                /*
                   Recorremos todas las muestras.
                */
                test.data.forEach(
                    function (sample) {

                        /*
                           La primera muestra
                           no tiene dt.
                        */
                        const dtValue =
                            sample.dt === null
                                ? ""
                                : sample.dt.toFixed(6);


                        csv +=
                            testId + "," +
                            description + "," +
                            sample.time.toFixed(6) + "," +
                            dtValue + "," +
                            sample.ax.toFixed(6) + "," +
                            sample.ay.toFixed(6) + "," +
                            sample.az.toFixed(6) +
                            "\n";

                    }
                );

            }
        );


        /*
           Creamos un archivo CSV
           en memoria.
        */
        const blob =
            new Blob(
                [csv],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );


        /*
           URL temporal.
        */
        const url =
            URL.createObjectURL(
                blob
            );


        /*
           Creamos un enlace invisible.
        */
        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        /*
           Nombre de archivo.

           Date.now() evita sobreescribir
           fácilmente archivos anteriores.
        */
        link.download =
            "ensayos_pasarela_" +
            Date.now() +
            ".csv";


        document.body.appendChild(
            link
        );


        /*
           Iniciamos descarga.
        */
        link.click();


        /*
           Limpiamos.
        */
        document.body.removeChild(
            link
        );


        URL.revokeObjectURL(
            url
        );

    }
);


/* =========================================================
   16. TERMINAR
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
   17. FORMATEAR TIEMPO
   ========================================================= */

function formatTime(seconds) {

    const minutes =
        Math.floor(
            seconds / 60
        );


    const remainingSeconds =
        seconds -
        minutes * 60;


    return (
        String(minutes)
            .padStart(2, "0") +
        ":" +
        remainingSeconds
            .toFixed(2)
            .padStart(5, "0")
    );

}
