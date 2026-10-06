/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. CONFIGURACIÓN DEL ACELERÓMETRO
   ========================================================= */

/*
   Frecuencia que SOLICITAMOS cuando el navegador
   soporta Generic Sensor API.

   IMPORTANTE:
   pedir 250 Hz NO significa necesariamente
   obtener exactamente 250 Hz.

   Siempre calcularemos después la frecuencia real.
*/
const requestedSensorFrequency =
    250;


/*
   La gráfica solo muestra los últimos 5 segundos.
*/
const visibleWindowSeconds =
    5;


/*
   Intervalo aproximado de actualización gráfica.

   40 ms = unas 25 actualizaciones de pantalla por segundo.

   Esto NO es la frecuencia de adquisición.

   Podemos adquirir, por ejemplo, a 250 Hz y dibujar
   únicamente a 25 FPS.
*/
const chartUpdateInterval =
    40;


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


/* =========================================================
   3. VARIABLES GENERALES
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
   VARIABLES DEL ACELERÓMETRO
   ========================================================= */

/*
   Indica si estamos realizando un ensayo.
*/
let isRecording =
    false;


/*
   Tiempo de inicio del ensayo.
*/
let recordingStartTime =
    null;


/*
   Datos del ensayo actual.
*/
let currentTestData =
    [];


/*
   Todos los ensayos realizados.
*/
let tests =
    [];


/*
   Gráfica Chart.js.
*/
let accelerationChart =
    null;


/*
   Última actualización de la gráfica.
*/
let lastChartUpdate =
    0;


/*
   Sensor de Generic Sensor API.

   Será null cuando estemos usando
   DeviceMotionEvent.
*/
let genericSensor =
    null;


/*
   Modo utilizado realmente durante el ensayo.

   Posibles valores:
   "Generic Sensor API"
   "DeviceMotionEvent"
*/
let currentSensorMode =
    "";


/*
   Tipo concreto de sensor avanzado utilizado.
*/
let currentSensorType =
    "";


/*
   Evita procesar lecturas de un sensor antiguo
   si se cambia de mecanismo.
*/
let sensorSessionId =
    0;


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


        bestPosition =
            null;


        gpsButton.textContent =
            "Buscando ubicación...";


        gpsButton.disabled =
            true;


        gpsWatchId =
            navigator.geolocation.watchPosition(


                function (position) {

                    /*
                       Conservamos la posición
                       con mejor precisión.
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
                       Si llegamos a 10 m o mejor,
                       dejamos de buscar.
                    */
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
                        error.code,
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
   ACTUALIZAR POSICIÓN GPS
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

            .addTo(map);

}


/* =========================================================
   DETENER GPS
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
   6. PASAR A FOTOGRAFÍAS
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
   7. CÁMARA
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
   CERRAR CÁMARA
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
   AÑADIR FOTO
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


    image.alt =
        "Fotografía de la pasarela";


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
   8. PASAR A ENSAYOS
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
   9. CREAR GRÁFICA
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
                       Chart.js no necesita gestionar
                       gestos táctiles.
                    */
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
   10. BOTÓN PLAY / STOP
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
   11. COMENZAR ENSAYO
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
       Detenemos cualquier sensor anterior
       por seguridad.
    */
    stopSensor();


    /*
       Nueva sesión de sensor.
    */
    sensorSessionId++;


    /*
       Limpiamos el ensayo.
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
       Reiniciamos indicadores.
    */
    elapsedTimeElement.textContent =
        "00:00.00";


    sampleCountElement.textContent =
        "0";


    samplingFrequencyElement.textContent =
        "-- Hz";


    sensorModeElement.textContent =
        "Iniciando...";


    targetFrequencyElement.textContent =
        "--";


    /*
       Inicio temporal.
    */
    recordingStartTime =
        performance.now();


    lastChartUpdate =
        recordingStartTime;


    isRecording =
        true;


    /*
       Entramos en modo instrumento.
    */
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


    finishedTestButtons.style.display =
        "none";


    testDescription.disabled =
        true;


    setTimeout(
        function () {

            accelerationChart.resize();

        },
        50
    );


    /*
       Intentamos iniciar automáticamente
       el mejor sensor disponible.
    */
    const sensorStarted =
        await startBestAvailableSensor();


    /*
       Si absolutamente ningún sensor
       puede iniciarse, abortamos.
    */
    if (
        !sensorStarted
    ) {

        alert(
            "No se ha podido acceder al acelerómetro de este dispositivo."
        );


        stopRecording(
            false
        );

    }

}


/* =========================================================
   12. ELEGIR EL MEJOR SENSOR DISPONIBLE
   ========================================================= */

