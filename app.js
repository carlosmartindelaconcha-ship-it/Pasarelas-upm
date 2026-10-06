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
   VARIABLES DE ENSAYO
   ========================================================= */

/*
   Estado de grabación.
*/
let isRecording = false;


/*
   Instante de inicio.
*/
let recordingStartTime = null;


/*
   Datos del ensayo actual.
*/
let currentTestData = [];


/*
   Todos los ensayos realizados.
*/
let tests = [];


/*
   Chart.js.
*/
let accelerationChart = null;


/*
   Para no actualizar la gráfica
   con cada muestra del sensor.
*/
let lastChartUpdate = 0;


/*
   Ventana visible de la gráfica.
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


        navigator.geolocation.getCurrentPosition(

            function (position) {

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

            },


            function (error) {

                alert(
                    "No se pudo obtener la ubicación."
                );

                console.log(error);

            },


            {

                enableHighAccuracy: true,

                timeout: 10000,

                maximumAge: 0

            }

        );

    }
);


/* =========================================================
   5. FOTOGRAFÍAS
   ========================================================= */

continueToPhotosButton.addEventListener(
    "click",
    function () {

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


                addPhotoFile(file);

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

    if (!file.type.startsWith("image/")) {

        return;

    }


    selectedPhotos.push(file);


    const imageURL =
        URL.createObjectURL(file);


    const image =
        document.createElement("img");


    image.src =
        imageURL;


    photoPreview.appendChild(image);


    updatePhotoCounter();

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


function updatePhotoCounter() {

    photoCounter.textContent =
        selectedPhotos.length +
        " fotografías añadidas";

}


/* =========================================================
   6. PASAR A ENSAYOS
   ========================================================= */

continueToTestsButton.addEventListener(
    "click",
    function () {

        stopCamera();


        photoForm.style.display =
            "none";


        testForm.style.display =
            "block";


        /*
           Creamos la gráfica
           la primera vez.
        */
        if (accelerationChart === null) {

            createAccelerationChart();

        }

    }
);


/* =========================================================
   7. CREAR GRÁFICA
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
   8. BOTÓN PLAY / STOP
   ========================================================= */

recordButton.addEventListener(
    "click",
    async function () {

        /*
           Si NO estamos grabando,
           comenzamos.
        */
        if (!isRecording) {

            await startRecording();

        }

        /*
           Si ya estábamos grabando,
           detenemos.
        */
        else {

            stopRecording();

        }

    }
);


/* =========================================================
   9. COMENZAR ENSAYO
   ========================================================= */

async function startRecording() {

    /*
       Comprobamos descripción.
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
       En algunos iPhone hace falta
       pedir permiso explícito.
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
       Limpiamos ensayo anterior.
    */
    currentTestData = [];


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


    /*
       Guardamos instante inicial.
    */
    recordingStartTime =
        performance.now();


    isRecording = true;


    /*
       Cambiamos aspecto del botón.
    */
    recordButton.textContent =
        "■ Detener";


    recordButton.classList.add(
        "recording"
    );


    /*
       Ocultamos botones finales.
    */
    finishedTestButtons.style.display =
        "none";


    /*
       Bloqueamos la descripción
       durante la adquisición.
    */
    testDescription.disabled =
        true;


    sensorStatus.textContent =
        "● Midiendo";


    /*
       Empezamos a escuchar
       los datos del acelerómetro.
    */
    window.addEventListener(
        "devicemotion",
        handleMotion
    );

}


/* =========================================================
   10. PROCESAR MUESTRA
   ========================================================= */

function handleMotion(event) {

    /*
       Solo guardamos cuando
       estamos grabando.
    */
    if (!isRecording) {

        return;

    }


    /*
       Preferimos acceleration,
       que intenta eliminar gravedad.
    */
    let acceleration =
        event.acceleration;


    /*
       Si el móvil no la proporciona,
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
       Tiempo desde inicio.
    */
    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    /*
       Guardamos TODAS las muestras.
    */
    currentTestData.push({

        time: time,

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
       Información del ensayo.
    */
    elapsedTimeElement.textContent =
        formatTime(time);


    sampleCountElement.textContent =
        currentTestData.length;


    /*
       Estimamos frecuencia.
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
       Actualizamos la gráfica
       aproximadamente 25 veces por segundo.
    */
    const now =
        performance.now();


    if (
        now - lastChartUpdate >
        40
    ) {

        updateChart(time);

        lastChartUpdate =
            now;

    }

}


/* =========================================================
   11. ACTUALIZAR GRÁFICA
   ========================================================= */

function updateChart(currentTime) {

    /*
       Solo mostramos los últimos
       5 segundos.
    */
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


    /*
       X
    */
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


    /*
       Y
    */
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


    /*
       Z
    */
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
       Ventana móvil del eje X.
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
       AUTOESCALA DEL EJE Y
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
       Añadimos un 15 % de margen.
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
       Actualizamos sin animación.
    */
    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   12. DETENER ENSAYO
   ========================================================= */

function stopRecording() {

    isRecording =
        false;


    window.removeEventListener(
        "devicemotion",
        handleMotion
    );


    /*
       Restauramos botón.
    */
    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    /*
       Permitimos volver a editar
       la descripción después.
    */
    testDescription.disabled =
        false;


    sensorStatus.textContent =
        "Ensayo finalizado";


    /*
       Guardamos el ensayo.
    */
    tests.push({

        description:
            testDescription.value.trim(),

        data:
            [...currentTestData]

    });


    /*
       Mostramos botones finales.
    */
    finishedTestButtons.style.display =
        "block";

}


/* =========================================================
   13. HACER OTRO ENSAYO
   ========================================================= */

newTestButton.addEventListener(
    "click",
    function () {

        /*
           Limpiamos descripción.
        */
        testDescription.value =
            "";


        /*
           Limpiamos datos.
        */
        currentTestData =
            [];


        /*
           Reiniciamos textos.
        */
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


        accelerationChart.update();


        /*
           Ocultamos botones finales.
        */
        finishedTestButtons.style.display =
            "none";


        /*
           Ponemos el cursor
           en la descripción.
        */
        testDescription.focus();

    }
);


/* =========================================================
   14. TERMINAR
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
   15. FORMATEAR TIEMPO
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