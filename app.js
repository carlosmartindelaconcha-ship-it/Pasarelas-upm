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

const cameraPreviewCanvas =
    document.getElementById("cameraPreviewCanvas");

const cameraCanvas =
    document.getElementById("cameraCanvas");

const capturePhotoButton =
    document.getElementById("capturePhotoButton");

const closeCameraButton =
    document.getElementById("closeCameraButton");

const galleryInput =
    document.getElementById("galleryInput");

const photoTitleInput =
    document.getElementById("photoTitle");

const photoPreview =
    document.getElementById("photoPreview");

const photoCounter =
    document.getElementById("photoCounter");

const continueToStructuralButton =
    document.getElementById("continueToStructuralButton");

const structuralForm =
    document.getElementById("structuralForm");

const continueToTestsButton =
    document.getElementById("continueToTestsButton");

const noDamageInput =
    document.getElementById("noDamage");

const damageInputs =
    Array.from(
        document.querySelectorAll('input[name="damages"]')
    );


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

const resultMetricElements = {
    acceleration: ["X", "Y", "Z"].map(function (axis) {
        return document.getElementById("peakAcceleration" + axis);
    }),
    rms: ["X", "Y", "Z"].map(function (axis) {
        return document.getElementById("peakRms" + axis);
    }),
    spectrumFrequency: ["X", "Y", "Z"].map(function (axis) {
        return document.getElementById("spectrumPeakFrequency" + axis);
    }),
    psdFrequency: ["X", "Y", "Z"].map(function (axis) {
        return document.getElementById("psdPeakFrequency" + axis);
    })
};

const spectrumCanvas =
    document.getElementById("spectrumChart");

const psdCanvas =
    document.getElementById("psdChart");

const rmsCanvas =
    document.getElementById("rmsChart");

const resetTemporalZoomButton =
    document.getElementById("resetTemporalZoom");

const resetSpectrumZoomButton =
    document.getElementById("resetSpectrumZoom");

const resetPsdZoomButton =
    document.getElementById("resetPsdZoom");

const resetRmsZoomButton =
    document.getElementById("resetRmsZoom");

const mapLocationButton =
    document.getElementById("mapLocationButton");


/* =========================================================
   3. VARIABLES GENERALES
   ========================================================= */

let map = null;

let bridgeMarker = null;

let selectedPhotos = [];

let bridgeStructuralData = null;

let cameraStream = null;

let cameraPreviewFrameId = null;


/* =========================================================
   4. VARIABLES GPS
   ========================================================= */

let bestPosition = null;

let gpsWatchId = null;

let gpsTimeoutId = null;

let isSelectingLocationOnMap = false;


/* =========================================================
   5. VARIABLES DEL ENSAYO
   ========================================================= */

let isRecording = false;

let recordingStartTime = null;

let currentTestData = [];

let processedTestData = [];

let tests = [];

let accelerationChart = null;

let spectrumChart = null;

let psdChart = null;