async function startBestAvailableSensor() {

    /*
       -----------------------------------------------------
       OPCIÓN 1:
       LinearAccelerationSensor

       Es ideal porque pretende proporcionar
       aceleración lineal sin gravedad.

       No todos los navegadores lo implementan.
       -----------------------------------------------------
    */

    if (
        "LinearAccelerationSensor" in window
    ) {

        const success =
            await tryGenericSensor(
                "LinearAccelerationSensor"
            );


        if (
            success
        ) {

            return true;

        }

    }


    /*
       -----------------------------------------------------
       OPCIÓN 2:
       Accelerometer

       Generic Sensor API estándar.

       En dispositivos compatibles pedimos
       requestedSensorFrequency.
       -----------------------------------------------------
    */

    if (
        "Accelerometer" in window
    ) {

        const success =
            await tryGenericSensor(
                "Accelerometer"
            );


        if (
            success
        ) {

            return true;

        }

    }


    /*
       -----------------------------------------------------
       OPCIÓN 3:
       DeviceMotionEvent

       Este es nuestro fallback.

       Es el que utilizaremos normalmente
       en iPhone/Safari.
       -----------------------------------------------------
    */

    return await startDeviceMotion();

}


/* =========================================================
   13. INTENTAR GENERIC SENSOR API
   ========================================================= */

