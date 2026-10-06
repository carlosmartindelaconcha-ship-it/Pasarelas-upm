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
   VARIABLES GPS
   ========================================================= */

/*
   Guardaremos la mejor posición recibida,
   es decir, la de menor valor de "accuracy".
*/
let bestPosition = null;


/*
   ID que devuelve watchPosition().
   Lo usaremos para detener la escucha.
*/
let gpsWatchId = null;


/*
   Temporizador para detener la búsqueda GPS
   después de unos segundos.
*/
let gpsTimeoutId = null;


/* =========================================================
   VARIABLES DE ENSAYO
   ========================================================= */

let isRecording = false;

let recordingStartTime = null;

let currentTestData = [];

let tests = [];

let accelerationChart = null;

let lastChartUpdate = 0;

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

        /*
           Comprobamos si el navegador
           soporta geolocalización.
        */
        if (!navigator.geolocation) {

            alert(
                "Este navegador no permite utilizar la geolocalización."
            );

            return;

        }


        /*
           Si hubiera una búsqueda GPS anterior activa,
           la detenemos antes de comenzar otra.
        */
        stopGPSWatch();


        /*
           Reiniciamos la mejor posición.
        */
        bestPosition = null;


        /*
           Informamos al usuario.
        */
        gpsButton.textContent =
            "Buscando ubicación...";


        gpsButton.disabled =
            true;


        /*
           Empezamos a recibir posiciones.

           watchPosition puede devolver varias lecturas:
           primero una aproximada y después otras
           más precisas.
        */
        gpsWatchId =
            navigator.geolocation.watchPosition(


                /* =========================================
                   POSICIÓN RECIBIDA
                   ========================================= */
                function (position) {

                    /*
                       Si todavía no tenemos ninguna posición,
                       la guardamos.

                       Si ya tenemos una, solo sustituimos
                       cuando la nueva tiene mejor precisión.
                    */
                    if (
                        bestPosition === null ||
                        position.coords.accuracy <
                        bestPosition.coords.accuracy
                    ) {

                        bestPosition =
                            position;


                        /*
                           Actualizamos la interfaz
                           con la mejor posición disponible
                           hasta ese momento.
                        */
                        updateGPSPosition(
                            bestPosition
                        );

                    }


                    /*
                       Si conseguimos una precisión
                       de 10 metros o mejor,
                       damos la búsqueda por suficientemente buena.
                    */
                    if (
                        position.coords.accuracy <= 10
                    ) {

                        stopGPSWatch();

                    }

                },


                /* =========================================
                   ERROR DE GEOLOCALIZACIÓN
                   ========================================= */
                function (error) {

                    /*
                       Detenemos cualquier búsqueda activa.
                    */
                    stopGPSWatch();


                    /*
                       Mostramos un mensaje según
                       el tipo de error.
                    */
                    if (error.code === 1) {

                        alert(
                            "Permiso de ubicación denegado. " +
                            "Comprueba los permisos de ubicación de Safari."
                        );

                    }

                    else if (error.code === 2) {

                        alert(
                            "El dispositivo no ha podido determinar la ubicación. " +
                            "Inténtalo de nuevo, preferiblemente al aire libre."
                        );

                    }

                    else if (error.code === 3) {

                        alert(
                            "Se ha agotado el tiempo intentando obtener la ubicación. " +
                            "Vuelve a intentarlo."
                        );

                    }

                    else {

                        alert(
                            "Error desconocido al obtener la ubicación."
                        );

                    }


                    /*
                       Dejamos información técnica
                       en la consola del navegador.
                    */
                    console.log(
                        "Error GPS:",
                        error.code,
                        error.message
                    );

                },


                /* =========================================
                   OPCIONES GPS
                   ========================================= */
                {

                    /*
                       Pedimos la mejor precisión posible.
                    */
                    enableHighAccuracy: true,


                    /*
                       Permitimos que cada lectura tarde
                       hasta 30 segundos.
                    */
                    timeout: 30000,


                    /*
                       Permitimos reutilizar una posición
                       reciente de hasta 10 segundos.
                    */
                    maximumAge: 10000

                }

            );


        /*
           Aunque watchPosition siga esperando,
           después de 20 segundos nos quedamos
           con la mejor lectura obtenida.
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
   5. ACTUALIZAR POSICIÓN GPS
   ========================================================= */

function updateGPSPosition(position) {

    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const accuracy =
        position.coords.accuracy;


    /*
       Mostramos los datos.
    */
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


    /*
       Centramos el mapa.
    */
    map.flyTo({

        center: [
            longitude,
            latitude
        ],

        zoom: 17

    });


    /*
       Eliminamos marcador anterior.
    */
    if (bridgeMarker !== null) {

        bridgeMarker.remove();

    }


    /*
       Creamos nuevo marcador.
    */
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
   6. DETENER BÚSQUEDA GPS
   ========================================================= */

function stopGPSWatch() {

    /*
       Si hay un watchPosition activo,
       lo detenemos.
    */
    if (gpsWatchId !== null) {

        navigator.geolocation.clearWatch(
            gpsWatchId
        );

        gpsWatchId =
            null;

    }


    /*
       Si existe el temporizador,
       lo cancelamos.
    */
    if (gpsTimeoutId !== null) {

        clearTimeout(
            gpsTimeoutId
        );

        gpsTimeoutId =
            null;

    }


    /*
       Restauramos el botón.
    */
    gpsButton.textContent =
        "Obtener ubicación";


    gpsButton.disabled =
        false;

}


/* =========================================================
   7. PASAR A FOTOGRAFÍAS
   ========================================================= */

continueToPhotosButton.addEventListener(
    "click",
    function () {

        /*
           Por seguridad detenemos
           cualquier búsqueda GPS activa.
        */
        stopGPSWatch();


        bridgeForm.style.display =
            "none";

        photoForm.style.display =
            "block";

    }
);


/* =========================================================
   8. FOTOGRAFÍAS
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
   9. PASAR A ENSAYOS
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
   10. CREAR GRÁFICA
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
   11. BOTÓN PLAY / STOP
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
   12. COMENZAR ENSAYO
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


    window.addEventListener(
        "devicemotion",
        handleMotion
    );

}


/* =========================================================
   13. PROCESAR MUESTRA
   ========================================================= */

function handleMotion(event) {

    if (!isRecording) {

        return;

    }


    let acceleration =
        event.acceleration;


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


    const time =
        (
            performance.now() -
            recordingStartTime
        ) / 1000;


    currentTestData.push({

        time: time,

        ax: ax,

        ay: ay,

        az: az

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
   14. ACTUALIZAR GRÁFICA
   ========================================================= */

function updateChart(currentTime) {

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
                    x: sample.time,
                    y: sample.ax
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
                    x: sample.time,
                    y: sample.ay
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
                    x: sample.time,
                    y: sample.az
                };

            }
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
   15. DETENER ENSAYO
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
   16. HACER OTRO ENSAYO
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
   17. TERMINAR
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
   18. FORMATEAR TIEMPO
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
