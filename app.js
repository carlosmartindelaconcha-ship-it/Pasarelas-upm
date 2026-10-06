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

let map =
    null;

let bridgeMarker =
    null;

let selectedPhotos =
    [];

let cameraStream =
    null;


/* =========================================================
   VARIABLES GPS
   ========================================================= */

let bestPosition =
    null;

let gpsWatchId =
    null;

let gpsTimeoutId =
    null;


/* =========================================================
   VARIABLES DEL ENSAYO
   ========================================================= */

let isRecording =
    false;

let recordingStartTime =
    null;

let currentTestData =
    [];

let tests =
    [];

let accelerationChart =
    null;

let lastChartUpdate =
    0;


/*
   Ventana temporal visible en la gráfica.
*/
const visibleWindowSeconds =
    5;


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


        /*
           watchPosition permite que el móvil vaya
           refinando progresivamente la posición.
        */
        gpsWatchId =
            navigator.geolocation.watchPosition(


                /* =========================================
                   NUEVA POSICIÓN
                   ========================================= */

                function (position) {

                    /*
                       Solo conservamos la nueva posición
                       cuando mejora la precisión anterior.
                    */
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
                       10 m de precisión nos parece
                       suficientemente bueno.
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
                        error.code,
                        error.message
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
   DETENER BÚSQUEDA GPS
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
   5. PASAR A FOTOGRAFÍAS
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
   6. ABRIR CÁMARA
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
   7. CAPTURAR FOTO
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
   8. CERRAR CÁMARA
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
   9. AÑADIR FOTO
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
   10. GALERÍA
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
   CONTADOR DE FOTOS
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
   11. PASAR A ENSAYOS
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
   12. CREAR GRÁFICA
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
                       No queremos que Chart.js
                       capture gestos táctiles.
                    */
                    events:
                        [],


                    plugins: {

                        legend: {

                            display:
                                true

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
   13. PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        if (
            !isRecording
        ) {

            await startRecording();

        }

        else {

            stopRecording();

        }

    }
);


/* =========================================================
   14. COMENZAR ENSAYO
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
       iOS exige permiso explícito
       para acceder a DeviceMotionEvent.
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


    /* =====================================================
       LIMPIAR ENSAYO ANTERIOR
       ===================================================== */

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


    /* =====================================================
       INICIO TEMPORAL
       ===================================================== */

    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    isRecording =
        true;


    /* =====================================================
       ENTRAR EN MODO DE ADQUISICIÓN
       ===================================================== */

    /*
       Bloqueamos el scroll de toda la página.
    */
    document.body.classList.add(
        "recording-lock"
    );


    /*
       Convertimos la pantalla de ensayo
       en la interfaz compacta de adquisición.
    */
    testForm.classList.add(
        "measurement-active"
    );


    /*
       Safari puede necesitar un instante para recalcular
       el tamaño del canvas después de cambiar el layout.
    */
    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    /* =====================================================
       BOTÓN STOP
       ===================================================== */

    recordButton.textContent =
        "■ Detener ensayo";


    recordButton.classList.add(
        "recording"
    );


    /* =====================================================
       RESTO DE LA INTERFAZ
       ===================================================== */

    finishedTestButtons.style.display =
        "none";


    testDescription.disabled =
        true;


    sensorStatus.textContent =
        "● Midiendo";


    /*
       Comenzamos a recibir muestras
       del acelerómetro.
    */
    window.addEventListener(
        "devicemotion",
        handleMotion
    );

}


/* =========================================================
   15. RECIBIR MUESTRA DEL ACELERÓMETRO
   ========================================================= */

function handleMotion(
    event
) {

    if (
        !isRecording
    ) {

        return;

    }


    /*
       Intentamos utilizar aceleración
       sin componente gravitatoria.
    */
    let acceleration =
        event.acceleration;


    /*
       Algunos dispositivos no proporcionan
       acceleration y debemos recurrir a
       accelerationIncludingGravity.
    */
    if (

        acceleration === null ||

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


    const ax =
        acceleration.x ?? 0;

    const ay =
        acceleration.y ?? 0;

    const az =
        acceleration.z ?? 0;


    /*
       Tiempo transcurrido desde Play.
    */
    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    /*
       Diferencia temporal respecto
       de la muestra anterior.
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


    /* =====================================================
       GUARDADO DE LA MUESTRA
       =====================================================

       Esto ocurre ANTES de actualizar la gráfica.
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


    /* =====================================================
       VALORES NUMÉRICOS
       ===================================================== */

    axValue.textContent =
        ax.toFixed(3);

    ayValue.textContent =
        ay.toFixed(3);

    azValue.textContent =
        az.toFixed(3);


    /* =====================================================
       TIEMPO
       ===================================================== */

    elapsedTimeElement.textContent =
        formatTime(
            time
        );


    /* =====================================================
       Nº DE MUESTRAS
       ===================================================== */

    sampleCountElement.textContent =
        currentTestData.length;


    /* =====================================================
       FRECUENCIA MEDIA DE MUESTREO
       ===================================================== */

    if (
        currentTestData.length > 1
    ) {

        const firstTime =
            currentTestData[0].time;


        const lastTime =
            currentTestData[
                currentTestData.length - 1
            ].time;


        const duration =
            lastTime -
            firstTime;


        if (
            duration > 0
        ) {

            const fs =
                (
                    currentTestData.length - 1
                ) /
                duration;


            samplingFrequencyElement.textContent =
                "fs: " +
                fs.toFixed(1) +
                " Hz";

        }

    }


    /* =====================================================
       ACTUALIZACIÓN DE GRÁFICA
       ===================================================== */

    /*
       Las muestras pueden llegar más rápido
       de lo que necesitamos redibujar.

       Guardamos TODAS las muestras,
       pero dibujamos aproximadamente a 25 FPS.
    */
    const now =
        performance.now();


    if (
        now -
        lastChartUpdate >=
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
   16. ACTUALIZAR GRÁFICA
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
       Solo seleccionamos los datos
       de los últimos 5 segundos.

       currentTestData sigue conservando TODO.
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


    /* =====================================================
       SERIE X
       ===================================================== */

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


    /* =====================================================
       SERIE Y
       ===================================================== */

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


    /* =====================================================
       SERIE Z
       ===================================================== */

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


    /* =====================================================
       VENTANA TEMPORAL
       ===================================================== */

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


    /* =====================================================
       AUTOESCALA Y
       ===================================================== */

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
       Dejamos un margen del 15 %.
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
       Repintamos sin animación.
    */
    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   17. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    if (
        !isRecording
    ) {

        return;

    }


    isRecording =
        false;


    /*
       Dejamos de escuchar el acelerómetro.
    */
    window.removeEventListener(
        "devicemotion",
        handleMotion
    );


    /* =====================================================
       SALIR DEL MODO DE ADQUISICIÓN
       ===================================================== */

    document.body.classList.remove(
        "recording-lock"
    );


    testForm.classList.remove(
        "measurement-active"
    );


    /*
       Recalculamos el tamaño de la gráfica
       una vez recuperada la pantalla normal.
    */
    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    /* =====================================================
       INTERFAZ
       ===================================================== */

    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    testDescription.disabled =
        false;


    sensorStatus.textContent =
        "Ensayo finalizado";


    /* =====================================================
       GUARDAR ENSAYO
       ===================================================== */

    tests.push({

        description:
            testDescription
                .value
                .trim(),

        data:
            [...currentTestData]

    });


    /*
       Ahora sí mostramos las opciones:
       otro ensayo / CSV / terminar.
    */
    finishedTestButtons.style.display =
        "block";

}


/* =========================================================
   18. HACER OTRO ENSAYO
   ========================================================= */

newTestButton.addEventListener(
    "click",
    function () {

        /*
           Nueva descripción.
        */
        testDescription.value =
            "";


        currentTestData =
            [];


        /* =================================================
           REINICIAR INDICADORES
           ================================================= */

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


        /* =================================================
           LIMPIAR GRÁFICA
           ================================================= */

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
           Quitamos límites antiguos
           de los ejes.
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
   19. DESCARGAR / COMPARTIR CSV
   ========================================================= */

downloadCsvButton.addEventListener(
    "click",
    async function () {

        if (
            tests.length === 0
        ) {

            alert(
                "No hay ensayos disponibles para descargar."
            );

            return;

        }


        /* =================================================
           CREAR CSV
           ================================================= */

        let csv =
            "test_id,description,time,dt,ax,ay,az\n";


        tests.forEach(

            function (
                test,
                testIndex
            ) {

                const testId =
                    testIndex + 1;


                /*
                   Protegemos posibles comillas
                   dentro de la descripción.
                */
                const description =
                    '"' +

                    test.description.replaceAll(
                        '"',
                        '""'
                    ) +

                    '"';


                test.data.forEach(

                    function (sample) {

                        /*
                           La primera muestra no tiene dt.
                        */
                        const dtValue =
                            sample.dt === null
                                ? ""
                                : sample.dt.toFixed(6);


                        csv +=

                            testId +
                            "," +

                            description +
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


        /* =================================================
           NOMBRE DEL ARCHIVO
           ================================================= */

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


        /* =================================================
           CREAR ARCHIVO REAL
           ================================================= */

        const csvFile =
            new File(

                [csv],

                fileName,

                {
                    type:
                        "text/csv;charset=utf-8"
                }

            );


        /* =================================================
           IPHONE / IOS
           =================================================

           Si podemos compartir archivos,
           utilizamos el menú nativo de compartir.

           Desde ahí el alumno puede elegir:
           "Guardar en Archivos".
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
                        "Datos de aceleración de los ensayos"

                });


                return;

            }

            catch (error) {

                /*
                   Si simplemente ha cerrado
                   el menú de compartir, no es un error.
                */
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


        /* =================================================
           DESCARGA NORMAL
           ================================================= */

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


        /*
           Algunos navegadores necesitan
           que el enlace esté físicamente en el DOM.
        */
        document.body.appendChild(
            link
        );


        link.click();


        document.body.removeChild(
            link
        );


        /*
           Esperamos antes de liberar la URL.
        */
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
   20. TERMINAR
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
   21. FORMATEAR TIEMPO
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