async function tryGenericSensor(
    sensorClassName
) {

    try {

        /*
           Obtenemos la clase correspondiente.
        */
        const SensorClass =
            window[
                sensorClassName
            ];


        /*
           Creamos el sensor solicitando 250 Hz.
        */
        const sensor =
            new SensorClass({

                frequency:
                    requestedSensorFrequency

            });


        /*
           Identificador de esta sesión.
        */
        const thisSession =
            sensorSessionId;


        /*
           Esperaremos a recibir una primera lectura
           para considerar que el sensor funciona.
        */
        const started =
            await new Promise(

                function (
                    resolve
                ) {

                    let resolved =
                        false;


                    /*
                       Si después de 1,5 segundos
                       no llega ninguna lectura,
                       consideramos que ha fallado.
                    */
                    const timeout =
                        setTimeout(

                            function () {

                                if (
                                    resolved
                                ) {

                                    return;

                                }


                                resolved =
                                    true;


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

                            1500

                        );


                    /*
                       Cada lectura del sensor.
                    */
                    sensor.addEventListener(
                        "reading",
                        function () {

                            if (
                                thisSession !==
                                sensorSessionId
                            ) {

                                return;

                            }


                            /*
                               La primera lectura confirma
                               que el sensor funciona.
                            */
                            if (
                                !resolved
                            ) {

                                resolved =
                                    true;


                                clearTimeout(
                                    timeout
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

                            }


                            /*
                               Procesamos la muestra.
                            */
                            processAccelerationSample(

                                sensor.x,
                                sensor.y,
                                sensor.z

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
                                !resolved
                            ) {

                                resolved =
                                    true;


                                clearTimeout(
                                    timeout
                                );


                                resolve(
                                    false
                                );

                            }

                        }
                    );


                    /*
                       Arrancamos el sensor.
                    */
                    sensor.start();

                }

            );


        return started;

    }

    catch (error) {

        /*
           Puede fallar por:
           - navegador incompatible;
           - permisos;
           - frecuencia no admitida;
           - sensor no disponible.
        */
        console.log(
            sensorClassName +
            " no disponible:",
            error
        );


        return false;

    }

}


/* =========================================================
   14. FALLBACK: DEVICEMOTION
   ========================================================= */

async function startDeviceMotion() {

    /*
       iPhone exige que el permiso se solicite
       como consecuencia de una acción del usuario.

       Esta función se ejecuta después de pulsar Play.
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


            if (
                permission !==
                "granted"
            ) {

                return false;

            }

        }

        catch (error) {

            console.log(
                "Error solicitando permiso DeviceMotion:",
                error
            );


            return false;

        }

    }


    /*
       Comprobamos que exista DeviceMotionEvent.
    */
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
       Aquí NO podemos elegir la frecuencia.
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
   15. RECIBIR DEVICEMOTION
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
       Preferimos acceleration porque,
       cuando está disponible,
       no incluye gravedad.
    */
    let acceleration =
        event.acceleration;


    /*
       Si no existe, recurrimos a
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
   16. PROCESAR UNA MUESTRA
   ========================================================= */

/*
   Esta función es deliberadamente común
   para los dos sistemas:

   Generic Sensor API
   DeviceMotionEvent

   A partir de aquí, el resto de la aplicación
   no necesita saber de dónde vino la muestra.
*/
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
       Tiempo monotónico desde el comienzo
       del ensayo.
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


    /*
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
       Calculamos la frecuencia REAL observada.
    */
    updateRealSamplingFrequency();


    /*
       La adquisición y el dibujo son independientes.

       Guardamos cada muestra, pero no necesitamos
       repintar la gráfica 250 veces por segundo.
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
   17. CALCULAR FRECUENCIA REAL
   ========================================================= */

function updateRealSamplingFrequency() {

    /*
       Con muy pocas muestras la estimación
       todavía es inestable.
    */
    if (
        currentTestData.length < 2
    ) {

        return;

    }


    /*
       Para mostrar fs en pantalla usamos
       preferentemente aproximadamente
       el último segundo de datos.

       Así detectamos mejor la frecuencia
       actual que usando todo el ensayo.
    */
    const lastSample =
        currentTestData[
            currentTestData.length - 1
        ];


    const finalTime =
        lastSample.time;


    const initialLimit =
        Math.max(
            0,
            finalTime - 1
        );


    let firstIndex =
        currentTestData.length - 1;


    while (

        firstIndex > 0 &&

        currentTestData[
            firstIndex
        ].time >
        initialLimit

    ) {

        firstIndex--;

    }


    const firstSample =
        currentTestData[
            firstIndex
        ];


    const numberOfIntervals =
        (
            currentTestData.length - 1
        ) -
        firstIndex;


    const duration =
        finalTime -
        firstSample.time;


    if (
        duration <= 0 ||
        numberOfIntervals <= 0
    ) {

        return;

    }


    const realFrequency =
        numberOfIntervals /
        duration;


    samplingFrequencyElement.textContent =
        realFrequency.toFixed(1) +
        " Hz";

}


/* =========================================================
   18. ACTUALIZAR GRÁFICA
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
       Solo representamos los últimos
       5 segundos.
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


    /*
       Eje X.
    */
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


    /*
       Eje Y.
    */
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


    /*
       Eje Z.
    */
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
       Ventana temporal móvil.
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


    accelerationChart.update(
        "none"
    );

}


/* =========================================================
   19. DETENER SENSOR
   ========================================================= */

function stopSensor() {

    /*
       Dejamos de escuchar DeviceMotionEvent.
    */
    window.removeEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    /*
       Detenemos Generic Sensor API
       si estaba funcionando.
    */
    if (
        genericSensor !== null
    ) {

        try {

            genericSensor.stop();

        }

        catch (error) {

            console.log(
                "Error deteniendo sensor:",
                error
            );

        }


        genericSensor =
            null;

    }

}


/* =========================================================
   20. DETENER ENSAYO
   ========================================================= */

/*
   saveTest = true:
   ensayo normal.

   saveTest = false:
   se utiliza cuando ha fallado el sensor
   y no queremos guardar un ensayo vacío.
*/
function stopRecording(
    saveTest = true
) {

    if (
        !isRecording
    ) {

        return;

    }


    isRecording =
        false;


    /*
       Invalidamos callbacks antiguos.
    */
    sensorSessionId++;


    /*
       Detenemos el sensor utilizado.
    */
    stopSensor();


    /*
       Recuperamos el scroll.
    */
    document.body.classList.remove(
        "recording-lock"
    );


    /*
       Recuperamos la pantalla normal.
    */
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
       Botón.
    */
    recordButton.textContent =
        "▶ Iniciar ensayo";


    recordButton.classList.remove(
        "recording"
    );


    testDescription.disabled =
        false;


    /*
       Si el ensayo ha sido válido,
       lo guardamos.
    */
    if (
        saveTest &&
        currentTestData.length > 0
    ) {

        /*
           Calculamos la frecuencia media
           de todo el ensayo.
        */
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

}


/* =========================================================
   21. FRECUENCIA MEDIA DEL ENSAYO
   ========================================================= */

function calculateAverageFrequency(
    data
) {

    if (
        data.length < 2
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
   22. HACER OTRO ENSAYO
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
           Eliminamos límites anteriores.
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
   23. DESCARGAR / COMPARTIR CSV
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


        /*
           Añadimos información del sistema de adquisición
           a cada fila.

           Esto será muy útil posteriormente en MATLAB
           para saber con qué dispositivo/API se obtuvo
           cada ensayo.
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
           Creamos un archivo real.
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


        /* =================================================
           IPHONE / MÓVILES

           Intentamos utilizar la hoja nativa
           de compartir.
           ================================================= */

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
                   El usuario simplemente puede haber
                   cerrado la ventana de compartir.
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
           DESCARGA TRADICIONAL
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
   24. TERMINAR
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
   25. FORMATEAR TIEMPO
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