let rmsChart = null;

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


            map.on(
                "click",
                function (event) {

                    if (!isSelectingLocationOnMap) {
                        return;
                    }

                    updateManualMapLocation(
                        event.lngLat.lat,
                        event.lngLat.lng
                    );

                }
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

        isSelectingLocationOnMap = false;
        map.getCanvas().style.cursor = "";
        mapLocationButton.classList.remove(
            "location-button-active"
        );
        mapLocationButton.textContent =
            "Elegir en el mapa";

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


mapLocationButton.addEventListener(
    "click",
    function () {

        if (!map) {
            return;
        }

        stopGPSWatch();

        isSelectingLocationOnMap = true;
        map.getCanvas().style.cursor = "crosshair";
        mapLocationButton.classList.add(
            "location-button-active"
        );
        mapLocationButton.textContent =
            "Toca el punto de la pasarela";

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
        accuracy.toFixed(1) + " m";


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


function updateManualMapLocation(latitude, longitude) {

    stopGPSWatch();

    isSelectingLocationOnMap = false;
    map.getCanvas().style.cursor = "";
    mapLocationButton.classList.remove(
        "location-button-active"
    );
    mapLocationButton.textContent =
        "Cambiar ubicación en el mapa";

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
        "Selección manual";

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
                        "Seleccionada en el mapa"

                    )

            )

            .addTo(map);

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
        "Usar ubicación actual";


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

        if (!getPhotoTitle()) {

            alert(
                "Escribe un título antes de abrir la cámara."
            );

            photoTitleInput.focus();

            return;

        }

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

            startCameraPreviewRendering();


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

        const title = getPhotoTitle();

        if (!title) {
            alert(
                "Escribe un título antes de capturar la fotografía."
            );


            stopCamera();

            photoTitleInput.focus();

            return;

        }

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
                    file,
                    title
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


    if (cameraPreviewFrameId !== null) {

        cancelAnimationFrame(cameraPreviewFrameId);

        cameraPreviewFrameId = null;

    }


    const previewContext =
        cameraPreviewCanvas.getContext("2d");

    previewContext.clearRect(
        0,
        0,
        cameraPreviewCanvas.width,
        cameraPreviewCanvas.height
    );


    cameraStream =
        null;


    cameraSection.style.display =
        "none";


    openCameraButton.style.display =
        "block";

}


/*
   El vídeo nativo de algunos móviles no respeta el recorte CSS.
   Dibujarlo en canvas permite mostrarlo siempre con bordes redondeados.
*/
function startCameraPreviewRendering() {

    if (cameraPreviewFrameId !== null) {
        cancelAnimationFrame(cameraPreviewFrameId);
    }

    const previewContext =
        cameraPreviewCanvas.getContext("2d");


    function drawFrame() {

        if (
            cameraStream !== null &&
            cameraPreview.readyState >= 2 &&
            cameraPreview.videoWidth > 0 &&
            cameraPreview.videoHeight > 0
        ) {

            if (
                cameraPreviewCanvas.width !==
                cameraPreview.videoWidth ||
                cameraPreviewCanvas.height !==
                cameraPreview.videoHeight
            ) {

                cameraPreviewCanvas.width =
                    cameraPreview.videoWidth;

                cameraPreviewCanvas.height =
                    cameraPreview.videoHeight;

            }

            previewContext.drawImage(
                cameraPreview,
                0,
                0,
                cameraPreviewCanvas.width,
                cameraPreviewCanvas.height
            );

        }

        if (cameraStream !== null) {
            cameraPreviewFrameId =
                requestAnimationFrame(drawFrame);
        }

    }


    cameraPreviewFrameId =
        requestAnimationFrame(drawFrame);

}


/* =========================================================
   14. AÑADIR FOTO
   ========================================================= */

function addPhotoFile(
    file,
    title
) {

    if (
        !file.type.startsWith(
            "image/"
        )
    ) {

        return;

    }


    selectedPhotos.push(
        {
            file: file,
            title: title
        }
    );


    const imageURL =
        URL.createObjectURL(
            file
        );


    const photoCard =
        document.createElement("div");

    photoCard.className = "photo-card";


    const image =
        document.createElement(
            "img"
        );


    image.src =
        imageURL;


    image.alt = title;


    const titleElement =
        document.createElement("p");

    titleElement.className = "photo-card-title";
    titleElement.textContent = title;


    photoCard.appendChild(image);
    photoCard.appendChild(titleElement);


    photoPreview.appendChild(
        photoCard
    );


    photoTitleInput.value = "";


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

        const title = getPhotoTitle();

        if (!title) {

            alert(
                "Escribe un título antes de elegir la fotografía."
            );

            photoTitleInput.focus();
            galleryInput.value = "";

            return;

        }


        for (
            let i = 0;
            i < files.length;
            i++
        ) {

            addPhotoFile(
                files[i],
                title
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


function getPhotoTitle() {

    return photoTitleInput.value.trim();

}


/* =========================================================
   17. PASAR A ENSAYOS
   ========================================================= */

continueToStructuralButton.addEventListener(
    "click",
    function () {

        stopCamera();


        photoForm.style.display =
            "none";


        structuralForm.style.display =
            "block";

    }
);


continueToTestsButton.addEventListener(
    "click",
    function () {

        if (!validateStructuralForm()) {
            return;
        }


        bridgeStructuralData = collectStructuralData();


        structuralForm.style.display =
            "none";


        testForm.style.display =
            "block";


        if (
            accelerationChart === null
        ) {

            createAccelerationChart();

            createSpectrumChart();

            createPsdChart();

            createRmsChart();

            [
                accelerationChart,
                spectrumChart,
                psdChart,
                rmsChart
            ].forEach(enableLegendToggling);

        }

    }
);


function validateStructuralForm() {

    if (!structuralForm.reportValidity()) {
        return false;
    }

    const hasDamageSelection = damageInputs.some(
        function (input) {
            return input.checked;
        }
    );

    if (!hasDamageSelection) {
        alert(
            "Indica al menos un daño observado o marca “Sin daños observados”."
        );

        return false;
    }

    return true;

}


function collectStructuralData() {

    const formData = new FormData(structuralForm);

    return {
        name: formData.get("bridgeName"),
        structuralSystem: formData.get("structuralSystem"),
        structuralDepth: formData.get("structuralDepth"),
        deckPosition: formData.get("deckPosition"),
        length: Number(formData.get("bridgeLength")),
        width: Number(formData.get("bridgeWidth")),
        pierHeight: formData.get("pierHeight") === ""
            ? null
            : Number(formData.get("pierHeight")),
        numberOfSpans: Number(formData.get("numberOfSpans")),
        supportType: formData.get("supportType"),
        deckType: formData.get("deckType"),
        deckSection: formData.get("deckSection"),
        deckMaterial: formData.get("deckMaterial"),
        substructureMaterial: formData.get("substructureMaterial"),
        use: formData.get("bridgeUse"),
        condition: formData.get("bridgeCondition"),
        damages: formData.getAll("damages")
    };

}


damageInputs.forEach(function (input) {

    input.addEventListener("change", function () {

        if (input === noDamageInput && input.checked) {

            damageInputs.forEach(function (damageInput) {

                if (damageInput !== noDamageInput) {
                    damageInput.checked = false;
                }

            });

            return;

        }

        if (input !== noDamageInput && input.checked) {
            noDamageInput.checked = false;
        }

    });

});


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

                    onClick: function (event, elements, chart) {
                        showClickedValue(event, elements, chart);
                    },


                    /*
                       Chart.js no necesita recibir
                       toques o gestos.
                    */
                    events:
                        [],

                    plugins: {

                        tooltip: {
                            callbacks: {
                                title: function (items) {
                                    return "t = " +
                                        items[0].parsed.x.toFixed(3) +
                                        " s";
                                },
                                label: function (item) {
                                    return item.dataset.label +
                                        ": " +
                                        item.parsed.y.toFixed(4) +
                                        " m/s²";
                                }
                            }
                        },

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
                            },

                            y: {
                                min: -1,
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

                            },

                            ticks: {

                                callback:
                                    formatYAxisTick

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
                onClick: function (event, elements, chart) {
                    showClickedValue(event, elements, chart);
                },
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
                        },
                        ticks: {
                            callback: formatYAxisTick
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                return "f = " +
                                    items[0].parsed.x.toFixed(3) +
                                    " Hz";
                            },
                            label: function (item) {
                                return item.dataset.label +
                                    ": " +
                                    item.parsed.y.toFixed(4);
                            }
                        }
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


/* =========================================================
   18 ter. CREAR GRÁFICA DE PSD
   ========================================================= */

function createPsdChart() {

    psdChart = new Chart(

        psdCanvas.getContext("2d"),

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
                onClick: function (event, elements, chart) {
                    showClickedValue(event, elements, chart);
                },
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
                            text: "PSD (m²/s⁴/Hz)"
                        },
                        grid: {
                            color: "rgba(0,0,0,0.08)"
                        },
                        ticks: {
                            callback: formatYAxisTick
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                return "f = " +
                                    items[0].parsed.x.toFixed(3) +
                                    " Hz";
                            },
                            label: function (item) {
                                return item.dataset.label +
                                    ": " +
                                    item.parsed.y.toExponential(3) +
                                    " m²/s⁴/Hz";
                            }
                        }
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


/*
   La vista restablecida se adapta únicamente a las series que
   el usuario mantiene visibles en la leyenda.
*/
function getVisibleDatasetMaximum(chart, useAbsoluteValues = false) {

    if (!chart || !chart.data || !chart.data.datasets) {
        return 0;
    }

    return chart.data.datasets.reduce(
        function (maximum, dataset, datasetIndex) {

            if (!chart.isDatasetVisible(datasetIndex)) {
                return maximum;
            }

            return dataset.data.reduce(
                function (datasetMaximum, point) {

                    const rawValue =
                        point && typeof point === "object"
                            ? point.y
                            : point;

                    const numericValue = Number(rawValue);

                    if (!Number.isFinite(numericValue)) {
                        return datasetMaximum;
                    }

                    const value = useAbsoluteValues
                        ? Math.abs(numericValue)
                        : numericValue;

                    return Math.max(datasetMaximum, value);

                },
                maximum
            );

        },
        0
    );

}


function resetTemporalView() {

    const xMax = Math.max(
        accelerationChart.options.plugins.zoom.limits.x.max,
        0.001
    );

    const yMax = roundedUpperLimit(
        getVisibleDatasetMaximum(accelerationChart, true)
    );

    accelerationChart.options.plugins.zoom.limits.y.min = -yMax;
    accelerationChart.options.plugins.zoom.limits.y.max = yMax;

    if (typeof accelerationChart.resetZoom === "function") {
        accelerationChart.resetZoom("none");
    }

    accelerationChart.options.scales.x.min = 0;
    accelerationChart.options.scales.x.max = xMax;
    accelerationChart.options.scales.y.min = -yMax;
    accelerationChart.options.scales.y.max = yMax;
    accelerationChart.scales.x.options.min = 0;
    accelerationChart.scales.x.options.max = xMax;
    accelerationChart.scales.y.options.min = -yMax;
    accelerationChart.scales.y.options.max = yMax;
    accelerationChart.setActiveElements([]);
    accelerationChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    accelerationChart.update("none");

}


function getSpectrumInitialYLimit() {

    if (!spectrumChart) {
        return 1;
    }

    const maximum = getVisibleDatasetMaximum(spectrumChart);

    return roundedSpectrumUpperLimit(maximum);

}


function resetSpectrumView() {

    const yMax = getSpectrumInitialYLimit();

    spectrumChart.options.plugins.zoom.limits.x.min = 0;
    spectrumChart.options.plugins.zoom.limits.x.max = 30;
    spectrumChart.options.plugins.zoom.limits.y.min = 0;
    spectrumChart.options.plugins.zoom.limits.y.max = yMax;

    if (typeof spectrumChart.resetZoom === "function") {
        spectrumChart.resetZoom("none");
    }

    spectrumChart.options.scales.x.min = 0;
    spectrumChart.options.scales.x.max = 30;
    spectrumChart.options.scales.y.min = 0;
    spectrumChart.options.scales.y.max = yMax;
    spectrumChart.scales.x.options.min = 0;
    spectrumChart.scales.x.options.max = 30;
    spectrumChart.scales.y.options.min = 0;
    spectrumChart.scales.y.options.max = yMax;
    spectrumChart.setActiveElements([]);
    spectrumChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    spectrumChart.update("none");

}


function getPsdInitialYLimit() {

    if (!psdChart) {
        return 0.01;
    }

    const maximum = getVisibleDatasetMaximum(psdChart);

    return roundedPsdUpperLimit(maximum);

}


function resetPsdView() {

    const yMax = getPsdInitialYLimit();

    psdChart.options.plugins.zoom.limits.x.min = 0;
    psdChart.options.plugins.zoom.limits.x.max = 30;
    psdChart.options.plugins.zoom.limits.y.min = 0;
    psdChart.options.plugins.zoom.limits.y.max = yMax;

    if (typeof psdChart.resetZoom === "function") {
        psdChart.resetZoom("none");
    }

    psdChart.options.scales.x.min = 0;
    psdChart.options.scales.x.max = 30;
    psdChart.options.scales.y.min = 0;
    psdChart.options.scales.y.max = yMax;
    psdChart.scales.x.options.min = 0;
    psdChart.scales.x.options.max = 30;
    psdChart.scales.y.options.min = 0;
    psdChart.scales.y.options.max = yMax;
    psdChart.setActiveElements([]);
    psdChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    psdChart.update("none");

}


function createRmsChart() {

    rmsChart = new Chart(
        rmsCanvas.getContext("2d"),
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
                onClick: function (event, elements, chart) {
                    showClickedValue(event, elements, chart);
                },
                scales: {
                    x: {
                        type: "linear",
                        min: 0,
                        max: 1,
                        title: {
                            display: true,
                            text: "Tiempo (s)"
                        },
                        grid: {
                            color: "rgba(0,0,0,0.08)"
                        }
                    },
                    y: {
                        min: 0,
                        max: 1,
                        title: {
                            display: true,
                            text: "RMS (m/s²)"
                        },
                        grid: {
                            color: "rgba(0,0,0,0.08)"
                        },
                        ticks: {
                            callback: formatYAxisTick
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    },
                    tooltip: {
                        callbacks: {
                            title: function (items) {
                                return "t = " +
                                    items[0].parsed.x.toFixed(3) +
                                    " s";
                            },
                            label: function (item) {
                                return item.dataset.label +
                                    ": " +
                                    item.parsed.y.toFixed(4) +
                                    " m/s²";
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: "xy",
                            onPan: function (context) {
                                clampRmsAxes(context.chart);
                            },
                            onPanComplete: function (context) {
                                clampRmsAxes(context.chart);
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
                                clampRmsAxes(context.chart);
                            },
                            onZoomComplete: function (context) {
                                clampRmsAxes(context.chart);
                            }
                        },
                        limits: {
                            x: {
                                min: 0,
                                max: 1
                            },
                            y: {
                                min: 0,
                                max: 1
                            }
                        }
                    }
                }
            }
        }
    );

}


function clampRmsAxes(chart) {

    const duration =
        processedTestData.length > 0
            ? processedTestData[processedTestData.length - 1].time
            : 1;

    const yLimit = Math.max(
        chart.options.plugins.zoom.limits.y.max || 0.01,
        0.01
    );

    chart.options.plugins.zoom.limits.x.min = 0;
    chart.options.plugins.zoom.limits.x.max = Math.max(duration, 0.001);
    chart.options.plugins.zoom.limits.y.min = 0;
    chart.options.plugins.zoom.limits.y.max = yLimit;

    chart.options.scales.x.min = Math.max(
        0,
        Math.min(chart.scales.x.min, duration)
    );
    chart.options.scales.x.max = Math.min(
        duration,
        Math.max(chart.scales.x.max, 0.001)
    );
    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = Math.min(
        yLimit,
        Math.max(chart.scales.y.max, 0.01)
    );

}


function resetRmsView() {

    const xMax = Math.max(
        processedTestData.length > 0
            ? processedTestData[processedTestData.length - 1].time
            : 0.001,
        0.001
    );

    const yMax = roundedUpperLimit(
        getVisibleDatasetMaximum(rmsChart)
    );

    rmsChart.options.plugins.zoom.limits.y.min = 0;
    rmsChart.options.plugins.zoom.limits.y.max = yMax;

    if (typeof rmsChart.resetZoom === "function") {
        rmsChart.resetZoom("none");
    }

    rmsChart.options.scales.x.min = 0;
    rmsChart.options.scales.x.max = xMax;
    rmsChart.options.scales.y.min = 0;
    rmsChart.options.scales.y.max = yMax;
    rmsChart.scales.x.options.min = 0;
    rmsChart.scales.x.options.max = xMax;
    rmsChart.scales.y.options.min = 0;
    rmsChart.scales.y.options.max = yMax;
    rmsChart.setActiveElements([]);
    rmsChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    rmsChart.update("none");

}


resetTemporalZoomButton.addEventListener("click", function () {

    if (accelerationChart) {
        resetTemporalView();
    }

});


resetSpectrumZoomButton.addEventListener("click", function () {

    if (spectrumChart) {
        resetSpectrumView();
    }

});


resetPsdZoomButton.addEventListener("click", function () {

    if (psdChart) {
        resetPsdView();
    }

});


resetRmsZoomButton.addEventListener("click", function () {

    if (rmsChart) {
        resetRmsView();
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

    if (typeof accelerationChart.resetZoom === "function") {
        accelerationChart.resetZoom();
    }


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

    if (psdChart) {

        psdChart.data.datasets.forEach(function (dataset) {
            dataset.data = [];
        });

        psdChart.update("none");

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

    testForm.classList.remove(
        "showing-results"
    );


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
            spectrumChart.resize();
            psdChart.resize();
            rmsChart.resize();

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

function roundedUpperLimit(value) {

    const validValue =
        Number.isFinite(value) && value > 0
            ? value
            : 0;

    if (validValue === 0) {
        return 0.01;
    }

    /*
       La señal temporal y RMS conservan un margen del 20 %.
       Para magnitudes pequeñas se mantiene un límite limpio;
       desde 1 se redondea a décimas para evitar saltos a 3.
    */
    if (validValue >= 1) {
        return Math.ceil(validValue * 1.2 * 10) / 10;
    }

    return roundedAdaptiveUpperLimit(validValue, 1.2);

}


/* El espectro se redondea según la magnitud de sus amplitudes. */
function roundedSpectrumUpperLimit(value) {

    return roundedAdaptiveUpperLimit(value);

}


/* La PSD usa su propia escala, independiente de la del espectro. */
function roundedPsdUpperLimit(value) {

    return roundedAdaptiveUpperLimit(value);

}


/*
   Mantiene una escala legible sin que el margen de seguridad
   provoque saltos bruscos de orden de magnitud.
*/
function roundedAdaptiveUpperLimit(value, margin = 1.2) {

    const validValue =
        Number.isFinite(value) && value > 0
            ? value
            : 0;

    if (validValue === 0) {
        return 0.01;
    }

    const resolution =
        10 ** Math.floor(
            Math.log10(validValue)
        );

    return Math.ceil(
        validValue * margin / resolution
    ) * resolution;

}


function formatYAxisTick(value) {

    const numericValue =
        Number(value);

    if (!Number.isFinite(numericValue)) {
        return "";
    }

    if (numericValue === 0) {
        return "0";
    }

    const magnitude =
        Math.abs(numericValue);

    if (magnitude < 0.001 || magnitude >= 10000) {
        return numericValue.toExponential(2);
    }

    return Number(
        numericValue.toPrecision(3)
    ).toString();

}


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


function updateRmsChart(data) {

    if (!rmsChart || !data || data.length === 0) {
        return;
    }

    const rmsData = calculateMovingRms(data, 1);
    const components = ["ax", "ay", "az"];

    components.forEach(function (component, index) {
        rmsChart.data.datasets[index].data = rmsData.map(function (sample) {
            return {
                x: sample.time,
                y: sample[component]
            };
        });
    });

    const maximum = Math.max(
        0,
        ...rmsData.flatMap(function (sample) {
            return [sample.ax, sample.ay, sample.az];
        })
    );
    const yLimit = roundedUpperLimit(maximum);
    const xMax = Math.max(
        rmsData[rmsData.length - 1].time,
        0.001
    );

    rmsChart.options.scales.x.min = 0;
    rmsChart.options.scales.x.max = xMax;
    rmsChart.options.scales.y.min = 0;
    rmsChart.options.scales.y.max = yLimit;
    rmsChart.options.plugins.zoom.limits.x.min = 0;
    rmsChart.options.plugins.zoom.limits.x.max = xMax;
    rmsChart.options.plugins.zoom.limits.y.min = 0;
    rmsChart.options.plugins.zoom.limits.y.max = yLimit;
    rmsChart.update("none");

}


function updateChart(
    currentTime,
    complete = false
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
    const chartSource =
        complete && processedTestData.length > 0
            ? processedTestData
            : currentTestData;

    const visibleData =
        complete
            ? chartSource
            : chartSource.filter(

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
        complete
            ? 0
            : minimumTime;


    accelerationChart
        .options
        .scales
        .x
        .max =
        complete
            ? currentTime
            : Math.max(
                visibleWindowSeconds,
                currentTime
            );


    accelerationChart.options.plugins.zoom.limits.x.max =
        Math.max(currentTime, 0.001);


    /*
       Autoescala vertical.
    */
    let maximumAcceleration =
        0;


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
        roundedUpperLimit(maximumAcceleration);


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


    accelerationChart.options.plugins.zoom.limits.y.min =
        -yLimit;

    accelerationChart.options.plugins.zoom.limits.y.max =
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

        processedTestData =
            buildProcessedSignal(currentTestData);

        updateChart(
            currentTestData[currentTestData.length - 1].time,
            true
        );

    }

    enableResultChartNavigation();


    setTimeout(
        function () {

            accelerationChart.resize();
            spectrumChart.resize();
            psdChart.resize();
            rmsChart.resize();

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

        updateSpectrumChart(processedTestData, true);

        updatePsdChart(processedTestData);

        updateRmsChart(processedTestData);

        updateResultMetrics(processedTestData);

        testForm.classList.add(
            "showing-results"
        );


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

    [accelerationChart, spectrumChart, psdChart, rmsChart].forEach(function (chart) {

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
                "touchend",
                "click"
            ]
            : ["click"];

        chart.options.plugins.zoom.pan.enabled = enabled;
        chart.options.plugins.zoom.zoom.wheel.enabled = enabled;
        chart.options.plugins.zoom.zoom.pinch.enabled = enabled;
        chart.update("none");

    });

}


function enableLegendToggling(chart) {

    chart.options.plugins.legend.onClick =
        function (event, legendItem, legend) {

            if (
                Number.isFinite(chart.$legendTouchTime) &&
                performance.now() -
                chart.$legendTouchTime < 500
            ) {
                return;
            }

            toggleLegendDataset(
                chart,
                legendItem.datasetIndex
            );

        };


    enableNativeLegendTouchToggling(chart);

}


function toggleLegendDataset(chart, datasetIndex) {

    chart.setDatasetVisibility(
        datasetIndex,
        !chart.isDatasetVisible(datasetIndex)
    );

    chart.update("none");

}


function enableNativeLegendTouchToggling(chart) {

    if (chart.$legendTouchListenerAttached) {
        return;
    }

    chart.$legendTouchListenerAttached = true;


    chart.canvas.addEventListener(
        "touchstart",
        function (event) {

            chart.$legendTouchStart =
                getLegendTouch(chart, event.touches[0]);

        },
        { passive: true, capture: true }
    );


    chart.canvas.addEventListener(
        "touchend",
        function (event) {

            const touchStart = chart.$legendTouchStart;
            const touchEnd = getLegendTouch(
                chart,
                event.changedTouches[0]
            );

            chart.$legendTouchStart = null;


            if (
                !touchStart ||
                !touchEnd ||
                touchStart.datasetIndex !== touchEnd.datasetIndex ||
                Math.hypot(
                    touchEnd.x - touchStart.x,
                    touchEnd.y - touchStart.y
                ) > 10
            ) {
                return;
            }

            chart.$legendTouchTime = performance.now();

            toggleLegendDataset(
                chart,
                touchEnd.datasetIndex
            );

        },
        /*
           Se ejecuta antes que el listener interno de
           Chart.js para evitar que el mismo toque alterne
           dos veces la visibilidad de la serie.
        */
        { passive: true, capture: true }
    );

}


function getLegendTouch(chart, touch) {

    if (!touch || !chart.legend) {
        return null;
    }

    const bounds = chart.canvas.getBoundingClientRect();

    const x = (touch.clientX - bounds.left) *
        chart.width / bounds.width;

    const y = (touch.clientY - bounds.top) *
        chart.height / bounds.height;

    const legendItem = chart.legend._getLegendItemAt(x, y);

    if (!legendItem) {
        return null;
    }

    return {
        datasetIndex: legendItem.datasetIndex,
        x: x,
        y: y
    };

}


function showClickedValue(event, elements, chart) {

    let activeElements = elements || [];

    if (activeElements.length === 0) {
        activeElements = chart.getElementsAtEventForMode(
            event,
            "nearest",
            { intersect: false },
            true
        );
    }

    if (activeElements.length === 0) {
        return;
    }

    const element = activeElements[0];
    const point = element.element;

    chart.setActiveElements([element]);
    chart.tooltip.setActiveElements(
        [element],
        {
            x: point.x,
            y: point.y
        }
    );
    chart.update("none");

}


function keepTemporalYAxisCentered(chart) {

    if (!chart || !chart.scales || !chart.scales.y) {
        return;
    }

    const scale = chart.scales.y;
    const maximumRange =
        chart.options.plugins.zoom.limits.y.max;

    const halfRange = Math.min(maximumRange, Math.max(
        Math.abs(scale.min),
        Math.abs(scale.max),
        0.000001
    ));

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
    const yLower = 0;
    const yUpper = Math.max(
        0.01,
        Number(chart.options.plugins.zoom.limits.y.max) || 0.01
    );
    const xRange = Math.max(0, x.max - x.min);
    const yRange = Math.max(0, y.max - y.min);

    let xMin;
    let xMax;

    if (xRange >= xUpper - xLower) {
        xMin = xLower;
        xMax = xUpper;
    } else {
        xMin = Math.max(xLower, Math.min(x.min, xUpper - xRange));
        xMax = xMin + xRange;
    }

    let yMin;
    let yMax;

    if (yRange >= yUpper) {
        yMin = yLower;
        yMax = yUpper;
    } else {
        yMin = Math.max(yLower, Math.min(y.min, yUpper - yRange));
        yMax = yMin + yRange;
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

    const maximumSpectrumAmplitude = Math.max(
        0,
        ...spectrumChart.data.datasets.flatMap(function (dataset) {
            return dataset.data.map(function (point) {
                return point.y;
            });
        })
    );

    const spectrumYLimit = roundedSpectrumUpperLimit(
        maximumSpectrumAmplitude
    );

    if (
        resetZoom &&
        typeof spectrumChart.resetZoom === "function"
    ) {
        spectrumChart.resetZoom();
    }
    spectrumChart.options.scales.x.min = 0;
    spectrumChart.options.scales.x.max = 30;
    spectrumChart.options.scales.y.min = 0;
    spectrumChart.options.scales.y.max = spectrumYLimit;
    spectrumChart.options.plugins.zoom.limits.x.min = 0;
    spectrumChart.options.plugins.zoom.limits.x.max = 30;
    spectrumChart.options.plugins.zoom.limits.y.min = 0;
    spectrumChart.options.plugins.zoom.limits.y.max = spectrumYLimit;
    spectrumChart.update("none");

}


/* =========================================================
   32 ter. PSD MEDIANTE WELCH
   ========================================================= */

function updatePsdChart(data) {

    if (!psdChart || data.length < 6) {
        return;
    }

    const duration =
        data[data.length - 1].time - data[0].time;

    if (duration <= 0) {
        return;
    }

    const sampleRate =
        (data.length - 1) / duration;

    psdChart.data.datasets[0].data =
        calculateWelchPsd(data, "ax", sampleRate);
    psdChart.data.datasets[1].data =
        calculateWelchPsd(data, "ay", sampleRate);
    psdChart.data.datasets[2].data =
        calculateWelchPsd(data, "az", sampleRate);

    const maximumPsd = Math.max(
        0,
        ...psdChart.data.datasets.flatMap(function (dataset) {
            return dataset.data.map(function (point) {
                return point.y;
            });
        })
    );

    const yLimit = roundedPsdUpperLimit(maximumPsd);

    psdChart.options.scales.x.min = 0;
    psdChart.options.scales.x.max = 30;
    psdChart.options.scales.y.min = 0;
    psdChart.options.scales.y.max = yLimit;
    psdChart.options.plugins.zoom.limits.x.min = 0;
    psdChart.options.plugins.zoom.limits.x.max = 30;
    psdChart.options.plugins.zoom.limits.y.min = 0;
    psdChart.options.plugins.zoom.limits.y.max = yLimit;
    psdChart.update("none");

}


function getPeakMagnitude(data, component) {

    return data.reduce(function (maximum, sample) {
        return Math.max(
            maximum,
            Math.abs(Number(sample[component]) || 0)
        );
    }, 0);

}


function getPeakFrequency(points) {

    const peak = points.reduce(function (currentPeak, point) {
        if (
            point.x <= 0 ||
            !Number.isFinite(point.y) ||
            point.y <= currentPeak.y
        ) {
            return currentPeak;
        }

        return point;
    }, {
        x: null,
        y: -Infinity
    });

    return peak.x;

}


function setResultMetricValues(elements, values, formatter) {

    elements.forEach(function (element, index) {
        element.textContent =
            values[index] === null
                ? "--"
                : formatter(values[index]);
    });

}


function updateResultMetrics(data) {

    const components = ["ax", "ay", "az"];
    const peakAcceleration = components.map(function (component) {
        return getPeakMagnitude(data, component);
    });
    const rmsData = calculateMovingRms(data, 1);
    const peakRms = components.map(function (component) {
        return getPeakMagnitude(rmsData, component);
    });
    const spectrumFrequencies = spectrumChart.data.datasets.map(
        function (dataset) {
            return getPeakFrequency(dataset.data);
        }
    );
    const psdFrequencies = psdChart.data.datasets.map(
        function (dataset) {
            return getPeakFrequency(dataset.data);
        }
    );

    setResultMetricValues(
        resultMetricElements.acceleration,
        peakAcceleration,
        function (value) {
            return value.toFixed(4);
        }
    );
    setResultMetricValues(
        resultMetricElements.rms,
        peakRms,
        function (value) {
            return value.toFixed(4);
        }
    );
    setResultMetricValues(
        resultMetricElements.spectrumFrequency,
        spectrumFrequencies,
        function (value) {
            return value.toFixed(3);
        }
    );
    setResultMetricValues(
        resultMetricElements.psdFrequency,
        psdFrequencies,
        function (value) {
            return value.toFixed(3);
        }
    );

}


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

/* =========================================================
   33. HACER OTRO ENSAYO
   ========================================================= */

newTestButton.addEventListener(
    "click",
    function () {

        testForm.classList.remove(
            "showing-results"
        );

        testDescription.value =
            "";


        currentTestData =
            [];

        processedTestData =
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

        if (rmsChart) {
            rmsChart.data.datasets.forEach(function (dataset) {
                dataset.data = [];
            });
            rmsChart.update("none");
        }


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


/* =========================================================
   MEDIDA CONJUNTA — prototipo estático sin servidor de señalización.
   Relojes de página y eventos DOM, NO timestamps hardware certificados.
   Invitación + respuesta; STUN opcional, sin servidor de retransmisión TURN.
   Todas las duraciones y marcas internas están expresadas en ms.
   ========================================================= */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const root = $('jointApp');
    if (!root) return;
    const VERSION = 2;
    // Only these app-owned endpoints are used; invitation codes cannot inject servers.
    const STUN_SERVERS = [{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
    const MAX_PEERS = 8, MAX_POINTS = 64, MAX_SAMPLES = 500000;
    const MAX_TOKEN = 50000, MAX_MESSAGE = 90000;
    const activeStates = new Set(['preparing', 'armed', 'recording']);
    const uid = () => crypto.randomUUID();
    const now = () => performance.now();
    const finite = Number.isFinite;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const s = {
        id: uid(), name: 'Mi móvil', role: null, session: null, peers: new Map(),
        plan: {length:30, width:3, name:'Ensayo multipunto', points:[]}, selected:null,
        sensor:false, sensorEnabled:false, lastSample:0, recent:[], rateTimes:[],
        run:null, pending:null, results:new Map(), preview:[], transfer:null,
        scan:null, scanFrame:null, currentInvite:null, pairBusy:false, adding:false, drag:null,
        syncModel:{offset:0, drift:0, reference:0, rtt:null, count:0, updated:0},
        syncLog:[], incidents:[], db:null, writeChain:Promise.resolve(), persistedCount:0,
        storageFailed:false, uiTick:0, wake:null, returnTo:null, transaction:null
    };
    const running = () => s.run && activeStates.has(s.run.state);
    function tell(message, error=false) { $('jointNotice').textContent=message; $('jointNotice').dataset.error=String(error); }
    function incident(kind, detail) {
        const item={kind, detail:String(detail), time:now()}; s.incidents.push(item);
        if (s.run) s.run.incidents.push(item);
    }
    function guard(fn) { return async (...args) => {try {await fn(...args);} catch(e) {tell(e.message || String(e),true); $('jointPairStatus').textContent=e.message || String(e);}}; }
    function download(name, value, mime='application/json') {
        const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:mime});
        const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name;
        document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    function tab(name) {
        for (const n of ['Plan','Devices','Measure','Results']) {
            $('jointPanel'+n).hidden=n!==name; $('jointTab'+n).setAttribute('aria-selected',String(n===name));
        }
    }
    function open() {
        if (typeof isRecording!=='undefined' && isRecording) throw Error('Detén primero el ensayo individual.');
        if (root.hidden) {
            s.returnTo=[...document.querySelectorAll('main > section, main > form')].find(el=>el!==root && getComputedStyle(el).display!=='none');
            for (const el of document.querySelectorAll('main > section, main > form')) if(el!==root) el.style.display='none';
        }
        root.hidden=false; window.scrollTo({top:0});
    }
    function workspace() {
        $('jointLanding').hidden=true; $('jointWorkspace').hidden=false;
        $('jointRole').textContent=s.role==='host'?'Maestro':'Participante';
        $('jointPair').hidden=s.role!=='host'; $('jointSessionLabel').textContent=s.session.slice(0,8);
        $('jointDeviceName').value=s.name;
        renderPlan(); renderDevices(); tab('Plan');
    }
    function requireHostEdit() {
        if (s.role!=='host') throw Error('El plano lo edita el maestro.');
        if (running() || s.transaction) throw Error('El plano queda bloqueado durante el ensayo.');
    }
    function checkPlan(plan) {
        if (!plan || !finite(plan.length) || !finite(plan.width) || plan.length<.1 || plan.width<.1 || plan.length>10000 || plan.width>10000 || !Array.isArray(plan.points) || plan.points.length>MAX_POINTS) throw Error('Plano no válido: revisa dimensiones y puntos.');
        const ids=new Set(), devices=new Set();
        const points=plan.points.map(p=>{
            if (!p || typeof p.id!=='string' || p.id.length>80 || ids.has(p.id) || !finite(p.x) || !finite(p.y) || p.x<0 || p.x>plan.length || p.y<0 || p.y>plan.width || !['x','y','z'].includes(p.axis) || !finite(p.angle) || Math.abs(p.angle)>360) throw Error('Coordenadas, eje u orientación del plano no válidos.');
            ids.add(p.id); const device=typeof p.device==='string'?p.device:null;
            if(device && devices.has(device)) throw Error('Un móvil no puede estar asignado a dos puntos a la vez.');
            if(device) devices.add(device);
            return {id:p.id,name:String(p.name||p.id).slice(0,40),x:p.x,y:p.y,axis:p.axis,angle:p.angle,device};
        });
        return {length:plan.length,width:plan.width,name:String(plan.name||'Ensayo multipunto').slice(0,80),points};
    }
    function savePlan() {
        s.plan=checkPlan(s.plan);
        try {localStorage.setItem('upm-joint-plan-v1',JSON.stringify({...s.plan,points:s.plan.points.map(p=>({...p,device:null}))}));} catch(e){tell('Plano en memoria. No se ha podido guardar en este navegador.',true);}
        broadcast({type:'PLAN',plan:s.plan}); renderPlan();
    }
    function pointFor(device=s.id, plan=s.plan) {return plan.points.find(p=>p.device===device);}
    function deviceName(id) {return id===s.id?s.name:(s.peers.get(id)?.name||'Sin conectar');}
    function geometry() {
        // Equal metric scale in X/Y; a minimum visual height is not substituted.
        const scale=Math.min(660/s.plan.length,245/s.plan.width);
        return {scale,left:(800-s.plan.length*scale)/2,top:(325-s.plan.width*scale)/2,w:s.plan.length*scale,h:s.plan.width*scale};
    }
    function renderPlan() {
        const edit=s.role==='host'&&!running()&&!s.transaction;
        $('jointGeometry').disabled=!edit; $('jointPointEditor').disabled=!edit;
        $('jointPlanTools').hidden=s.role!=='host';
        for(const id of ['jointAddPoint','jointRemovePoint','jointImportPlan']) $(id).disabled=!edit;
        $('jointName').value=s.plan.name; $('jointLength').value=s.plan.length; $('jointWidth').value=s.plan.width;
        const g=geometry(), selected=s.plan.points.find(p=>p.id===s.selected);
        let svg=`<title>Planta de ${escape(s.plan.name)}</title><rect x="${g.left}" y="${g.top}" width="${g.w}" height="${g.h}" fill="#edf4f9" stroke="#698ba6" stroke-width="2"/>`;
        for(let i=1;i<4;i++) svg+=`<line x1="${g.left+g.w*i/4}" y1="${g.top}" x2="${g.left+g.w*i/4}" y2="${g.top+g.h}" stroke="#c5d6e3" stroke-dasharray="4 5"/>`;
        svg+=`<text x="400" y="${g.top+g.h+39}" text-anchor="middle">X · ${s.plan.length} m</text><text x="${Math.max(8,g.left-12)}" y="${g.top-13}">Y · ${s.plan.width} m</text><text x="${g.left}" y="${g.top+g.h+20}">O (0, 0)</text>`;
        for(const p of s.plan.points) {
            const x=g.left+p.x*g.scale,y=g.top+(s.plan.width-p.y)*g.scale;
            const color=p.device===s.id?'#087cc3':p.device?'#00897b':'#788c9e';
            svg+=`<g class="joint-point ${p.id===s.selected?'selected':''}" data-point="${escape(p.id)}" tabindex="0" role="button" aria-label="${escape(p.name)}, X ${p.x}, Y ${p.y}"><title>${escape(p.name)} · ${p.device?escape(deviceName(p.device)):'Sin asignar'}</title><circle cx="${x}" cy="${y}" r="12" fill="${color}" stroke="white" stroke-width="2"/><path d="M ${x} ${y-5} l 0 -16 m -4 5 l 4 -5 l 4 5" fill="none" stroke="${color}" stroke-width="2" transform="rotate(${-p.angle} ${x} ${y})"/><text x="${x}" y="${y+29}" text-anchor="middle">${escape(p.name)}</text></g>`;
        }
        $('jointPlan').innerHTML=svg;
        $('jointPlanHelp').textContent=s.adding?'Toca dentro del rectángulo para colocar el nuevo punto.':s.role==='host'?'Selecciona y arrastra un punto, o edita sus coordenadas. Azul: este móvil · verde: asignado · gris: sin asignar.':'El maestro edita el plano. Tu punto aparece en azul. Comprueba posición, eje y orientación.';
        $('jointPointEditor').hidden=!selected;
        if(selected) {
            $('jointPointLegend').textContent='Editar '+selected.id;
            $('jointPointName').value=selected.name; $('jointPointX').value=selected.x; $('jointPointY').value=selected.y;
            $('jointPointX').max=s.plan.length; $('jointPointY').max=s.plan.width;
            $('jointPointAxis').value=selected.axis; $('jointPointAngle').value=selected.angle;
            const ds=[{id:s.id,name:s.name},...s.peers.values()].filter(p=>p.name);
            // Participant also sees the host; host is not a potential new assignment unless connected.
            $('jointPointDevice').innerHTML='<option value="">Sin asignar</option>'+ds.map(d=>`<option value="${escape(d.id)}">${escape(d.name)}${d.id===s.id?' (este móvil)':''}</option>`).join('');
            $('jointPointDevice').value=selected.device||'';
        }
        $('jointPointsTable').innerHTML=s.plan.points.map(p=>`<tr><td><button type="button" data-select-point="${escape(p.id)}" class="joint-secondary">${escape(p.name)}</button></td><td>${p.x.toFixed(2)}</td><td>${p.y.toFixed(2)}</td><td>${p.axis.toUpperCase()}</td><td>${p.device?escape(deviceName(p.device)):'Sin asignar'}</td></tr>`).join('');
        $('jointMyPoint').textContent=pointFor()?.name||'Sin asignar';
    }
    function svgPosition(e) {
        const svg=$('jointPlan'), matrix=svg.getScreenCTM(); if(!matrix) return null;
        const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),g=geometry();
        return {x:(q.x-g.left)/g.scale,y:s.plan.width-(q.y-g.top)/g.scale};
    }
    function addPoint(x=s.plan.length/2,y=s.plan.width/2) {
        requireHostEdit(); if(s.plan.points.length>=MAX_POINTS) throw Error('Máximo 64 puntos por plano.');
        let n=1; while(s.plan.points.some(p=>p.id==='P'+n)) n++;
        const p={id:'P'+n,name:'P'+n,x:Number(x.toFixed(2)),y:Number(y.toFixed(2)),angle:0,axis:'z',device:null};
        s.plan.points.push(p); s.selected=p.id; s.adding=false; savePlan();
    }
    function localStatus() {return {id:s.id,name:s.name,sensor:s.sensor && now()-s.lastSample<2000,rate:sampleRate(),visible:document.visibilityState==='visible',point:pointFor()?.id||null,state:s.run?.state||'idle'};}
    function sampleRate() {const a=s.rateTimes; return a.length>2?(a.length-1)*1000/(a[a.length-1]-a[0]):0;}
    function renderDevices() {
        const local=localStatus();
        let html=`<article class="joint-device-card"><strong>${escape(s.name)} · ${s.role==='host'?'Maestro':'Este móvil'}</strong><p>${local.sensor?'Sensor activo':'Sensor sin datos recientes'} · ${local.rate?local.rate.toFixed(1)+' Hz':'— Hz'} · ${escape(pointFor()?.name||'Sin punto asignado')}</p><small>${local.visible?'Página visible':'Página oculta'}</small></article>`;
        for(const p of s.peers.values()) {
            const st=p.status||{},m=p.model;
            html+=`<article class="joint-device-card"><strong>${escape(p.name||'Conectando…')}</strong><p>${p.channel?.readyState==='open'?'Conectado':'Desconectado'} · ${st.sensor?'Sensor activo':'Sensor sin confirmar'} · ${finite(st.rate)?st.rate.toFixed(1)+' Hz':'— Hz'}</p><p>${escape(pointFor(p.id)?.name||'Sin punto asignado')} · ${escape(p.route||'Ruta pendiente de comprobar')}</p><small>${m?.count?'RTT mínimo: '+m.rtt.toFixed(2)+' ms · desfase estimado: '+m.offset.toFixed(2)+' ms · '+m.count+' intercambios':'Relojes pendientes de estimación'}</small></article>`;
        }
        if(s.role==='guest'&&s.syncModel.count) html+=`<p class="joint-help">Mi reloj respecto al maestro: ${s.syncModel.offset.toFixed(2)} ms (estimado). RTT mínimo: ${s.syncModel.rtt.toFixed(2)} ms.</p>`;
        $('jointDevices').innerHTML=html;
        $('jointStart').hidden=s.role!=='host'; $('jointSync').hidden=s.role!=='host';
        $('jointStart').disabled=!!running()||!!s.transaction;
        $('jointDuration').disabled=s.role!=='host'||!!running()||!!s.transaction;
        $('jointEnableSensor').disabled=s.sensorEnabled;
        $('jointStop').disabled=!running()&&!s.transaction;
        $('jointPair').disabled=!!running()||!!s.transaction;
    }

    // Bidirectional manual signaling, compressible QR; never send SDP to a service.
    async function encodeToken(payload) {
        const bytes=new TextEncoder().encode(JSON.stringify(payload));
        let data=bytes, prefix='J1.';
        if(typeof CompressionStream!=='undefined') {
            data=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); prefix='J1z.';
        }
        return prefix+btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    async function decodeToken(raw) {
        let token=raw.trim();
        if(token.startsWith('https://')||token.startsWith('http://')) token=new URL(token).hash.replace(/^#joint=/,'');
        if(token.length>MAX_TOKEN || !/^J1z?\.[\w-]+$/.test(token)) throw Error('El código no es una invitación o respuesta válida.');
        const [prefix,b64]=token.split('.');
        const data=Uint8Array.from(atob(b64.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        let decoded=data;
        if(prefix==='J1z') {
            if(typeof DecompressionStream==='undefined') throw Error('Este navegador no admite códigos comprimidos. Actualiza el navegador.');
            const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
            const chunks=[]; let count=0;
            while(true) {const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>100000){await reader.cancel();throw Error('Código demasiado grande.');}chunks.push(value);}
            decoded=new Uint8Array(count);let offset=0;for(const chunk of chunks){decoded.set(chunk,offset);offset+=chunk.length;}
        }
        const t=JSON.parse(new TextDecoder().decode(decoded));
        if(t.v!==VERSION || !['offer','answer'].includes(t.kind) || typeof t.session!=='string' || typeof t.peer!=='string' || typeof t.host!=='string' || !t.sdp || t.sdp.type!==t.kind || typeof t.sdp.sdp!=='string' || t.sdp.sdp.length>60000 || !finite(t.expires) || Date.now()>t.expires) throw Error('Código caducado o incompatible. Genera una nueva invitación.');
        if(!['local','stun'].includes(t.network))throw Error('Modo de conexión incompatible. Recarga la web en ambos móviles y crea una invitación nueva.');
        // STUN discovers addresses; it does not relay measurement data or prove LAN routing.
        const candidates=t.sdp.sdp.split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
        const allowed=t.network==='local'?/ typ host(?: |$)/:/ typ (?:host|srflx|prflx)(?: |$)/;
        if(!candidates.length || candidates.some(l=>!allowed.test(l))) throw Error('El código no contiene direcciones admitidas para ese modo de conexión.');
        return t;
    }
    async function showToken(payload) {
        const code=await encodeToken(payload);
        const link=payload.kind==='offer'?location.href.split('#')[0]+'#joint='+code:code;
        $('jointPairOutput').value=link; $('jointPairOutput').hidden=false; $('jointCopyCode').hidden=false;
        $('jointQr').replaceChildren();
        if(typeof qrcode==='function' && link.length<2900) {
            try {const qr=qrcode(0,'L');qr.addData(link);qr.make();$('jointQr').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});} catch(e){$('jointQr').textContent='Código grande: utiliza Copiar código.';}
        } else $('jointQr').textContent='Utiliza Copiar código para compartir esta conexión.';
    }
    function openPair(mode='join') {
        $('jointPairTitle').textContent=mode==='offer'?'Invitar a un móvil':'Leer invitación o respuesta';
        $('jointPairHelp').textContent=mode==='offer'?'El participante lee esta invitación. Después, lee aquí su respuesta para completar la conexión.':'Escanea el QR o pega el código completo del otro móvil.';
        $('jointPairOutput').hidden=true; $('jointCopyCode').hidden=true; $('jointQr').replaceChildren(); $('jointPairInput').value=''; $('jointPairStatus').textContent='';
        $('jointNetworkMode').disabled=s.role==='guest';
        if(!$('jointPairDialog').open)$('jointPairDialog').showModal();
    }
    async function gather(pc) {
        if(pc.iceGatheringState==='complete') return true;
        return await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{
                pc.removeEventListener('icegatheringstatechange',listener);
                // An unreachable STUN server must not discard usable local candidates.
                if(/^a=candidate:/m.test(pc.localDescription?.sdp||''))resolve(false);
                else reject(Error('No se han encontrado direcciones de conexión. Revisa la conexión a Internet y los permisos de red local, si aparecen, y vuelve a invitar.'));
            },20000);
            function listener(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',listener);resolve(true);}}
            pc.addEventListener('icegatheringstatechange',listener); listener();
        });
    }
    function candidateSummary(description) {
        const rows=(description?.sdp||'').split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
        const host=rows.filter(l=>/ typ host(?: |$)/.test(l));
        const mdns=host.filter(l=>/\.local(?: |$)/i.test(l)).length;
        const srflx=rows.filter(l=>/ typ srflx(?: |$)/.test(l)).length;
        return 'locales '+host.length+' (mDNS '+mdns+'), STUN '+srflx;
    }
    function pairingDetails(p) {
        return 'ICE: '+p.pc.iceConnectionState+' · enlace: '+p.pc.connectionState+' · canal: '+(p.channel?.readyState||'pendiente')+' · modo: '+p.network+' · este móvil: '+candidateSummary(p.pc.localDescription)+' · otro móvil: '+candidateSummary(p.pc.remoteDescription);
    }
    function pairStatus(p, message) {
        if(s.peers.get(p.id)!==p || p.pairFailed)return;
        p.pairStatus=message;
        // A background participant must not replace another invitation's status.
        if(s.role==='guest'||s.currentInvite===p.id)$('jointPairStatus').textContent=message;
    }
    function disposePeer(p) {
        clearTimeout(p.pairTimer);p.pairTimer=null;
        p.pc.onconnectionstatechange=null;p.pc.oniceconnectionstatechange=null;
        p.pc.onicecandidateerror=null;p.pc.ondatachannel=null;
        if(p.channel){p.channel.onopen=null;p.channel.onclose=null;p.channel.onerror=null;}
        p.pc.close();
    }
    function failPair(p, reason) {
        if(s.peers.get(p.id)!==p||p.pairFailed||p.opened)return;
        const next=p.network==='local'?'Prueba el modo Compatibilidad con punto de acceso (STUN), con Internet disponible.':'Si utilizas un punto de acceso, prueba ambos móviles en un router Wi-Fi común para comparar. STUN no puede superar todos los bloqueos; esta versión no dispone de retransmisión TURN.';
        const message=reason+' ('+pairingDetails(p)+'). '+next+' Mantén ambas páginas abiertas. Pulsa Reiniciar emparejamiento y vuelve a intercambiar los dos códigos.';
        pairStatus(p,message);p.pairFailed=true;disposePeer(p);
        if(s.role==='guest'||s.currentInvite===p.id)tell(message,true);
        renderDevices();
    }
    function watchPair(p, timeout=30000) {
        clearTimeout(p.pairTimer);
        if(p.opened||p.pairFailed||s.peers.get(p.id)!==p)return;
        p.pairTimer=setTimeout(()=>failPair(p,'No se ha abierto el canal en '+Math.round(timeout/1000)+' segundos'),timeout);
    }
    function localDescription(p) {
        const description=p.pc.localDescription;
        const allowed=p.network==='local'?/^a=candidate:.* typ host(?: |\r?$)/m:/^a=candidate:.* typ (?:host|srflx|prflx)(?: |\r?$)/m;
        if(!description || !allowed.test(description.sdp))
            throw Error('El navegador no ha proporcionado direcciones de conexión utilizables. Comprueba Internet y los permisos de red local, si aparecen, o selecciona el modo STUN y reinicia el emparejamiento.');
        return {type:description.type,sdp:description.sdp};
    }
    async function pairingAction(action) {
        if(s.pairBusy)throw Error('Espera a que termine la operación de emparejamiento.');
        s.pairBusy=true;$('jointReadCode').disabled=true;$('jointRetryPair').disabled=true;
        try{return await action();}finally{s.pairBusy=false;$('jointReadCode').disabled=false;$('jointRetryPair').disabled=false;}
    }
    async function retryPair() {
        if(s.pairBusy||running()||s.transaction)throw Error('Espera a que termine la operación actual.');
        await stopScan();
        for(const [id,p] of s.peers)if(p.channel?.readyState!=='open'){
            disposePeer(p);s.peers.delete(id);
            if(s.role==='host')for(const point of s.plan.points)if(point.device===id)point.device=null;
        }
        s.currentInvite=null;
        if(s.role==='host'){savePlan();return pairingAction(invite);}
        if(s.peers.size)throw Error('La conexión ya está abierta. Cierra este cuadro para continuar.');
        s.role=null;s.session=null;s.id=uid();
        $('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        openPair();$('jointPairStatus').textContent='Pide al maestro una invitación nueva. No reutilices la respuesta anterior.';
    }
    function wirePeer(p) {
        const changed=()=>{
            if(s.peers.get(p.id)!==p||p.pairFailed)return;
            if(p.pc.connectionState==='failed'||p.pc.iceConnectionState==='failed')failPair(p,'La conexión directa ha fallado');
            else if(!p.opened&&p.answerAccepted)pairStatus(p,'Estableciendo conexión… '+pairingDetails(p));
            if(['disconnected','failed','closed'].includes(p.pc.connectionState)) {
                if(s.run) incident('connection',p.name+': '+p.pc.connectionState);
            }
            renderDevices();
        };
        p.pc.onconnectionstatechange=changed;p.pc.oniceconnectionstatechange=changed;
        p.pc.ondatachannel=e=>wireChannel(p,e.channel);
    }
    function newPeer(id, network=$('jointNetworkMode').value) {
        if(typeof RTCPeerConnection==='undefined') throw Error('WebRTC no está disponible en este navegador.');
        if(!['local','stun'].includes(network))throw Error('Selecciona un modo de conexión válido.');
        const p={id,network,name:'Móvil '+(s.peers.size+1),pc:new RTCPeerConnection({iceServers:network==='stun'?STUN_SERVERS:[]}),requests:new Map(),samples:[],status:null,model:null,route:null,lastSeen:now(),incoming:null,acks:new Map()};
        s.peers.set(id,p);wirePeer(p);return p;
    }
    function send(p,msg) {
        if(p.channel?.readyState!=='open') return false;
        try {p.channel.send(JSON.stringify({...msg,v:VERSION,session:s.session}));return true;} catch(e){incident('send',e.message);return false;}
    }
    function broadcast(msg) {for(const p of s.peers.values()) send(p,msg);}
    function wireChannel(p,channel) {
        p.channel=channel;
        channel.onopen=()=>{
            if(p.opened||p.pairFailed||s.peers.get(p.id)!==p)return;
            p.opened=true;clearTimeout(p.pairTimer);p.pairTimer=null;
            pairStatus(p,'Conexión establecida. Canal de datos abierto.');
            if(s.role==='guest'||s.currentInvite===p.id){
                if($('jointPairDialog').open)$('jointPairDialog').close();
                stopScan();tab('Devices');
            }
            p.lastSeen=now();send(p,{type:'HELLO',id:s.id,name:s.name,status:localStatus()});
            if(s.role==='host'){send(p,{type:'PLAN',plan:s.plan});startSync(p);}
            tell('Canal de datos establecido. Asigna el móvil a un punto y activa su acelerómetro.');
            checkRoute(p);renderDevices();renderPlan();
        };
        channel.onclose=()=>{incident('connection','Canal cerrado: '+p.name);if(!p.opened)failPair(p,'El canal se ha cerrado antes de conectar');else tell('Se ha cerrado la conexión con '+p.name+'.',true);renderDevices();};
        channel.onerror=()=>{incident('connection','Error de canal: '+p.name);if(!p.opened)failPair(p,'No se ha podido abrir el canal de datos');};
        channel.onmessage=e=>{
            const received=now();
            try {
                if(typeof e.data!=='string'||e.data.length>MAX_MESSAGE) throw Error('Mensaje no admitido.');
                const msg=JSON.parse(e.data);if(msg.v!==VERSION||msg.session!==s.session)return;
                p.lastSeen=received;
                Promise.resolve(onMessage(p,msg,received)).catch(error=>{incident('protocol',error.message);tell(error.message,true);});
            } catch(error){incident('protocol',error.message);}
        };
        // The remote data channel can already be open when datachannel is delivered.
        if(channel.readyState==='open')channel.onopen();
    }
    async function checkRoute(p) {
        try {
            const stats=await p.pc.getStats();let pair;
            stats.forEach(r=>{if(r.type==='transport'&&r.selectedCandidatePairId)pair=stats.get(r.selectedCandidatePairId);});
            if(!pair)stats.forEach(r=>{if(r.type==='candidate-pair'&&r.state==='succeeded'&&r.nominated)pair=r;});
            const a=pair&&stats.get(pair.localCandidateId),b=pair&&stats.get(pair.remoteCandidateId);
            if(a&&b){
                const types=[a.candidateType,b.candidateType];
                p.route=types.includes('relay')?'Ruta con retransmisión TURN':types.every(t=>t==='host')?'Ruta entre candidatos locales (host)':types.some(t=>t==='srflx'||t==='prflx')?'Ruta directa con descubrimiento de direcciones; no certifica recorrido por Wi-Fi':'Ruta no verificable con las estadísticas disponibles';
            }else p.route='Ruta no verificable con las estadísticas disponibles';
        }catch(e){p.route='Ruta pendiente de verificación';}
        renderDevices();
    }
    async function invite() {
        requireHostEdit();
        for(const [id,p] of s.peers) if(p.channel?.readyState!=='open' && p.pc.connectionState!=='connecting'){disposePeer(p);s.peers.delete(id);}
        if(s.peers.size>=MAX_PEERS)throw Error('Máximo 8 participantes en este prototipo.');
        openPair('offer'); $('jointPairStatus').textContent='Preparando invitación…';
        const p=newPeer(uid());s.currentInvite=p.id;wireChannel(p,p.pc.createDataChannel('upm-joint',{ordered:true}));
        try {
            await p.pc.setLocalDescription(await p.pc.createOffer());p.gatherComplete=await gather(p.pc);
            const expires=Date.now()+10*60*1000; p.expires=expires;
            if(s.peers.get(p.id)!==p)return;
            await showToken({v:VERSION,kind:'offer',network:p.network,session:s.session,host:s.id,peer:p.id,name:s.name,expires,sdp:localDescription(p)});
            pairStatus(p,'Invitación válida durante 10 minutos. Esperando respuesta del participante. Direcciones: '+candidateSummary(p.pc.localDescription)+(p.gatherComplete?'':'. Búsqueda limitada a 20 s; se utilizan las direcciones disponibles.'));
            watchPair(p,10*60*1000);
        }catch(e){disposePeer(p);s.peers.delete(p.id);throw e;}
    }
    async function readCode(raw=$('jointPairInput').value) {
        if(running()||s.transaction)throw Error('No se pueden incorporar móviles durante un ensayo.');
        const t=await decodeToken(raw);
        if(t.kind==='offer') {
            if(s.role==='host')throw Error('El maestro debe leer una respuesta, no otra invitación.');
            if(s.peers.size)throw Error('Ya existe una conexión. Sal de la sesión antes de unirte a otra.');
            s.role='guest';s.id=t.peer;s.session=t.session;s.name='Participante';
            $('jointNetworkMode').value=t.network;$('jointNetworkMode').disabled=true;
            const p=newPeer(t.host,t.network);p.name=String(t.name||'Maestro').slice(0,40);workspace();
            try {
                pairStatus(p,'Preparando respuesta…');
                await p.pc.setRemoteDescription(t.sdp);await p.pc.setLocalDescription(await p.pc.createAnswer());p.gatherComplete=await gather(p.pc);
                if(s.peers.get(p.id)!==p||p.pairFailed)return;
                $('jointPairHelp').textContent='Muestra esta respuesta al maestro para que la escanee, o envíale el código completo. Mantén esta página abierta.';
                await showToken({v:VERSION,kind:'answer',network:p.network,session:s.session,host:t.host,peer:t.peer,expires:t.expires,sdp:localDescription(p)});
                if(!p.opened)pairStatus(p,'Respuesta preparada. El maestro debe leerla en los próximos 2 minutos. Direcciones: '+candidateSummary(p.pc.localDescription)+(p.gatherComplete?'':'. Búsqueda limitada a 20 s.'));
                watchPair(p,120000);
            }catch(e){disposePeer(p);s.peers.delete(p.id);throw e;}
        } else {
            if(s.role!=='host'||t.session!==s.session||t.host!==s.id)throw Error('Esta respuesta pertenece a otra sesión.');
            const p=s.peers.get(t.peer);if(!p || p.pc.signalingState!=='have-local-offer')throw Error('Invitación no disponible o ya utilizada.');
            if(t.network!==p.network)throw Error('La respuesta usa otro modo de conexión. Genera una invitación nueva.');
            s.currentInvite=p.id;p.answerAccepted=true;watchPair(p);
            try {
                await p.pc.setRemoteDescription(t.sdp);
                if(!p.opened)pairStatus(p,'Respuesta aceptada. Estableciendo conexión… '+pairingDetails(p));
            }catch(e){failPair(p,'No se pudo aceptar la respuesta: '+e.message);throw e;}
        }
    }
    async function stopScan() {if(s.scanFrame)cancelAnimationFrame(s.scanFrame);s.scanFrame=null;if(s.scan)s.scan.getTracks().forEach(t=>t.stop());s.scan=null;$('jointScanner').srcObject=null;$('jointScanner').hidden=true;$('jointStopScan').hidden=true;}
    async function scanCode() {
        if(typeof jsQR!=='function')throw Error('El lector QR no se ha cargado. Puedes pegar el código.');
        await stopScan();
        s.scan=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        const video=$('jointScanner');video.srcObject=s.scan;video.hidden=false;$('jointStopScan').hidden=false;await video.play();
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
        const frame=()=>{
            if(!s.scan)return;
            if(video.readyState>=2) {
                const scale=Math.min(1,1000/video.videoWidth);canvas.width=video.videoWidth*scale;canvas.height=video.videoHeight*scale;
                ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(img.data,img.width,img.height);
                if(result){$('jointPairInput').value=result.data;stopScan();guard(()=>pairingAction(()=>readCode(result.data)))();return;}
            }
            s.scanFrame=requestAnimationFrame(frame);
        };frame();
    }

    // Four timestamps. Network asymmetry remains an unobservable error source.
    function clockFit(samples) {
        if(!samples.length)return null;
        const recent=samples.slice(-240),sorted=[...recent].sort((a,b)=>a.rtt-b.rtt);
        const cutoff=sorted[Math.max(0,Math.ceil(sorted.length*.3)-1)].rtt;
        const chosen=recent.filter(v=>v.rtt<=cutoff);
        const reference=chosen.reduce((a,v)=>a+v.local,0)/chosen.length;
        const offset=chosen.reduce((a,v)=>a+v.offset,0)/chosen.length;
        const span=Math.max(...chosen.map(v=>v.local))-Math.min(...chosen.map(v=>v.local));
        let numerator=0,denominator=0;
        for(const v of chosen){numerator+=(v.local-reference)*(v.offset-offset);denominator+=(v.local-reference)**2;}
        const drift=span>=20000&&chosen.length>=6&&denominator>0?numerator/denominator:0;
        // Grossly implausible fits are not used to schedule an acquisition.
        if(!finite(drift)||Math.abs(drift)>.005)return null;
        const residual=Math.sqrt(chosen.reduce((a,v)=>a+(v.offset-offset-drift*(v.local-reference))**2,0)/chosen.length);
        return {reference,offset,drift,rtt:sorted[0].rtt,residual,count:samples.length,updated:now()};
    }
    const toMaster=(t,m=s.syncModel)=>t-m.offset-m.drift*(t-m.reference);
    const fromMaster=(t,m)=> (t+m.offset-m.drift*m.reference)/(1-m.drift);
    function syncOnce(p) {
        if(p.channel?.readyState!=='open')return;
        const id=uid(),t1=now();p.requests.set(id,t1);send(p,{type:'SYNC_REQUEST',id,t1});
        for(const [key,time] of p.requests)if(t1-time>10000)p.requests.delete(key);
    }
    async function startSync(p) {
        if(p.syncing)return;p.syncing=true;
        try {for(let i=0;i<24&&p.channel?.readyState==='open';i++){syncOnce(p);await pause(100);}} finally{p.syncing=false;}
    }

    async function onMessage(p,m,received) {
        if(m.type==='HELLO') {
            if(m.id!==p.id)throw Error('Identificador de dispositivo inesperado.');
            p.name=String(m.name||'Móvil').slice(0,40);p.status=m.status;renderPlan();renderDevices();return;
        }
        if(m.type==='STATUS'){p.status=m.status;p.name=String(m.status?.name||p.name).slice(0,40);return;}
        if(m.type==='SYNC_REQUEST'&&s.role==='guest') {
            if(typeof m.id!=='string'||!finite(m.t1))return;
            send(p,{type:'SYNC_REPLY',id:m.id,t1:m.t1,t2:received,t3:now()});return;
        }
        if(m.type==='SYNC_REPLY'&&s.role==='host') {
            const t1=p.requests.get(m.id);if(t1===undefined)return;p.requests.delete(m.id);
            if(!finite(m.t2)||!finite(m.t3)||m.t3<m.t2)return;
            const rtt=(received-t1)-(m.t3-m.t2);if(rtt<0||rtt>2000)return;
            const row={t1,t2:m.t2,t3:m.t3,t4:received,rtt,offset:((m.t2-t1)+(m.t3-received))/2,local:(m.t2+m.t3)/2};
            p.samples.push(row);if(p.samples.length>1200)p.samples.shift();p.model=clockFit(p.samples);
            if(p.model){send(p,{type:'CLOCK_MODEL',model:p.model,exchange:row});}
            return;
        }
        if(m.type==='CLOCK_MODEL'&&s.role==='guest') {
            if(!validModel(m.model))return;
            s.syncModel={...m.model,updated:now()};p.model=m.model;
            if(m.exchange){s.syncLog.push(m.exchange);if(s.syncLog.length>1200)s.syncLog.shift();}
            return;
        }
        if(m.type==='PLAN'&&s.role==='guest'&&!running()) {s.plan=checkPlan(m.plan);s.selected=pointFor()?.id||s.plan.points[0]?.id;renderPlan();return;}
        if(m.type==='PREPARE'&&s.role==='guest') {
            let reason='';
            if(running())reason='Ya hay un ensayo activo.';
            else if(!localStatus().sensor||document.hidden)reason='Sensor sin datos o página oculta.';
            else if(!pointFor())reason='Falta asignación a un punto.';
            else if(s.syncModel.count<8||now()-s.syncModel.updated>15000)reason='Sincronización no reciente.';
            else if(typeof m.runId!=='string'||!finite(m.duration)||m.duration<5||m.duration>1800)reason='Duración no válida.';
            if(!reason)s.pending={id:m.runId,duration:m.duration,expires:now()+15000};
            send(p,{type:'READY',runId:m.runId,ok:!reason,reason});tell(reason||'Preparado. Esperando confirmación del maestro.',!!reason);return;
        }
        if(m.type==='READY'&&s.role==='host') {
            if(s.transaction?.id===m.runId){s.transaction.ready.set(p.id,{ok:m.ok===true,reason:String(m.reason||'')});}return;
        }
        if(m.type==='START_AT'&&s.role==='guest') {
            if(s.run?.id===m.runId){send(p,{type:'START_ACK',runId:m.runId});return;}
            if(!s.pending||s.pending.id!==m.runId||s.pending.expires<now()||!finite(m.start)||!finite(m.end)||m.end-m.start!==s.pending.duration*1000||m.start-toMaster(now())<500||!localStatus().sensor) {send(p,{type:'START_REJECT',runId:m.runId});return;}
            beginRun(m.runId,m.start,m.end,s.pending.duration);s.pending=null;send(p,{type:'START_ACK',runId:m.runId});return;
        }
        if(m.type==='START_ACK'&&s.role==='host'){if(s.transaction?.id===m.runId)s.transaction.acks.add(p.id);return;}
        if(m.type==='START_REJECT'&&s.role==='host'){if(s.transaction?.id===m.runId)s.transaction.error='Un participante no pudo programar el inicio.';return;}
        if(m.type==='STOP_REQUEST'&&s.role==='host'){stopRun('Solicitud de '+p.name);return;}
        if(m.type==='STOP_AT'&&s.role==='guest') {
            if(s.run?.id===m.runId&&running()&&finite(m.end)){s.run.end=Math.max(s.run.start,Math.min(s.run.end,m.end));incident('stop','Parada anticipada del maestro');}return;
        }
        if(m.type==='ABORT'&&s.role==='guest') {if(s.pending?.id===m.runId)s.pending=null;if(s.run?.id===m.runId&&running()){s.run.state='cancelled';incident('cancel',m.reason||'Ensayo cancelado');await finishRun(true);}return;}
        if(m.type==='TRANSFER_BEGIN'&&s.role==='host') {
            if(!s.run||s.run.id!==m.runId||!Number.isInteger(m.size)||m.size<1||m.size>80000000||!Number.isInteger(m.count)||m.count!==Math.ceil(m.size/12000)||typeof m.hash!=='string')throw Error('Transferencia no válida.');
            p.incoming={id:m.transferId,runId:m.runId,size:m.size,count:m.count,hash:m.hash,parts:[],length:0,next:0};
            send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:-1});return;
        }
        if(m.type==='TRANSFER_CHUNK'&&s.role==='host') {
            const t=p.incoming;if(!t||t.id!==m.transferId)return;
            if(m.index<t.next){send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;}
            if(m.index!==t.next||typeof m.data!=='string'||m.data.length>12000||t.length+m.data.length>t.size)throw Error('Bloque de datos no válido.');
            t.parts.push(m.data);t.length+=m.data.length;t.next++;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:m.index});return;
        }
        if(m.type==='TRANSFER_END'&&s.role==='host') {
            const t=p.incoming;
            if(!t||t.id!==m.transferId){if(p.completedTransfer?.id===m.transferId)send(p,{type:'TRANSFER_ACK',transferId:m.transferId,index:p.completedTransfer.count});return;}
            if(t.length!==t.size||t.next!==t.count)throw Error('Registro incompleto. Solicita el reenvío.');
            const text=t.parts.join('');if(await hashText(text)!==t.hash)throw Error('La comprobación de integridad no coincide. Reenvía el registro.');
            const record=JSON.parse(text);validateRecord(record,p.id,t.runId);
            s.results.set(p.id,record);p.completedTransfer={id:t.id,count:t.count};p.incoming=null;send(p,{type:'TRANSFER_ACK',transferId:t.id,index:t.count});renderResults();return;
        }
        if(m.type==='TRANSFER_ACK') {const key=m.transferId+':'+m.index,resolve=p.acks.get(key);if(resolve){p.acks.delete(key);resolve();}return;}
    }
    function validModel(m) {return m&&['offset','drift','reference','count','rtt'].every(k=>finite(m[k]))&&Math.abs(m.drift)<=.005&&m.count>=1;}

    // Local durable chunks. Sensor callbacks only push to memory; storage is batched.
    async function db() {
        if(s.db)return s.db;
        s.db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('upm-joint-v1',1);
            req.onupgradeneeded=()=>{req.result.createObjectStore('runs',{keyPath:'key'});req.result.createObjectStore('chunks',{keyPath:'key'});};
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        });return s.db;
    }
    async function storeBatch(run,rows,index) {
        const database=await db();
        await new Promise((resolve,reject)=>{
            const tx=database.transaction(['runs','chunks'],'readwrite');
            tx.objectStore('runs').put({key:run.id+':'+run.device.id,meta:runMeta(run)});
            if(rows.length)tx.objectStore('chunks').put({key:run.id+':'+run.device.id+':'+String(index).padStart(8,'0'),rows});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Guardado interrumpido'));
        });
    }
    function persist(run=s.run) {
        if(!run)return s.writeChain;
        if(run.device.role==='guest') run.sync=structuredClone(s.syncLog);
        const start=run.persisted||0,rows=run.samples.slice(start);run.persisted=run.samples.length;
        const index=run.chunkIndex||0;run.chunkIndex=index+1;
        s.writeChain=s.writeChain.then(()=>storeBatch(run,rows,index)).catch(e=>{
            if(!s.storageFailed){s.storageFailed=true;incident('storage','Guardado local fallido: '+e.message);tell('No se pudo guardar en el navegador. Conserva la página abierta y descarga el registro.',true);}
        });return s.writeChain;
    }
    async function recover() {
        const database=await db();
        const entries=await new Promise((resolve,reject)=>{const req=database.transaction('runs').objectStore('runs').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        $('jointRecoveryList').replaceChildren();
        if(!entries.length){$('jointRecoveryList').textContent='No hay registros locales guardados.';return;}
        for(const entry of entries.sort((a,b)=>b.meta.created.localeCompare(a.meta.created))) {
            const b=document.createElement('button');b.type='button';b.className='joint-secondary';b.textContent=entry.meta.created.slice(0,19)+' · '+entry.meta.device.name;
            b.onclick=guard(async()=>{
                const range=IDBKeyRange.bound(entry.key+':',entry.key+':\uffff');
                const chunks=await new Promise((resolve,reject)=>{const req=database.transaction('chunks').objectStore('chunks').getAll(range);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
                download('recuperado_'+entry.meta.id+'.json',{...entry.meta,recovered:true,samples:chunks.flatMap(v=>v.rows)});
            });$('jointRecoveryList').append(b);
        }
    }
    async function enableSensor() {
        if(!window.isSecureContext)throw Error('Abre la web mediante HTTPS para usar el acelerómetro.');
        if(typeof DeviceMotionEvent==='undefined')throw Error('Este navegador no ofrece eventos de movimiento.');
        if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')throw Error('Debes permitir el acceso al movimiento.');
        if(!s.sensorEnabled){window.addEventListener('devicemotion',motion);s.sensorEnabled=true;}
        tell('Esperando datos del acelerómetro…');renderDevices();
        setTimeout(()=>{if(s.sensorEnabled&&!s.sensor)tell('No llegan datos del sensor. Revisa los permisos y mantén la página visible.',true);},4000);
    }
    function motion(event) {
        const received=now(),a=event.accelerationIncludingGravity;
        if(!a||![a.x,a.y,a.z].every(finite))return;
        const timestamp=finite(event.timeStamp)?event.timeStamp:null;
        // Event creation time, not hardware sampling time. Preserve raw and receipt.
        const used=timestamp!==null&&timestamp<=received+5&&timestamp>=received-1000?timestamp:received;
        if(running()&&s.lastSample&&received-s.lastSample>250)incident('sample-gap','Sin eventos de movimiento durante '+Math.round(received-s.lastSample)+' ms.');
        const sample=[0,timestamp,received,a.x,a.y,a.z,finite(event.interval)?event.interval:null,used];
        s.sensor=true;s.lastSample=received;s.rateTimes.push(received);if(s.rateTimes.length>120)s.rateTimes.shift();
        s.recent.push(sample);while(s.recent.length&&s.recent[0][2]<received-2000)s.recent.shift();
        s.preview.push(sample);if(s.preview.length>600)s.preview.shift();
        const run=s.run;
        if(run&&activeStates.has(run.state)) {
            const t=toMaster(used,run.initialClock);
            if(t>=run.start-1000&&t<=run.end+1000)appendSample(run,sample);
        }
    }
    function appendSample(run,sample) {
        if(run.samples.length>=MAX_SAMPLES){if(!run.sampleLimit){run.sampleLimit=true;incident('limit','Se ha alcanzado el límite de muestras.');}run.end=Math.min(run.end,toMaster(now(),run.initialClock));return;}
        const row=[...sample];row[0]=run.samples.length;run.samples.push(row);
    }
    async function requestWake() {try{if(navigator.wakeLock)s.wake=await navigator.wakeLock.request('screen');}catch(e){incident('screen','No se pudo mantener la pantalla activa.');}}
    function releaseWake(){if(s.wake){s.wake.release().catch(()=>{});s.wake=null;}}
    function beginRun(id,start,end,duration) {
        s.results.clear();s.storageFailed=false;
        const model=s.role==='host'?{offset:0,drift:0,reference:0,count:0,rtt:0}:structuredClone(s.syncModel);
        s.run={id,session:s.session,start,end,plannedEnd:end,duration,state:'armed',created:new Date().toISOString(),plan:structuredClone(s.plan),initialClock:model,finalClock:model,samples:[],incidents:[],persisted:0,chunkIndex:0,device:{id:s.id,name:s.name,role:s.role,point:structuredClone(pointFor()||null)},sync:[]};
        for(const sample of s.recent){const t=toMaster(sample[7],model);if(t>=start-1000&&t<=end+1000)appendSample(s.run,sample);}
        tab('Measure');requestWake();persist();renderPlan();renderDevices();tell('Inicio programado. Mantén la página visible y el teléfono inmóvil.');
    }
    async function startRun() {
        requireHostEdit();
        if(!localStatus().sensor||document.hidden)throw Error('Activa el acelerómetro del maestro y mantén la página visible.');
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        if(!peers.length)throw Error('Conecta al menos otro móvil para realizar una medida conjunta.');
        if(!pointFor())throw Error('Asigna el maestro a un punto del plano.');
        if(s.plan.points.some(q=>q.device&&q.device!==s.id&&!peers.some(p=>p.id===q.device)))throw Error('Hay un punto asignado a un móvil desconectado. Conéctalo o elimina su asignación.');
        for(const p of peers) {
            if(!pointFor(p.id))throw Error('Asigna '+p.name+' a un punto del plano.');
            if(!p.status?.sensor||!p.status.visible||now()-p.lastSeen>6000)throw Error(p.name+' no tiene el sensor preparado o la página visible.');
            if(!p.model||p.model.count<8||now()-p.model.updated>15000)throw Error('Repite la sincronización de '+p.name+'.');
        }
        const duration=Number($('jointDuration').value);if(!finite(duration)||duration<5||duration>1800||!Number.isInteger(duration))throw Error('Introduce una duración entera entre 5 y 1800 segundos.');
        const id=uid(),tx={id,ready:new Map(),acks:new Set(),error:null};s.transaction=tx;renderPlan();renderDevices();
        broadcast({type:'PREPARE',runId:id,duration});tell('Solicitando confirmación a los participantes…');
        try {
            const limit=now()+5000;
            while(tx.ready.size<peers.length&&now()<limit&&s.transaction===tx)await pause(50);
            if(s.transaction!==tx)throw Error('Inicio cancelado.');
            if(tx.ready.size!==peers.length)throw Error('Un participante no respondió. No se inicia el ensayo.');
            for(const v of tx.ready.values())if(!v.ok)throw Error(v.reason||'Un participante no está preparado.');
            const start=now()+4000,end=start+duration*1000;
            beginRun(id,start,end,duration);broadcast({type:'START_AT',runId:id,start,end});
            const deadline=now()+2000;
            while(tx.acks.size<peers.length&&now()<deadline&&!tx.error&&s.transaction===tx)await pause(50);
            if(tx.error||tx.acks.size!==peers.length||s.transaction!==tx)throw Error(tx.error||'Falta confirmación del inicio. Se cancela el ensayo.');
            tell('Todos han confirmado. Inicio en unos segundos.');
        } catch(e) {
            broadcast({type:'ABORT',runId:id,reason:e.message});
            if(s.run?.id===id&&running()) {s.run.state='cancelled';incident('cancel',e.message);await finishRun(true);}
            throw e;
        } finally {if(s.transaction===tx)s.transaction=null;renderDevices();renderPlan();}
    }
    function stopRun(reason='Parada manual') {
        if(s.role==='guest') {
            const host=[...s.peers.values()][0];send(host,{type:'STOP_REQUEST'});
            if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,toMaster(now(),s.run.initialClock)));incident('stop','Parada local solicitada');}
            return;
        }
        if(s.transaction||s.run?.state==='armed') {
            const id=s.transaction?.id||s.run.id;s.transaction=null;broadcast({type:'ABORT',runId:id,reason});
            if(running()){s.run.state='cancelled';incident('cancel',reason);finishRun(true);}return;
        }
        if(running()){s.run.end=Math.max(s.run.start,Math.min(s.run.end,now()));incident('stop',reason);broadcast({type:'STOP_AT',runId:s.run.id,end:s.run.end});}
    }
    function runMeta(run) {
        return {schema:'pasarelas-upm-joint-v1',id:run.id,session:run.session,created:run.created,state:run.state,device:run.device,plan:run.plan,windowMasterMs:{start:run.start,end:run.end,plannedEnd:run.plannedEnd},initialClock:run.initialClock,finalClock:run.finalClock,synchronization:run.sync||[],incidents:run.incidents,sampleColumns:['sequence','eventTimeMs','receiptTimeMs','ax','ay','az','reportedIntervalMs','usedTimeMs'],acceleration:'includingGravity',units:'m/s²',timestampMeaning:'DOM event/receipt times; not certified hardware acquisition times',clockFormula:'masterMs = localMs - offset - drift * (localMs - reference)',userAgent:navigator.userAgent};
    }
    function localRecord() {return s.run?{...runMeta(s.run),samples:s.run.samples}:null;}
    async function finishRun(cancelled=false) {
        const run=s.run;if(!run||run.finishing||run.finished)return;run.finishing=true;
        run.state=cancelled?'cancelled':'finished';run.finalClock=s.role==='host'?run.initialClock:structuredClone(s.syncModel);
        releaseWake();await persist(run);run.finished=true;run.finishing=false;
        if(s.run!==run)return;
        const record=localRecord();s.results.set(s.id,record);tab('Results');renderPlan();renderDevices();renderResults();
        tell(cancelled?'Ensayo cancelado. Los datos disponibles se conservan.':'Registro local terminado. Ya puedes descargar los datos.');
        if(s.role==='guest'&&!cancelled)sendRecord().catch(e=>{incident('transfer',e.message);tell('Registro local conservado. '+e.message,true);});
    }

    async function hashText(text) {
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
    }
    function validateRecord(r,id,runId) {
        if(!r||r.schema!=='pasarelas-upm-joint-v1'||r.id!==runId||r.device?.id!==id||!Array.isArray(r.samples)||r.samples.length>MAX_SAMPLES)throw Error('Registro recibido incompatible.');
        if(!Array.isArray(r.incidents)||!r.windowMasterMs||![r.windowMasterMs.start,r.windowMasterMs.end].every(finite))throw Error('Ventana temporal no válida.');
        for(let i=0;i<r.samples.length;i++){const row=r.samples[i];if(!Array.isArray(row)||row.length!==8||row[0]!==i||![row[2],row[3],row[4],row[5],row[7]].every(finite))throw Error('Muestras recibidas no válidas.');}
    }
    async function acknowledged(p,message,index) {
        for(let attempt=0;attempt<3;attempt++) {
            if(p.channel?.readyState!=='open')throw Error('La conexión se ha cerrado. Reconecta y reenvía el registro.');
            const key=message.transferId+':'+index;
            try {
                await new Promise((resolve,reject)=>{
                    const timer=setTimeout(()=>{p.acks.delete(key);reject(Error('Sin confirmación del bloque.'));},4000);
                    p.acks.set(key,()=>{clearTimeout(timer);resolve();});
                    if(!send(p,message)){clearTimeout(timer);p.acks.delete(key);reject(Error('No se pudo enviar el bloque.'));}
                });return;
            }catch(e){if(attempt===2)throw e;}
        }
    }
    async function sendRecord() {
        if(s.role!=='guest')return;
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        if(s.transfer)throw Error('Hay una transferencia en curso.');
        const host=[...s.peers.values()][0];if(!host||host.channel?.readyState!=='open')throw Error('No hay conexión con el maestro. Descarga tus datos localmente.');
        s.transfer={percent:0};renderResults();
        try {
            const text=JSON.stringify(localRecord()),hash=await hashText(text),transferId=uid(),count=Math.ceil(text.length/12000);
            if(text.length>80000000)throw Error('Registro demasiado grande para transferir. Descárgalo localmente.');
            await acknowledged(host,{type:'TRANSFER_BEGIN',transferId,runId:s.run.id,size:text.length,count,hash},-1);
            for(let i=0;i<count;i++) {
                await acknowledged(host,{type:'TRANSFER_CHUNK',transferId,index:i,data:text.slice(i*12000,(i+1)*12000)},i);
                s.transfer.percent=Math.round(100*(i+1)/count);renderResults();
            }
            await acknowledged(host,{type:'TRANSFER_END',transferId},count);
            s.run.transferred=true;tell('El maestro ha recibido el registro y verificado su integridad.');
        }finally{s.transfer=null;renderResults();}
    }
    function renderResults() {
        const r=s.run;
        $('jointDownload').disabled=!r?.finished;$('jointCsv').disabled=!r?.finished;
        $('jointNewRun').disabled=!!running()||!!s.transfer;
        $('jointSendData').hidden=s.role!=='guest';$('jointSendData').disabled=!r?.finished||!!s.transfer;
        if(!r){$('jointResultsList').textContent='Todavía no hay un ensayo registrado.';return;}
        let html=`<p><strong>${r.state==='cancelled'?'Ensayo cancelado':r.finished?'Registro terminado':'Ensayo en curso'}</strong> · ${escape(r.plan.name)}</p>`;
        const expected=[r.device,...(s.role==='host'?[...s.peers.values()].filter(p=>r.plan.points.some(q=>q.device===p.id)).map(p=>({id:p.id,name:p.name})):[])];
        for(const d of expected) {
            const data=s.results.get(d.id);
            html+=`<article class="joint-device-card"><strong>${escape(d.name)}</strong><p>${data?data.samples.length+' muestras · '+data.incidents.length+' incidencias':d.id===s.id?r.samples.length+' muestras locales':'Registro pendiente de recibir'}</p></article>`;
        }
        if(s.transfer)html+=`<p>Enviando al maestro: ${s.transfer.percent}%</p>`;
        if(r.transferred)html+='<p>Registro confirmado por el maestro.</p>';
        if(s.storageFailed)html+='<p class="joint-warning">El guardado persistente ha fallado: descarga los datos antes de cerrar.</p>';
        $('jointResultsList').innerHTML=html;
    }
    function exportSession() {
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        const records=[...s.results.values()].map(r=>{
            // Keep originals; use one final model per record to avoid time jumps.
            const model=r.device.id===s.id?r.finalClock:(s.peers.get(r.device.id)?.model||r.finalClock);
            const valid=validModel(model)||r.device.role==='host';
            return {...r,exportClock:valid?model:r.initialClock,samples:r.samples.map(row=>({raw:row,masterTimeMs:toMaster(row[7],valid?model:r.initialClock)}))};
        });
        const expected=s.run.plan.points.filter(p=>p.device).map(p=>p.device);
        download('ensayo_conjunto_'+s.run.id+'.json',{schema:'pasarelas-upm-joint-export-v1',session:s.session,plan:s.run.plan,windowMasterMs:{start:s.run.start,end:s.run.end},complete:expected.every(id=>s.results.has(id)),missingDevices:expected.filter(id=>!s.results.has(id)),networkClockLog:Object.fromEntries([...s.peers.values()].map(p=>[p.id,p.samples])),records,validation:'Experimental: no certified physical sensor synchronization. Data have not been resampled.'});
    }
    function exportCsv() {
        const r=localRecord();if(!r||!s.run.finished)throw Error('No hay un registro terminado.');
        const model=r.finalClock,point=r.device.point;
        const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
        const columns=['device','point','point_x_m','point_y_m','axis','angle_deg','sequence','event_time_ms','receipt_time_ms','ax_m_s2','ay_m_s2','az_m_s2','reported_interval_ms','used_time_ms','master_time_estimated_ms','inside_window'];
        const lines=r.samples.map(row=>{const t=toMaster(row[7],model);return [r.device.name,point?.name,point?.x,point?.y,point?.axis,point?.angle,...row,t,t>=r.windowMasterMs.start&&t<=r.windowMasterMs.end?1:0].map(cell).join(',');});
        download('aceleraciones_'+r.id+'_'+s.id+'.csv','\ufeff'+columns.join(',')+'\n'+lines.join('\n'),'text/csv;charset=utf-8');
    }
    function drawPreview() {
        const canvas=$('jointLive'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
        ctx.clearRect(0,0,w,h);ctx.strokeStyle='#dce6ee';ctx.beginPath();for(let i=1;i<4;i++){ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);}ctx.stroke();
        const a=s.preview.filter(v=>v[2]>now()-5000);if(a.length<2)return;
        const span=Math.max(1000,a[a.length-1][2]-a[0][2]),max=Math.max(1,...a.flatMap(v=>v.slice(3,6).map(Math.abs)));
        for(let axis=0;axis<3;axis++){ctx.strokeStyle=['#4285f4','#0f9d58','#db4437'][axis];ctx.lineWidth=1.6;ctx.beginPath();a.forEach((v,i)=>{const x=35+(v[2]-a[0][2])/span*(w-45),y=h/2-v[axis+3]/max*(h/2-25);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}
        ctx.fillStyle='#516b80';ctx.font='13px Arial';ctx.fillText(max.toFixed(1)+' m/s²',8,17);ctx.fillText('0',8,h/2);ctx.fillText('-'+max.toFixed(1),8,h-8);
    }
    function tick() {
        if(root.hidden)return;
        const r=s.run;
        if(r&&activeStates.has(r.state)) {
            const t=toMaster(now(),r.initialClock);
            if(t<r.start)$('jointMeasureState').textContent='Inicio en '+Math.max(0,Math.ceil((r.start-t)/1000))+' s';
            else {
                r.state='recording';const elapsed=Math.max(0,Math.min(t,r.end)-r.start);
                $('jointMeasureState').textContent=t>r.end?'Guardando margen final…':Math.floor(elapsed/60000).toString().padStart(2,'0')+':'+Math.floor(elapsed/1000%60).toString().padStart(2,'0');
                $('jointProgress').value=Math.min(1,elapsed/Math.max(1,r.end-r.start));
            }
            if(t>r.end+1000)finishRun().catch(e=>tell(e.message,true));
        }
        $('jointSampleCount').textContent=r?.samples.length||0;$('jointRate').textContent=localStatus().sensor?sampleRate().toFixed(1)+' Hz':'—';
        drawPreview();
        if(++s.uiTick%4===0){renderDevices();broadcast({type:'STATUS',status:localStatus()});if(running())persist();}
        if(s.uiTick%20===0&&s.role==='host')for(const p of s.peers.values())syncOnce(p);
    }
    function resetSession() {
        if((running()||s.transaction)&&!confirm('¿Cancelar la medida y salir? Los bloques guardados seguirán disponibles en este navegador.'))return;
        if(running()||s.transaction)stopRun('Salida de la sesión');
        if(s.run){if(running())s.run.state='cancelled';persist();}
        stopScan();if($('jointPairDialog').open)$('jointPairDialog').close();
        for(const p of s.peers.values())disposePeer(p);s.peers.clear();s.currentInvite=null;
        window.removeEventListener('devicemotion',motion);s.sensor=false;s.sensorEnabled=false;releaseWake();
        s.role=null;s.session=null;s.run=null;s.results.clear();s.pending=null;s.transaction=null;s.syncLog=[];s.recent=[];s.rateTimes=[];s.preview=[];
        s.syncModel={offset:0,drift:0,reference:0,rtt:null,count:0,updated:0};s.id=uid();
        root.hidden=true;$('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        if(s.returnTo)s.returnTo.style.display='block';else $('mainMenu').style.display='block';
        history.replaceState(null,'',location.pathname+location.search);
    }

    // UI bindings. All generated text is escaped before entering markup.
    $('openJointButton').addEventListener('click',guard(open));
    $('standaloneTestButton').addEventListener('click',guard(()=>{
        if(typeof Chart==='undefined')throw Error('No se ha cargado la librería de gráficas. Recarga la página con conexión.');
        mainMenu.style.display='none';testForm.style.display='block';
        if(accelerationChart===null){createAccelerationChart();createSpectrumChart();createPsdChart();createRmsChart();[accelerationChart,spectrumChart,psdChart,rmsChart].forEach(enableLegendToggling);}
    }));
    $('jointExit').addEventListener('click',resetSession);
    document.querySelectorAll('[data-joint-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.jointTab);if(b.dataset.jointTab==='Results')renderResults();});
    $('jointCreate').onclick=guard(()=>{
        open();s.id=uid();s.role='host';s.name='Maestro';s.session=uid();
        try{const stored=localStorage.getItem('upm-joint-plan-v1');if(stored)s.plan=checkPlan(JSON.parse(stored));}catch(e){tell('No se pudo recuperar el plano anterior.',true);}
        if(!s.plan.points.length)s.plan.points=[{id:'P1',name:'Centro de vano',x:s.plan.length/2,y:s.plan.width/2,axis:'z',angle:0,device:s.id},{id:'P2',name:'L/4',x:s.plan.length/4,y:s.plan.width/2,axis:'z',angle:0,device:null}];
        else {s.plan.points.forEach(p=>p.device=null);s.plan.points[0].device=s.id;}
        s.selected=s.plan.points[0].id;workspace();tell('Define el plano y pulsa Invitar móvil para incorporar un participante.');
    });
    $('jointJoin').onclick=()=>openPair();$('jointPair').onclick=guard(()=>pairingAction(invite));
    $('jointRetryPair').onclick=guard(retryPair);
    $('jointNetworkMode').onchange=()=>{$('jointPairStatus').textContent='Pulsa Reiniciar emparejamiento para generar una invitación nueva con este modo.';};
    $('jointPairClose').onclick=()=>{$('jointPairDialog').close();stopScan();};
    $('jointPairDialog').addEventListener('close',stopScan);
    $('jointReadCode').onclick=guard(()=>pairingAction(()=>readCode()));$('jointScanCode').onclick=guard(scanCode);$('jointStopScan').onclick=stopScan;
    $('jointCopyCode').onclick=guard(async()=>{const text=$('jointPairOutput').value;try{await navigator.clipboard.writeText(text);$('jointPairStatus').textContent='Código copiado.';}catch(e){$('jointPairOutput').focus();$('jointPairOutput').select();$('jointPairStatus').textContent='Selecciona y copia el código completo.';}});
    $('jointApplyGeometry').onclick=guard(()=>{
        requireHostEdit();const candidate={...s.plan,name:$('jointName').value,length:Number($('jointLength').value),width:Number($('jointWidth').value)};
        s.plan=checkPlan(candidate);savePlan();tell('Dimensiones guardadas.');
    });
    $('jointAddPoint').onclick=guard(()=>{requireHostEdit();s.adding=!s.adding;renderPlan();});
    $('jointRemovePoint').onclick=guard(()=>{requireHostEdit();if(!s.selected)throw Error('Selecciona un punto.');s.plan.points=s.plan.points.filter(p=>p.id!==s.selected);s.selected=s.plan.points[0]?.id;savePlan();});
    $('jointApplyPoint').onclick=guard(()=>{
        requireHostEdit();const original=s.plan.points.find(p=>p.id===s.selected);if(!original)return;
        const device=$('jointPointDevice').value||null;
        if(device&&s.plan.points.some(p=>p.id!==original.id&&p.device===device))throw Error('Ese móvil ya tiene otro punto. Desasígnalo primero.');
        const candidate={...original,name:$('jointPointName').value,x:Number($('jointPointX').value),y:Number($('jointPointY').value),axis:$('jointPointAxis').value,angle:Number($('jointPointAngle').value),device};
        s.plan=checkPlan({...s.plan,points:s.plan.points.map(p=>p.id===candidate.id?candidate:p)});savePlan();renderDevices();tell('Punto actualizado.');
    });
    $('jointSavePlan').onclick=()=>download('plano_puntos.json',{schema:'pasarelas-upm-plan-v1',...s.plan,points:s.plan.points.map(p=>({...p,device:null}))});
    $('jointImportPlan').onchange=guard(async e=>{requireHostEdit();const file=e.target.files[0];if(!file)return;if(file.size>100000)throw Error('El archivo de plano es demasiado grande.');const plan=checkPlan(JSON.parse(await file.text()));plan.points.forEach(p=>p.device=null);s.plan=plan;s.selected=plan.points[0]?.id;savePlan();e.target.value='';tell('Plano importado. Asigna los móviles a los puntos.');});
    $('jointPointsTable').onclick=e=>{const b=e.target.closest('[data-select-point]');if(b){s.selected=b.dataset.selectPoint;renderPlan();}};
    $('jointPlan').addEventListener('keydown',guard(e=>{
        const el=e.target.closest('[data-point]');if(!el)return;
        if(e.key==='Enter'||e.key===' '){e.preventDefault();s.selected=el.dataset.point;renderPlan();}
    }));
    $('jointPlan').addEventListener('pointerdown',guard(e=>{
        const el=e.target.closest('[data-point]'),pos=svgPosition(e);
        if(el){s.selected=el.dataset.point;if(s.role==='host'&&!running()&&!s.transaction){s.drag=s.selected;$('jointPlan').setPointerCapture(e.pointerId);}renderPlan();}
        else if(s.adding&&pos&&pos.x>=0&&pos.x<=s.plan.length&&pos.y>=0&&pos.y<=s.plan.width)addPoint(pos.x,pos.y);
    }));
    $('jointPlan').addEventListener('pointermove',e=>{
        if(!s.drag)return;const pos=svgPosition(e),p=s.plan.points.find(p=>p.id===s.drag);if(!p||!pos)return;
        p.x=Number(Math.min(s.plan.length,Math.max(0,pos.x)).toFixed(2));p.y=Number(Math.min(s.plan.width,Math.max(0,pos.y)).toFixed(2));renderPlan();
    });
    for(const event of ['pointerup','pointercancel'])$('jointPlan').addEventListener(event,guard(()=>{if(s.drag){s.drag=null;savePlan();}}));
    $('jointDeviceName').onchange=()=>{s.name=$('jointDeviceName').value.trim().slice(0,40)||'Mi móvil';broadcast({type:'HELLO',id:s.id,name:s.name,status:localStatus()});renderDevices();renderPlan();};
    $('jointEnableSensor').onclick=guard(enableSensor);
    $('jointSync').onclick=guard(async()=>{for(const p of s.peers.values())startSync(p);tell('Estimando desfases mediante nuevos intercambios de mensajes…');});
    $('jointStart').onclick=guard(startRun);$('jointStop').onclick=()=>stopRun();
    $('jointDownload').onclick=guard(exportSession);$('jointCsv').onclick=guard(exportCsv);$('jointSendData').onclick=guard(sendRecord);$('jointRecover').onclick=guard(recover);
    $('jointNewRun').onclick=guard(()=>{
        if(running()||s.transfer)throw Error('Espera a que termine la medida y la transferencia.');
        if(s.run&&!confirm('Descarga antes los resultados. ¿Preparar un nuevo ensayo? El registro local seguirá guardado en este navegador.'))return;
        s.run=null;s.results.clear();$('jointProgress').value=0;$('jointMeasureState').textContent='Preparando dispositivos';renderPlan();renderDevices();tab('Devices');
    });
    document.addEventListener('visibilitychange',()=>{if(running()){incident('visibility',document.hidden?'Página oculta: puede haber huecos de adquisición.':'Página visible de nuevo.');if(!document.hidden)requestWake();}});
    window.addEventListener('beforeunload',e=>{if(running()||s.transfer){e.preventDefault();e.returnValue='';}});
    setInterval(tick,250);
    if(location.hash.startsWith('#joint=')) {
        guard(()=>{open();openPair();$('jointPairInput').value=location.href;$('jointPairStatus').textContent='Invitación cargada. Pulsa Leer código para continuar.';history.replaceState(null,'',location.pathname+location.search);})();
    }
})();
