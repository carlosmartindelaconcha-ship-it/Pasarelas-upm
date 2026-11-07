/* =========================================================
   PASARELAS UPM
   ========================================================= */


/* =========================================================
   1. CONFIGURACIÓN
   ========================================================= */

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
   22. ELEGIR EL SENSOR COMÚN
   ========================================================= */

async function startBestAvailableSensor() {
    // Una única ruta en iOS y Android: evita mezclar APIs que no entregan
    // necesariamente la misma magnitud ni la misma cadena de filtrado.
    console.log("DeviceMotionEvent → ruta común iOS/Android");
    return startDeviceMotionSensor();
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

            requestedFrequency: null,

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
    const VERSION = 4;
    // Only these app-owned endpoints are used; invitation codes cannot inject servers.
    const STUN_SERVERS = [{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
    const MAX_PEERS = 8, MAX_POINTS = 64, MAX_SAMPLES = 500000, MAX_SYNC_SAMPLES = 25000;
    const MAX_TOKEN = 50000, MAX_MESSAGE = 90000, QR_CHUNK_SIZE = 175, MAX_QR_PAGES = 256;
    const activeStates = new Set(['preparing', 'armed', 'recording']);
    const uid = () => {
        if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
        const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
        return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    };
    const now = () => performance.now();
    const finite = Number.isFinite;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const s = {
        id: uid(), name: 'Mi móvil', role: null, session: null, peers: new Map(),
        plan: {length:30, width:3, name:'Ensayo multipunto', points:[]}, selected:null,
        sensor:false, sensorEnabled:false, sensorSource:'', lastSample:0, recent:[], rateTimes:[],
        calibration:{map:{},active:null,complete:false},
        run:null, pending:null, results:new Map(), preview:[], transfer:null,
        scan:null, scanFrame:null, currentInvite:null, pairBusy:false, capturePermission:false,
        pendingOffer:null, qrPages:[], qrPageIndex:0, qrPageTimer:null, qrInbound:null,
        lastPairDiagnostic:'', adding:false, drag:null, planView:null, planPan:null, planPointers:new Map(), planPinch:null,
        syncModel:{offset:0, drift:0, reference:0, rtt:null, count:0, updated:0},
        syncLog:[], incidents:[], db:null, writeChain:Promise.resolve(), persistedCount:0,
        storageFailed:false, uiTick:0, wake:null, returnTo:null, transaction:null,
        compareExport:null, compareCharts:[], jointCharts:{time:null,spectrum:null},
        syncCharts:[], syncView:{bins:12,focus:{}},
        syncCalibration:{phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0},
        duringSyncTimer:null
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
        for (const n of ['Plan','Devices','Sync','Measure','Results','Compare']) {
            $('jointPanel'+n).hidden=n!==name; $('jointTab'+n).setAttribute('aria-selected',String(n===name));
        }
        if(name==='Compare') renderComparison();
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
    function planViewport(candidate=s.planView) {
        const base=candidate||{x:0,y:0,w:s.plan.length,h:s.plan.width};
        const minW=Math.min(1,s.plan.length),minH=Math.min(1,s.plan.width),w=Math.max(minW,Math.min(s.plan.length,base.w)),h=Math.max(minH,Math.min(s.plan.width,base.h));
        return {x:Math.max(0,Math.min(s.plan.length-w,base.x)),y:Math.max(0,Math.min(s.plan.width-h,base.y)),w,h};
    }
    function geometry(view=planViewport()) {
        // Márgenes reservados para ejes y etiquetas; escala idéntica en X/Y.
        const scale=Math.min(680/view.w,300/view.h),w=view.w*scale,h=view.h*scale;
        return {view,scale,left:74+(680-w)/2,top:32+(300-h)/2,w,h};
    }
    function niceMetricStep(minimum) {
        const power=10**Math.floor(Math.log10(Math.max(1,minimum))),scaled=minimum/power;
        return (scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*power;
    }
    function planGridStep(g) {return Math.max(1,niceMetricStep(5/g.scale));}
    function planLabelStep(g) {return niceMetricStep(76/g.scale);}
    function snapPlanPosition(position) {return {x:Math.max(0,Math.min(s.plan.length,Math.round(position.x))),y:Math.max(0,Math.min(s.plan.width,Math.round(position.y)))};}
    function resetPlanView() {s.planView=null;s.planPan=null;s.planPinch=null;renderPlan();}
    function renderPlan() {
        const edit=s.role==='host'&&!running()&&!s.transaction;
        $('jointGeometry').disabled=!edit; $('jointPointEditor').disabled=!edit;
        $('jointPlanTools').hidden=s.role!=='host';
        for(const id of ['jointAddPoint','jointAddPointTable','jointRemovePoint','jointImportPlan','jointResetView']) $(id).disabled=!edit;
        if(document.activeElement!==$('jointName'))$('jointName').value=s.plan.name;
        if(document.activeElement!==$('jointLength'))$('jointLength').value=s.plan.length;
        if(document.activeElement!==$('jointWidth'))$('jointWidth').value=s.plan.width;
        const view=planViewport(),g=geometry(view),selected=s.plan.points.find(p=>p.id===s.selected),gridStep=planGridStep(g),labelStep=planLabelStep(g);
        let svg=`<title>Planta de ${escape(s.plan.name)}</title><defs><clipPath id="jointPlanClip"><rect x="${g.left}" y="${g.top}" width="${g.w}" height="${g.h}" rx="4"/></clipPath></defs><rect x="${g.left}" y="${g.top}" width="${g.w}" height="${g.h}" rx="4" fill="#edf4f9" stroke="#698ba6" stroke-width="2"/>`;
        const firstX=Math.ceil(view.x/gridStep)*gridStep,lastX=Math.floor((view.x+view.w)/gridStep)*gridStep,firstY=Math.ceil(view.y/gridStep)*gridStep,lastY=Math.floor((view.y+view.h)/gridStep)*gridStep;
        for(let x=firstX;x<=lastX;x+=gridStep){const sx=g.left+(x-view.x)*g.scale,label=x%labelStep===0;svg+=`<line x1="${sx}" y1="${g.top}" x2="${sx}" y2="${g.top+g.h}" stroke="#aec6d8" stroke-width="1.1"/>`;if(label)svg+=`<line x1="${sx}" y1="${g.top+g.h}" x2="${sx}" y2="${g.top+g.h+6}" stroke="#698ba6"/><text class="joint-plan-tick" x="${sx}" y="${g.top+g.h+21}" text-anchor="middle">${x}</text>`;}
        for(let y=firstY;y<=lastY;y+=gridStep){const sy=g.top+(view.y+view.h-y)*g.scale,label=y%labelStep===0;svg+=`<line x1="${g.left}" y1="${sy}" x2="${g.left+g.w}" y2="${sy}" stroke="#aec6d8" stroke-width="1.1"/>`;if(label)svg+=`<line x1="${g.left-6}" y1="${sy}" x2="${g.left}" y2="${sy}" stroke="#698ba6"/><text class="joint-plan-tick" x="${g.left-11}" y="${sy+4}" text-anchor="end">${y}</text>`;}
        svg+=`<text class="joint-plan-axis" x="400" y="${g.top+g.h+48}" text-anchor="middle">X (m)</text><text class="joint-plan-axis" x="${g.left}" y="${g.top-12}">Y (m)</text><g clip-path="url(#jointPlanClip)">`;
        for(const p of s.plan.points) {
            const x=g.left+(p.x-view.x)*g.scale,y=g.top+(view.y+view.h-p.y)*g.scale;
            const color=p.device===s.id?'#087cc3':p.device?'#00897b':'#788c9e';
            svg+=`<g class="joint-point ${p.id===s.selected?'selected':''}" data-point="${escape(p.id)}" tabindex="0" role="button" aria-label="${escape(p.name)}, X ${p.x}, Y ${p.y}"><title>${escape(p.name)} · ${p.device?escape(deviceName(p.device)):'Sin asignar'}</title><circle cx="${x}" cy="${y}" r="12" fill="${color}" stroke="white" stroke-width="2"/><path d="M ${x} ${y-5} l 0 -16 m -4 5 l 4 -5 l 4 5" fill="none" stroke="${color}" stroke-width="2" transform="rotate(${-p.angle} ${x} ${y})"/>${g.scale>=32?`<text x="${x}" y="${y+29}" text-anchor="middle">${escape(p.name)}</text>`:""}</g>`;
        } svg+='</g>';
        $('jointPlan').innerHTML=svg;
        $('jointPlanHelp').textContent=s.adding?'Toca dentro del rectángulo para colocar un punto en la rejilla de 1 m.':s.role==='host'?'Arrastra una zona libre para desplazar X/Y; rueda o pellizca para ampliar. Los puntos creados y arrastrados se ajustan a 1 m.':'El maestro edita el plano. Tu punto aparece en azul. Comprueba posición, eje y orientación.';
        $('jointPointEditor').hidden=true;
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
        const assignedDevices=[{id:s.id,name:s.name},...s.peers.values()].filter(d=>d.name);
        $('jointPointsTable').innerHTML=s.plan.points.map((p,i)=>{
            const disabled=edit?'':'disabled';
            const input=(field,value,max)=>`<input data-point-id="${escape(p.id)}" data-point-field="${field}" aria-label="${field} de P${i+1}" type="number" inputmode="numeric" step="1" min="0" max="${max}" value="${value}" ${disabled}>`;
            const options=(items,current)=>items.map(item=>`<option value="${escape(item.value)}" ${item.value===current?'selected':''}>${escape(item.label)}</option>`).join('');
            const axes=options(['x','y','z'].map(v=>({value:v,label:v.toUpperCase()})),p.axis);
            const devices=options([{value:'',label:'Sin asignar'},...assignedDevices.map(d=>({value:d.id,label:d.name}))],p.device||'');
            return `<tr data-row-point="${escape(p.id)}" class="${p.id===s.selected?'joint-row-selected':''}"><td data-label="Punto"><button type="button" data-select-point="${escape(p.id)}" class="joint-secondary">${escape(p.name)}</button></td><td data-label="X (m)">${input('x',p.x,s.plan.length)}</td><td data-label="Y (m)">${input('y',p.y,s.plan.width)}</td><td data-label="Eje"><select data-point-id="${escape(p.id)}" data-point-field="axis" ${disabled}>${axes}</select></td><td data-label="Giro (°)"><input data-point-id="${escape(p.id)}" data-point-field="angle" aria-label="Giro de ${escape(p.name)}" type="number" inputmode="numeric" step="1" min="-360" max="360" value="${p.angle}" ${disabled}></td><td data-label="Móvil"><select data-point-id="${escape(p.id)}" data-point-field="device" ${disabled}>${devices}</select></td><td data-label="Eliminar"><button type="button" data-delete-point="${escape(p.id)}" class="joint-delete-row" ${disabled} aria-label="Eliminar ${escape(p.name)}"><span aria-hidden="true">🗑</span></button></td></tr>`;
        }).join('');
        $('jointMyPoint').textContent=pointFor()?.name||'Sin asignar';
    }
    function svgPosition(e) {
        const svg=$('jointPlan'), matrix=svg.getScreenCTM(); if(!matrix) return null;
        const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),g=geometry();
        const view=planViewport();return {x:view.x+(q.x-g.left)/g.scale,y:view.y+view.h-(q.y-g.top)/g.scale};
    }
    function zoomPlanAt(position,factor,base=planViewport()) {
        const w=base.w*factor,h=base.h*factor;
        s.planView=planViewport({x:position.x-(position.x-base.x)*(w/base.w),y:position.y-(position.y-base.y)*(h/base.h),w,h});
    }
    function addPoint(x=s.plan.length/2,y=s.plan.width/2) {
        requireHostEdit(); if(s.plan.points.length>=MAX_POINTS) throw Error('Máximo 64 puntos por plano.');
        let n=1; while(s.plan.points.some(p=>p.id==='P'+n)) n++;
        const snapped=snapPlanPosition({x,y}),p={id:'P'+n,name:'P'+(s.plan.points.length+1),x:snapped.x,y:snapped.y,angle:0,axis:'z',device:null};
        s.plan.points.push(p); s.selected=p.id; s.adding=false; savePlan();
    }
    function localStatus() {return {id:s.id,name:s.name,sensor:s.sensor && now()-s.lastSample<2000,rate:sampleRate(),visible:document.visibilityState==='visible',point:pointFor()?.id||null,state:s.run?.state||'idle',calibrated:s.calibration.complete};}
    function sampleRate() {const a=s.rateTimes; return a.length>2?(a.length-1)*1000/(a[a.length-1]-a[0]):0;}
    function renderDevices() {
        const local=localStatus();
        let html=`<article class="joint-device-card"><strong>${escape(s.name)} · ${s.role==='host'?'Maestro':'Este móvil'}</strong><p>${local.sensor?'Sensor activo':'Sensor sin datos recientes'} · ${local.rate?local.rate.toFixed(1)+' Hz':'— Hz'} · ${escape(pointFor()?.name||'Sin punto asignado')}</p><small>${local.calibrated?'Ejes calibrados':'Calibración de ejes pendiente'} · ${local.visible?'Página visible':'Página oculta'}</small></article>`;
        for(const p of s.peers.values()) {
            const st=p.status||{},m=p.model;
            html+=`<article class="joint-device-card"><strong>${escape(p.name||'Conectando…')}</strong><p>${p.channel?.readyState==='open'?'Conectado':'Desconectado'} · ${st.sensor?'Sensor activo':'Sensor sin confirmar'} · ${finite(st.rate)?st.rate.toFixed(1)+' Hz':'— Hz'}</p><p>${escape(pointFor(p.id)?.name||'Sin punto asignado')} · ${escape(p.route||'Ruta pendiente de comprobar')}</p><small>${st.calibrated?'Ejes calibrados':'Calibración pendiente'} · ${m?.count?'RTT mínimo: '+m.rtt.toFixed(2)+' ms · desfase estimado: '+m.offset.toFixed(2)+' ms · '+m.count+' intercambios':'Relojes pendientes de estimación'}</small></article>`;
        }
        if(s.role==='guest'&&s.syncModel.count) html+=`<p class="joint-help">Mi reloj respecto al maestro: ${s.syncModel.offset.toFixed(2)} ms (estimado). RTT mínimo: ${s.syncModel.rtt.toFixed(2)} ms.</p>`;
        $('jointDevices').innerHTML=html;
        $('jointStart').hidden=s.role!=='host'; $('jointSync').hidden=s.role!=='host';
        $('jointStart').disabled=!!running()||!!s.transaction||!s.syncCalibration.accepted;
        $('jointDuration').disabled=s.role!=='host'||!!running()||!!s.transaction;
        $('jointEnableSensor').disabled=s.sensorEnabled;
        $('jointStop').disabled=!running()&&!s.transaction;
        $('jointPair').disabled=!!running()||!!s.transaction;
        renderSyncCalibration();
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
    function stopQrCycle() {
        clearInterval(s.qrPageTimer);s.qrPageTimer=null;s.qrPages=[];s.qrPageIndex=0;
    }
    function qrTransferPages(code) {
        const transfer=uid().replace(/-/g,'').slice(0,12),pages=[];
        for(let index=0;index<code.length;index+=QR_CHUNK_SIZE)pages.push(code.slice(index,index+QR_CHUNK_SIZE));
        if(!pages.length||pages.length>MAX_QR_PAGES)throw Error('El código de conexión es demasiado grande para compartirlo por QR. Usa Copiar código.');
        return pages.map((chunk,index)=>'JQ1.'+transfer+'.'+(index+1)+'.'+pages.length+'.'+chunk);
    }
    function renderQrPage() {
        const pages=s.qrPages;if(!pages.length)return;
        const page=pages[s.qrPageIndex];$('jointQr').replaceChildren();
        if(typeof qrcode!=='function'){$('jointQr').textContent='El generador QR no se ha cargado. Utiliza Copiar código.';return;}
        try {
            const qr=qrcode(0,'L');qr.addData(page);qr.make();
            $('jointQr').innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true})+'<p class="joint-help">QR '+(s.qrPageIndex+1)+' de '+pages.length+' · mantén la cámara enfocada hasta completar todos.</p>';
        } catch(e) {$('jointQr').textContent='No se pudo crear esta página QR. Utiliza Copiar código.';}
    }
    function acceptQrPage(raw) {
        const value=String(raw||'').trim();
        const match=value.match(/^JQ1\.([a-f0-9]{12})\.(\d{1,3})\.(\d{1,3})\.([.\w-]+)$/i);
        if(!match)return value;
        const [,transfer,indexText,totalText,chunk]=match,index=Number(indexText),total=Number(totalText);
        if(!Number.isInteger(index)||!Number.isInteger(total)||total<1||total>MAX_QR_PAGES||index<1||index>total||chunk.length>QR_CHUNK_SIZE)throw Error('Página QR de conexión no válida.');
        if(!s.qrInbound||s.qrInbound.transfer!==transfer||s.qrInbound.total!==total)s.qrInbound={transfer,total,pages:Array(total)};
        s.qrInbound.pages[index-1]=chunk;
        const received=s.qrInbound.pages.filter(Boolean).length;
        $('jointPairStatus').textContent='QR recibido: '+received+' de '+total+' páginas.';
        if(received!==total)return null;
        const complete=s.qrInbound.pages.join('');s.qrInbound=null;return complete;
    }
    async function showToken(payload) {
        const code=await encodeToken(payload);
        const link=payload.kind==='offer'?location.href.split('#')[0]+'#joint='+code:code;
        $('jointPairOutput').value=link; $('jointPairOutput').hidden=false; $('jointCopyCode').hidden=false;
        stopQrCycle();s.qrPages=qrTransferPages(code);renderQrPage();
        if(s.qrPages.length>1)s.qrPageTimer=setInterval(()=>{s.qrPageIndex=(s.qrPageIndex+1)%s.qrPages.length;renderQrPage();},1800);
    }
    function openPair(mode='join') {
        $('jointPairTitle').textContent=mode==='offer'?'Invitar a un móvil':'Leer invitación o respuesta';
        $('jointPairHelp').textContent=mode==='offer'?'El participante lee esta invitación. Después, lee aquí su respuesta para completar la conexión.':'Escanea el QR o pega el código completo del otro móvil.';
        stopQrCycle();$('jointPairOutput').hidden=true; $('jointCopyCode').hidden=true; $('jointQr').replaceChildren(); $('jointPairInput').value=''; $('jointPairStatus').textContent='';
        $('jointGenerateAnswer').hidden=true;
        $('jointPairDiagnostics').hidden=true;$('jointPairDiagnosticsText').textContent='';
        $('jointNetworkMode').disabled=s.role==='guest';
        updateAndroidNearbyNotice();
        if(!$('jointPairDialog').open)$('jointPairDialog').showModal();
    }
    function browserLabel() {
        const ua=navigator.userAgent||'';
        if(/iPhone|iPad|iPod/.test(ua))return 'Safari/WebKit en iPhone o iPad';
        if(/Android/.test(ua)&&/Chrome\//.test(ua))return 'Chrome en Android';
        if(/Edg\//.test(ua))return 'Microsoft Edge en ordenador';
        if(/Firefox\//.test(ua))return 'Firefox en ordenador';
        if(/Chrome\//.test(ua))return 'Chrome en ordenador';
        if(/Safari\//.test(ua)&&!/Chrome\//.test(ua))return 'Safari/WebKit';
        return 'Navegador no identificado';
    }
    function isAndroidChrome() {
        const ua=navigator.userAgent||'';
        return /Android/.test(ua)&&/Chrome\//.test(ua)&&!/EdgA\//.test(ua)&&!/OPR\//.test(ua);
    }
    function updateAndroidNearbyNotice() {
        const notice=$('jointAndroidNearbyNotice');
        if(notice)notice.hidden=!isAndroidChrome();
    }
    function diagnosticEvent(p,event,detail='') {
        if(!p)return;
        if(!p.diagnostics)p.diagnostics=[];
        p.diagnostics.push({ms:Math.max(0,Math.round(now()-(p.createdAt||now()))),event:String(event),detail:String(detail).slice(0,240)});
        if(p.diagnostics.length>80)p.diagnostics.shift();
    }
    function diagnosticText(p,stage,error='') {
        const stunErrors=(p?.diagnostics||[]).filter(row=>row.event==='error STUN');
        const explanation=stunErrors.some(row=>/^701\b/.test(row.detail))?'El código 701 significa que este móvil no pudo alcanzar el servidor STUN.':'';
        const lines=[
            'Diagnóstico de conexión v4',
            'Etapa: '+stage,
            'Navegador: '+browserLabel(),
            'Modo: '+(p?.network||$('jointNetworkMode').value),
            'Permiso de cámara concedido en esta sesión: '+(s.capturePermission?'sí':'no o desconocido'),
            'Estado: '+(p?(p.failureDetails||pairingDetails(p)):'sin conexión creada'),
            ...(p?['Candidatos propios:',...candidateDetails(p.pc.localDescription).map(row=>'· '+row),'Candidatos del otro extremo:',...candidateDetails(p.pc.remoteDescription).map(row=>'· '+row)]:[]),
            error?'Error: '+error:'',
            explanation,
            ...(p?.iceStats?.pairs?.length?['', 'Pares ICE · última instantánea ('+p.iceStats.label+'):', ...p.iceStats.pairs.map(row=>'· '+row)]:[]),
            ...(p?.iceStats?.note?['', 'Pares ICE: '+p.iceStats.note]:[]),
            '',
            'Eventos:',
            ...(p?.diagnostics||[]).map(row=>'+'+row.ms+' ms · '+row.event+(row.detail?' · '+row.detail:''))
        ];
        return lines.filter((line,index)=>line||index>=8).join('\n').trim();
    }
    function showPairDiagnostic(p,stage,error='') {
        const value=diagnosticText(p,stage,error);s.lastPairDiagnostic=value;
        $('jointPairDiagnosticsText').textContent=value;$('jointPairDiagnostics').hidden=false;
        return value;
    }
    function pairingError(p,stage,message) {
        showPairDiagnostic(p,stage,message);
        const error=Error(message);error.pairDiagnostic=true;return error;
    }
    async function gather(pc) {
        const p=pc.__jointPeer;diagnosticEvent(p,'búsqueda ICE',pc.iceGatheringState);
        if(pc.iceGatheringState==='complete'){diagnosticEvent(p,'búsqueda ICE terminada',candidateSummary(pc.localDescription));return true;}
        return await new Promise((resolve,reject)=>{
            let settled=false;
            const finish=(value,error)=>{
                if(settled)return;settled=true;clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange',stateListener);
                pc.removeEventListener('icecandidate',candidateListener);
                if(error)reject(error);else resolve(value);
            };
            const enough=()=>{
                const sdp=pc.localDescription?.sdp||'';
                const srflx=/^a=candidate:.* typ srflx(?: |\r?$)/m.test(sdp);
                return p?.network==='stun'&&srflx;
            };
            const timer=setTimeout(()=>{
                if(p?.network==='local'){
                    finish(false,pairingError(p,'búsqueda de direcciones','La búsqueda de direcciones locales no terminó en 15 segundos. Se descarta este intento para no crear un QR incompleto. Reinicia el emparejamiento.'));
                    return;
                }
                // An unreachable STUN server must not discard usable local candidates.
                if(/^a=candidate:/m.test(pc.localDescription?.sdp||'')){
                    diagnosticEvent(p,'límite de 20 s',candidateSummary(pc.localDescription));finish(false);
                }else finish(false,pairingError(p,'búsqueda de direcciones','No se han encontrado direcciones de conexión. Abre el diagnóstico para comprobar si Safari ha filtrado las direcciones o si STUN ha devuelto un error.'));
            },p?.network==='local'?15000:20000);
            function stateListener(){
                diagnosticEvent(p,'estado de búsqueda ICE',pc.iceGatheringState);
                if(pc.iceGatheringState==='complete'){
                    if(p?.network==='local'&&!/^a=candidate:.* typ host(?: |\r?$)/m.test(pc.localDescription?.sdp||''))finish(false,pairingError(p,'búsqueda de direcciones','La búsqueda local terminó sin direcciones host utilizables. Reinicia el emparejamiento.'));
                    else {diagnosticEvent(p,'búsqueda ICE terminada',candidateSummary(pc.localDescription));finish(true);}
                }
            }
            function candidateListener(e){
                if(e.candidate&&enough()){
                    diagnosticEvent(p,'candidatos suficientes para el código',candidateSummary(pc.localDescription));finish(false);
                }
            }
            pc.addEventListener('icegatheringstatechange',stateListener);
            pc.addEventListener('icecandidate',candidateListener);stateListener();
        });
    }
    function candidateSummary(description) {
        const rows=(description?.sdp||'').split(/\r?\n/).filter(l=>l.startsWith('a=candidate:'));
        const host=rows.filter(l=>/ typ host(?: |$)/.test(l));
        const mdns=host.filter(l=>/\.local(?: |$)/i.test(l)).length;
        const srflx=rows.filter(l=>/ typ srflx(?: |$)/.test(l)).length;
        return 'locales '+host.length+' (mDNS '+mdns+'), STUN '+srflx;
    }
    function parsedCandidates(description) {
        return (description?.sdp||'').split(/\r?\n/).filter(line=>line.startsWith('a=candidate:')).map(line=>{
            const match=line.match(/^a=candidate:\S+\s+\d+\s+(\S+)\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)(?:.*?\stcptype\s+(\S+))?/i);
            return match?{protocol:String(match[1]).toUpperCase(),address:String(match[2]),port:String(match[3]),type:String(match[4]).toLowerCase(),tcpType:String(match[5]||'').toLowerCase()}:null;
        }).filter(Boolean);
    }
    function candidateEndpoint(candidate) {
        const address=String(candidate?.address||candidate?.ip||'?'),port=candidate?.port??'?';
        return address.includes(':')?'['+address+']:'+port:address+':'+port;
    }
    function candidateLabel(candidate, fallbacks=[]) {
        if(!candidate)return 'sin candidato';
        const port=String(candidate.port??'');
        const protocol=String(candidate.protocol||'').toLowerCase();
        const type=String(candidate.candidateType||candidate.type||'').toLowerCase();
        const fallback=fallbacks.find(row=>String(row.port)===port&&String(row.protocol||'').toLowerCase()===protocol&&(!type||row.type===type));
        const display=(String(candidate.address||candidate.ip||'')&&String(candidate.address||candidate.ip||'')!=='?')?candidate:(fallback?{...candidate,address:fallback.address,port:fallback.port,type:fallback.type,tcpType:candidate.tcpType||fallback.tcpType}:candidate);
        return [String(display.protocol||'?').toUpperCase(),String(display.candidateType||display.type||'?').toLowerCase(),candidateEndpoint(display),display.tcpType].filter(Boolean).join(' · ');
    }
    function candidateDetails(description) {
        const rows=parsedCandidates(description);return rows.length?rows.map(row=>candidateLabel(row)):['ninguno'];
    }
    function icePairSnapshot(stats, localDescription, remoteDescription) {
        const reports=new Map();stats.forEach(report=>reports.set(report.id,report));
        const localFallbacks=parsedCandidates(localDescription),remoteFallbacks=parsedCandidates(remoteDescription);
        const rank={succeeded:0,'in-progress':1,inprogress:1,waiting:2,frozen:3,failed:4};
        const pairs=[];
        stats.forEach(report=>{
            if(report.type!=='candidate-pair')return;
            const state=String(report.state||'desconocido'),local=reports.get(report.localCandidateId),remote=reports.get(report.remoteCandidateId);
            const sent=Number.isFinite(report.requestsSent)?report.requestsSent:'—',received=Number.isFinite(report.responsesReceived)?report.responsesReceived:'—';
            pairs.push({rank:rank[state]??5,text:state+(report.nominated?' · nominada':'')+' · '+candidateLabel(local,localFallbacks)+' → '+candidateLabel(remote,remoteFallbacks)+' · comprobaciones '+sent+' / respuestas '+received});
        });
        return pairs.sort((a,b)=>a.rank-b.rank).slice(0,16).map(pair=>pair.text);
    }
    async function captureIceStats(p,label) {
        if(!p?.pc?.getStats||p.iceStatsPending)return;
        p.iceStatsPending=true;
        try {
            const pairs=icePairSnapshot(await p.pc.getStats(),p.pc.localDescription,p.pc.remoteDescription);
            // Algunos navegadores vacían getStats() al cerrar RTCPeerConnection.
            // Conservamos la última instantánea útil: es la que explica el fallo.
            if(pairs.length||!p.iceStats?.pairs?.length){
                p.iceStats={label,pairs,note:pairs.length?'':'El navegador no expuso parejas ICE todavía.'};
            }else{
                p.iceStats={...p.iceStats,note:'La consulta final ya no expuso parejas ICE; se conserva la última instantánea útil ('+p.iceStats.label+').'};
            }
            diagnosticEvent(p,'instantánea de pares ICE',label+' · '+pairs.length+' parejas');
        } catch(error) {p.iceStats={label,pairs:[],note:'No se pudieron consultar las parejas ICE: '+String(error?.name||'error')};}
        finally {
            p.iceStatsPending=false;
            if(p.pairFailed)showPairDiagnostic(p,p.failureStage||'apertura del canal',p.failureMessage||'');
        }
    }
    function scheduleIceStats(p) {
        if(p.iceStatsTimers)return;
        p.iceStatsTimers=[300,1200,3500,8000,14000].map(delay=>setTimeout(()=>{
            if(s.peers.get(p.id)===p&&!p.pairFailed&&!p.opened)captureIceStats(p,'muestra '+(delay/1000)+' s');
        },delay));
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
        (p.iceStatsTimers||[]).forEach(clearTimeout);p.iceStatsTimers=null;
        p.pc.onconnectionstatechange=null;p.pc.oniceconnectionstatechange=null;
        p.pc.onicegatheringstatechange=null;p.pc.onsignalingstatechange=null;
        p.pc.onicecandidate=null;p.pc.onicecandidateerror=null;p.pc.ondatachannel=null;
        if(p.channel){p.channel.onopen=null;p.channel.onclose=null;p.channel.onerror=null;}
        p.pc.close();
    }
    function failPair(p, reason) {
        if(s.peers.get(p.id)!==p||p.pairFailed||p.opened)return;
        const next=p.network==='local'?'Prueba el modo Compatibilidad con punto de acceso (STUN), con Internet disponible.':'Si utilizas un punto de acceso, prueba ambos móviles en un router Wi-Fi común para comparar. STUN no puede superar todos los bloqueos; esta versión no dispone de retransmisión TURN.';
        p.failureDetails=pairingDetails(p);
        const message=reason+' ('+p.failureDetails+'). '+next+' Mantén ambas páginas abiertas. Pulsa Reiniciar emparejamiento y vuelve a intercambiar los dos códigos.';
        p.failureStage='apertura del canal';p.failureMessage=message;
        captureIceStats(p,'fallo');diagnosticEvent(p,'conexión fallida',reason);showPairDiagnostic(p,p.failureStage,message);
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
            throw pairingError(p,'preparación del código de respuesta','El navegador no ha proporcionado direcciones utilizables. Abre el diagnóstico. En Safari puede ayudar pulsar «Preparar Safari/iPhone» antes de leer de nuevo la invitación.');
        return {type:description.type,sdp:description.sdp};
    }
    async function prepareSafariConnection() {
        if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no permite solicitar acceso a la cámara.');
        $('jointPairStatus').textContent='Solicitando permiso de cámara…';
        let stream;
        try {
            stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});s.capturePermission=true;
            $('jointPairStatus').textContent='Cámara autorizada y detenida. No se está grabando. Lee ahora una invitación nueva.';
        }catch(e){
            const message=e?.name==='NotAllowedError'?'No se ha concedido el permiso de cámara. Safari puede seguir filtrando las direcciones locales.':'No se pudo preparar Safari: '+(e.message||e);
            $('jointPairStatus').textContent=message;throw Error(message);
        }finally{if(stream)stream.getTracks().forEach(track=>track.stop());}
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
        s.currentInvite=null;s.pendingOffer=null;$('jointGenerateAnswer').hidden=true;
        if(s.role==='host'){savePlan();return pairingAction(invite);}
        if(s.peers.size)throw Error('La conexión ya está abierta. Cierra este cuadro para continuar.');
        s.role=null;s.session=null;s.id=uid();
        $('jointLanding').hidden=false;$('jointWorkspace').hidden=true;
        openPair();$('jointPairStatus').textContent='Pide al maestro una invitación nueva. No reutilices la respuesta anterior.';
    }
    function wirePeer(p) {
        const changed=()=>{
            if(s.peers.get(p.id)!==p||p.pairFailed)return;
            diagnosticEvent(p,'estado de conexión','ICE '+p.pc.iceConnectionState+'; enlace '+p.pc.connectionState);
            if(['checking','failed','disconnected'].includes(p.pc.iceConnectionState)||['connecting','failed'].includes(p.pc.connectionState))captureIceStats(p,'estado '+p.pc.iceConnectionState+'/'+p.pc.connectionState);
            if(p.pc.connectionState==='failed'||p.pc.iceConnectionState==='failed'){
                if(s.role==='guest'&&!p.opened){
                    if(p.answerShown)failPair(p,'La conexión local ha fallado antes de abrir el canal. La respuesta no se regenerará automáticamente: crea una invitación nueva para evitar que el maestro lea un código antiguo.');
                    else {diagnosticEvent(p,'fallo ICE aplazado','la respuesta todavía se está preparando');pairStatus(p,'Preparando respuesta; todavía no cierres esta página.');}
                }else failPair(p,'La conexión directa ha fallado');
            }
            else if(!p.opened&&p.answerAccepted)pairStatus(p,'Estableciendo conexión… '+pairingDetails(p));
            if(['disconnected','failed','closed'].includes(p.pc.connectionState)) {
                if(s.run) incident('connection',p.name+': '+p.pc.connectionState);
            }
            renderDevices();
        };
        p.pc.onconnectionstatechange=changed;p.pc.oniceconnectionstatechange=changed;
        p.pc.onicegatheringstatechange=()=>diagnosticEvent(p,'estado ICE',p.pc.iceGatheringState);
        p.pc.onsignalingstatechange=()=>diagnosticEvent(p,'señalización',p.pc.signalingState);
        p.pc.onicecandidate=e=>{
            if(!e.candidate){diagnosticEvent(p,'fin de candidatos');return;}
            const line=e.candidate.candidate||'',type=e.candidate.type||line.match(/ typ (\w+)/)?.[1]||'desconocido';
            const protocol=e.candidate.protocol||line.split(' ')[2]||'protocolo desconocido';
            diagnosticEvent(p,'candidato',type+' · '+protocol);
        };
        p.pc.onicecandidateerror=e=>{
            const code=Number(e.errorCode)||0;
            const meaning=code===701?'no se pudo alcanzar el servidor STUN':String(e.errorText||'error de servidor ICE');
            diagnosticEvent(p,'error STUN',code+' · '+meaning);
            showPairDiagnostic(p,'búsqueda de direcciones',meaning);
        };
        p.pc.ondatachannel=e=>wireChannel(p,e.channel);
    }
    function newPeer(id, network=$('jointNetworkMode').value) {
        if(typeof RTCPeerConnection==='undefined') throw Error('WebRTC no está disponible en este navegador.');
        if(!['local','stun'].includes(network))throw Error('Selecciona un modo de conexión válido.');
        const pc=new RTCPeerConnection({iceServers:network==='stun'?STUN_SERVERS:[]});
        const p={id,network,name:'Móvil '+(s.peers.size+1),pc,createdAt:now(),diagnostics:[],requests:new Map(),samples:[],status:null,model:null,route:null,lastSeen:now(),incoming:null,acks:new Map()};
        pc.__jointPeer=p;diagnosticEvent(p,'conexión creada',network);
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
            p.opened=true;clearTimeout(p.pairTimer);p.pairTimer=null;diagnosticEvent(p,'canal de datos','abierto');
            s.pendingOffer=null;$('jointGenerateAnswer').hidden=true;stopQrCycle();
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
        }catch(e){if(!e.pairDiagnostic)showPairDiagnostic(p,'creación de invitación',e.message||String(e));disposePeer(p);s.peers.delete(p.id);throw e;}
    }
    async function createGuestAnswer() {
        const t=s.pendingOffer;
        if(s.role!=='guest'||!t)throw Error('Primero lee una invitación del maestro.');
        for(const [id,old] of s.peers){if(old.channel?.readyState!=='open'){disposePeer(old);s.peers.delete(id);}}
        const p=newPeer(t.host,t.network);p.name=String(t.name||'Maestro').slice(0,40);
        $('jointGenerateAnswer').disabled=true;$('jointGenerateAnswer').hidden=true;
        $('jointPairOutput').hidden=true;$('jointCopyCode').hidden=true;$('jointQr').replaceChildren();
        try {
            pairStatus(p,'Generando respuesta local completa…');
            await p.pc.setRemoteDescription(t.sdp);
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            scheduleIceStats(p);
            p.gatherComplete=await gather(p.pc);
            if(s.peers.get(p.id)!==p||p.pairFailed)return;
            if(['failed','closed'].includes(p.pc.iceConnectionState)||['failed','closed'].includes(p.pc.connectionState)){
                diagnosticEvent(p,'respuesta descartada','ICE falló antes de mostrar el código');
                throw pairingError(p,'creación de respuesta','La conexión ha fallado antes de poder mostrar una respuesta utilizable. Reinicia el emparejamiento.');
            }
            $('jointPairHelp').textContent='Muestra inmediatamente esta respuesta a la cámara que ya está abierta en el maestro. Mantén ambas páginas abiertas.';
            await showToken({v:VERSION,kind:'answer',network:p.network,session:s.session,host:t.host,peer:t.peer,expires:t.expires,sdp:localDescription(p)});
            p.answerShown=true;diagnosticEvent(p,'respuesta mostrada','ICE completo; lista para que la lea el maestro');
            if(!p.opened)pairStatus(p,'Respuesta completa preparada. Muéstrala ahora a la cámara del maestro. Direcciones: '+candidateSummary(p.pc.localDescription)+'.');
            watchPair(p,120000);
        }catch(e){
            if(!e.pairDiagnostic)showPairDiagnostic(p,'creación de respuesta',e.message||String(e));
            if(s.peers.get(p.id)===p){disposePeer(p);s.peers.delete(p.id);}
            throw e;
        }finally{$('jointGenerateAnswer').disabled=false;}
    }
    async function readCode(raw=$('jointPairInput').value) {
        if(running()||s.transaction)throw Error('No se pueden incorporar móviles durante un ensayo.');
        const t=await decodeToken(raw);
        if(t.kind==='offer') {
            if(s.role==='host')throw Error('El maestro debe leer una respuesta, no otra invitación.');
            if(s.peers.size)throw Error('Ya existe una conexión. Sal de la sesión antes de unirte a otra.');
            s.role='guest';s.id=t.peer;s.session=t.session;s.name='Participante';
            $('jointNetworkMode').value=t.network;$('jointNetworkMode').disabled=true;
            s.pendingOffer=t;workspace();
            $('jointPairOutput').hidden=true;$('jointCopyCode').hidden=true;$('jointQr').replaceChildren();
            $('jointPairHelp').textContent='Invitación guardada. Ahora abre «Escanear QR» en el maestro. Cuando su cámara ya muestre imagen, vuelve aquí y pulsa el botón azul.';
            $('jointPairStatus').textContent='Todavía no se ha creado ninguna conexión: así evitamos que la respuesta caduque mientras preparas el otro móvil.';
            $('jointGenerateAnswer').textContent='El maestro ya está escaneando: generar respuesta';$('jointGenerateAnswer').hidden=false;
        } else {
            if(s.role!=='host'||t.session!==s.session||t.host!==s.id)throw Error('Esta respuesta pertenece a otra sesión.');
            const p=s.peers.get(t.peer);if(!p || p.pc.signalingState!=='have-local-offer')throw Error('Invitación no disponible o ya utilizada.');
            if(t.network!==p.network)throw Error('La respuesta usa otro modo de conexión. Genera una invitación nueva.');
            s.currentInvite=p.id;p.answerAccepted=true;watchPair(p);
            try {
                await p.pc.setRemoteDescription(t.sdp);
                scheduleIceStats(p);
                if(!p.opened)pairStatus(p,'Respuesta aceptada. Estableciendo conexión… '+pairingDetails(p));
            }catch(e){failPair(p,'No se pudo aceptar la respuesta: '+e.message);throw e;}
        }
    }
    async function stopScan() {if(s.scanFrame)cancelAnimationFrame(s.scanFrame);s.scanFrame=null;if(s.scan)s.scan.getTracks().forEach(t=>t.stop());s.scan=null;$('jointScanner').srcObject=null;$('jointScanner').hidden=true;$('jointStopScan').hidden=true;}
    async function scanCode() {
        if(typeof jsQR!=='function')throw Error('El lector QR no se ha cargado. Puedes pegar el código.');
        await stopScan();
        s.scan=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});s.capturePermission=true;
        const video=$('jointScanner');video.srcObject=s.scan;video.hidden=false;$('jointStopScan').hidden=false;await video.play();
        if(s.role==='host'&&s.currentInvite){
            const p=s.peers.get(s.currentInvite);if(p)pairStatus(p,'Cámara preparada. En el participante pulsa ahora «El maestro ya está escaneando: generar respuesta».');
        }
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
        const frame=()=>{
            if(!s.scan)return;
            if(video.readyState>=2) {
                const scale=Math.min(1,1000/video.videoWidth);canvas.width=video.videoWidth*scale;canvas.height=video.videoHeight*scale;
                ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(img.data,img.width,img.height);
                if(result){
                    try {
                        const complete=acceptQrPage(result.data);if(complete){$('jointPairInput').value=complete;stopScan();guard(()=>pairingAction(()=>readCode(complete)))();return;}
                    } catch(error) {stopScan();tell(error.message||String(error),true);$('jointPairStatus').textContent=error.message||String(error);return;}
                }
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
        const reference=median(chosen.map(v=>v.local));
        const span=Math.max(...chosen.map(v=>v.local))-Math.min(...chosen.map(v=>v.local));
        const slopes=[];
        if(span>=20000&&chosen.length>=6)for(let i=0;i<chosen.length;i++)for(let j=i+1;j<chosen.length;j++){
            const dt=chosen[j].local-chosen[i].local;if(Math.abs(dt)>=50)slopes.push((chosen[j].offset-chosen[i].offset)/dt);
        }
        const drift=slopes.length?median(slopes):0;
        // Offset at the reference instant. Median makes isolated path asymmetries harmless.
        const offset=median(chosen.map(v=>v.offset-drift*(v.local-reference)));
        // Grossly implausible fits are not used to schedule an acquisition.
        if(!finite(drift)||Math.abs(drift)>.005)return null;
        const residual=Math.sqrt(chosen.reduce((a,v)=>a+(v.offset-offset-drift*(v.local-reference))**2,0)/chosen.length);
        return {reference,offset,drift,rtt:sorted[0].rtt,residual,count:samples.length,selectedCount:chosen.length,rttCutoff:cutoff,rttMedian:median(chosen.map(v=>v.rtt)),span,method:'mediana del 30 % de RTT menor; deriva Theil–Sen',updated:now()};
    }
    const toMaster=(t,m=s.syncModel)=>t-m.offset-m.drift*(t-m.reference);
    const fromMaster=(t,m)=> (t+m.offset-m.drift*m.reference)/(1-m.drift);
    function syncOnce(p,phase='idle',runId=null) {
        if(p.channel?.readyState!=='open')return;
        const id=uid(),t1=now();p.requests.set(id,{time:t1,phase,runId});send(p,{type:'SYNC_REQUEST',id,t1});
        for(const [key,request] of p.requests)if(t1-request.time>10000)p.requests.delete(key);
    }
    async function startSync(p,count=24,spacing=100,phase='connection',runId=null) {
        if(p.syncing&&p.syncPromise)await p.syncPromise;
        p.syncing=true;
        p.syncPromise=(async()=>{
            try {for(let i=0;i<count&&p.channel?.readyState==='open';i++){syncOnce(p,phase,runId);await pause(spacing);}}
            finally {p.syncing=false;p.syncPromise=null;}
        })();
        return p.syncPromise;
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
            const request=p.requests.get(m.id);if(request===undefined)return;p.requests.delete(m.id);
            const t1=request.time;
            if(!finite(m.t2)||!finite(m.t3)||m.t3<m.t2)return;
            const rtt=(received-t1)-(m.t3-m.t2);if(rtt<0||rtt>2000)return;
            const row={t1,t2:m.t2,t3:m.t3,t4:received,rtt,offset:((m.t2-t1)+(m.t3-received))/2,local:(m.t2+m.t3)/2,phase:request.phase,runId:request.runId};
            p.samples.push(row);if(p.samples.length>MAX_SYNC_SAMPLES)p.samples.shift();p.model=clockFit(p.samples);
            if(p.model){send(p,{type:'CLOCK_MODEL',model:p.model,exchange:row});}
            return;
        }
        if(m.type==='CLOCK_MODEL'&&s.role==='guest') {
            if(!validModel(m.model))return;
            s.syncModel={...m.model,updated:now()};p.model=m.model;
            if(m.exchange){s.syncLog.push(m.exchange);if(s.syncLog.length>MAX_SYNC_SAMPLES)s.syncLog.shift();}
            return;
        }
        if(m.type==='SYNC_GESTURE_ARM'&&s.role==='guest') {
            if(typeof m.id!=='string'||!finite(m.start)||!finite(m.end)||m.end-m.start<6000||!localStatus().sensor||!s.calibration.complete){send(p,{type:'SYNC_GESTURE_REJECT',id:m.id,reason:'Sensor o calibración de ejes no disponibles.'});return;}
            armSyncGesture(m,s.syncModel);send(p,{type:'SYNC_GESTURE_READY',id:m.id});tell('Prueba física preparada. Sigue la cuenta atrás junto al maestro.');return;
        }
        if(m.type==='SYNC_GESTURE_READY'&&s.role==='host')return;
        if(m.type==='SYNC_GESTURE_REJECT'&&s.role==='host'){if(s.syncCalibration.id===m.id){s.syncCalibration.phase='failed';tell(p.name+': '+String(m.reason||'no pudo preparar la prueba.'),true);renderSyncCalibration();}return;}
        if(m.type==='SYNC_GESTURE_RESULT'&&s.role==='host') {
            if(s.syncCalibration.id!==m.id||!Array.isArray(m.samples)||m.samples.length<20||m.samples.length>1800)return;
            if(!m.calibration?.map)return;
            if(!['x','y','z'].includes(m.axis))return;
            const result=s.syncCalibration.results[p.id]||{windows:{},axes:{},calibration:m.calibration,accepted:false};
            result.windows[m.axis]=m.samples;result.calibration=m.calibration;s.syncCalibration.results[p.id]=result;renderSyncCalibration();return;
        }
        if(m.type==='SYNC_GESTURE_APPLY'&&s.role==='guest') {
            if(s.syncCalibration.gesture?.id!==m.id||!finite(m.correctionMs)||!m.axes)return;
            s.syncCalibration.results[s.id]={axes:m.axes,correctionMs:m.correctionMs,accepted:true};s.syncCalibration.correctionMs=m.correctionMs;s.syncCalibration.accepted=true;s.syncCalibration.phase='accepted';
            tell('Sincronización física validada: corrección fija '+m.correctionMs.toFixed(2)+' ms.');renderSyncCalibration();renderDevices();return;
        }
        if(m.type==='PLAN'&&s.role==='guest'&&!running()) {s.plan=checkPlan(m.plan);s.selected=pointFor()?.id||s.plan.points[0]?.id;renderPlan();return;}
        if(m.type==='PREPARE'&&s.role==='guest') {
            let reason='';
            if(running())reason='Ya hay un ensayo activo.';
            else if(s.run?.finishing)reason='El ensayo anterior todavía se está cerrando.';
            else if(!localStatus().sensor||document.hidden)reason='Sensor sin datos o página oculta.';
            else if(!pointFor())reason='Falta asignación a un punto.';
            // La ráfaga y el gesto ya han fijado la corrección del ensayo. El reloj
            // puede llevar más de 15 s sin mensajes porque el gesto físico dura 12 s.
            else if(!s.syncCalibration.accepted||s.syncModel.count<8)reason='Falta una sincronización física válida.';
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
    async function persistBeforeClosing(run) {
        // IndexedDB puede quedar pendiente en móviles cuando el navegador cambia de
        // estado. Nunca debe impedir cerrar bien un ensayo ni arrancar el siguiente.
        let timer;
        try {
            await Promise.race([
                persist(run),
                new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('El guardado local tardó demasiado.')),8000);})
            ]);
        } catch(error) {
            s.storageFailed=true;incident('storage',error.message);
            s.writeChain=Promise.resolve();
            tell('El guardado local sigue pendiente. El registro permanece en memoria: descárgalo antes de cerrar.',true);
        } finally {clearTimeout(timer);}
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
        if(s.sensorEnabled)return;
        s.sensor=false;s.sensorSource='';

        if(typeof DeviceMotionEvent==='undefined')throw Error('Este navegador no ofrece DeviceMotionEvent.');
        if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')throw Error('Debes permitir el acceso al movimiento.');
        window.addEventListener('devicemotion',motion);s.sensorEnabled=true;s.sensorSource='DeviceMotionEvent';
        tell('Esperando datos del acelerómetro mediante DeviceMotionEvent…');showCalibration();renderDevices();
        setTimeout(()=>{if(s.sensorEnabled&&!s.sensor)tell('No llegan datos mediante '+s.sensorSource+'. Revisa permiso de movimiento/sensores, que la página esté visible y que no esté activada la privacidad de sensores del teléfono.',true);},4000);
    }
    function renderSyncCalibration() {
        const state=s.syncCalibration,button=$('jointSyncStart');
        if(!button)return;
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        const axesReady=s.calibration.complete&&peers.every(p=>p.status?.calibrated);
        button.hidden=s.role!=='host';button.disabled=s.role!=='host'||!axesReady||state.phase==='network'||state.phase==='gesture'||state.phase==='processing'||state.phase==='gesture-ready'||state.phase==='accepted';
        const badge=$('jointSyncState');
        const labels={idle:'Pendiente',network:'Ráfaga de reloj','gesture-ready':'Elige un gesto',gesture:'Gesto en curso',processing:'Procesando',accepted:'Validada',failed:'Repetir prueba'};
        badge.textContent=labels[state.phase]||'Pendiente';badge.classList.toggle('done',state.phase==='accepted');
        const burst=$('jointSyncBurst'),burstProgress=$('jointSyncBurstProgress'),burstCount=$('jointSyncBurstCount');
        burst.hidden=state.phase!=='network';
        if(state.phase==='network'){
            const counts=peers.map(p=>p.samples.filter(row=>row.runId===state.id&&row.phase==='precal').length),count=counts.length?Math.min(...counts):0;
            burstProgress.value=Math.min(200,count);burstCount.textContent=Math.min(200,count)+' / 200 respuestas confirmadas';
        }
        const gesture=state.gesture;
        const box=$('jointSyncCountdown');
        if(!gesture||!finite(gesture.start)||!finite(gesture.end)||now()>gesture.end+1200){box.hidden=true;box.classList.remove('go');}
        else {
            const masterNow=s.role==='host'?now():toMaster(now(),gesture.model||s.syncModel),d=masterNow-gesture.start;
            box.hidden=false;
            if(d<0){box.classList.remove('go');box.textContent=Math.max(1,Math.ceil(-d/1000));}
            else {box.classList.add('go');box.textContent='¡AHORA!';}
        }
        const syncImage=$('jointSyncImage'),syncInstruction=$('jointSyncInstruction'),gestureActions=$('jointSyncGestureActions');
        const axis=gesture?.axis||['x','y','z'].find(key=>!state.results?.[s.id]?.axes?.[key])||'x';
        syncImage.src='assets/calibration/telefono-eje-'+axis+'.svg';syncImage.alt='Gesto de sincronización en el eje '+axis.toUpperCase();
        syncInstruction.textContent=gesture?(now()<(s.role==='host'?gesture.start:fromMaster(gesture.start,gesture.model||s.syncModel))?'Quieto hasta la cuenta atrás.':'Mueve el conjunto en '+axis.toUpperCase()+' · ida · vuelta · ida durante 6 s.'):state.phase==='gesture-ready'?'El maestro elige el siguiente eje.':'Primero calibra los relojes.';
        gestureActions.hidden=state.phase!=='gesture-ready';
        for(const key of ['x','y','z']){const control=$('jointSyncGesture'+key.toUpperCase()),done=!!state.results?.[s.id]?.axes?.[key];control.hidden=s.role!=='host';control.disabled=s.role!=='host'||done||state.phase!=='gesture-ready';control.classList.toggle('done',done);}
        const localRows=[];
        const own=state.results?.[s.id];
        if(own?.axes)localRows.push(`<article class="joint-sync-card"><strong>${escape(s.name)} · ${state.phase==='accepted'?'referencia':'maestro'}</strong><p>${axisResultMarkup(own.axes)}</p><small>${own.accepted?'Corrección: '+own.correctionMs.toFixed(2)+' ms':'Sin corrección física local'}</small></article>`);
        for(const p of peers){const result=state.results?.[p.id],model=state.models?.[p.id]||p.startModel,clock=finite(model?.offset)?`Offset inicial: ${model.offset.toFixed(2)} ms · RTT mín.: ${finite(model.rtt)?model.rtt.toFixed(2):'—'} ms`:'Modelo de reloj pendiente';localRows.push(`<article class="joint-sync-card"><strong>${escape(p.name)}</strong><p>${result?.axes?axisResultMarkup(result.axes):state.phase==='network'?'Midiendo RTT y offset…':state.phase==='gesture'?'Esperando gesto común…':'Pendiente'}</p><small>${clock}<br>${result?.accepted?'Corrección aplicada: '+result.correctionMs.toFixed(2)+' ms':result?.error?escape(result.error):'Se correlacionarán X–X, Y–Y y Z–Z.'}</small></article>`);}
        $('jointSyncSummary').innerHTML=localRows.length?localRows.join(''):`<p class="joint-help">Activa y calibra todos los acelerómetros antes de validar la sincronización.</p>`;
        if(state.phase==='accepted')$('jointSyncHelp').textContent='Sincronización validada. La corrección física se conservará para el próximo ensayo; los mensajes de 10 Hz durante la medida solo se guardarán como diagnóstico.';
        else if(state.phase==='gesture-ready'){
            const retry=['x','y','z'].find(axis=>!state.results?.[s.id]?.axes?.[axis]);
            $('jointSyncHelp').textContent=retry?'Pulsa '+retry.toUpperCase()+'. Si el gesto no se reconoce, repite solo ese eje; no hace falta repetir la ráfaga de reloj.':'Comprobando los tres ejes…';
        }
        else if(state.phase==='failed')$('jointSyncHelp').textContent='La calibración completa no se ha validado. Pulsa «Calibrar relojes» para reiniciarla de forma limpia.';
        else if(!axesReady)$('jointSyncHelp').textContent='Completa los factores +1/−1 de X, Y y Z en todos los móviles antes de iniciar la prueba conjunta.';
    }
    function axisResultMarkup(axes) {return ['x','y','z'].map(axis=>{const a=axes[axis];return a&&finite(a.lag)?`${axis.toUpperCase()}: ${a.lag.toFixed(2)} ms · r ${a.correlation.toFixed(3)}`:`${axis.toUpperCase()}: —`;}).join('<br>');}
    function showCalibration() {
        $('jointCalibration').hidden=false;$('jointCalibrationOverride').hidden=false;renderCalibration();
    }
    function calibrationAxisName(axis) {return axis==='x'?'X · longitudinal':axis==='y'?'Y · transversal':'Z · vertical';}
    function renderCalibration() {
        const c=s.calibration,active=c.active,done=c.complete;
        const state=$('jointCalibrationState');state.textContent=done?'Sentidos corregidos':active?'En curso':'Pendiente';state.classList.toggle('done',done);
        $('jointCalibration').classList.toggle('complete',done);
        const axis=active?.axis||['x','y','z'].find(key=>!c.map[key])||'x';
        const words={x:'mueve el móvil sobre el eje X y vuelve al origen.',y:'mueve el móvil sobre el eje Y y vuelve al origen.',z:'mueve el móvil sobre el eje Z y vuelve al origen.'};
        const image=$('jointCalibrationImage');
        image.src=done?'assets/calibration/telefono-ejes-reposo.svg':'assets/calibration/telefono-eje-'+axis+'.svg';
        image.alt=done?'Móvil centrado en el origen tras calibrar los ejes':'Móvil moviéndose sobre el eje '+axis.toUpperCase();
        $('jointCalibrationAnimation').classList.toggle('complete',done);
        $('jointCalibrationInstruction').textContent=done?'Móvil centrado en el origen.':'Calibrar '+calibrationAxisName(axis)+' · '+words[axis];
        for(const key of ['x','y','z']) {
            const calibration=c.map[key],button=$('jointCalibrate'+key.toUpperCase()),factor=$('jointFactor'+key.toUpperCase()),card=factor.closest('.joint-factor');
            button.disabled=!!active||(!s.sensorEnabled)||!!calibration;button.classList.toggle('done',!!calibration);
            factor.textContent=calibration?'× '+(calibration.sign>0?'+1':'−1'):'Pendiente';
            card.classList.toggle('ready',!!calibration);
        }
        const override=$('jointCalibrationOverride'),manual=$('jointManualCalibration'),skip=$('jointSkipCalibration');
        override.hidden=done;
        manual.hidden=done||!c.manualChoosing;
        skip.disabled=!!active||!s.sensorEnabled||!!c.manualChoosing;
        $('jointCalibrationHelp').textContent=done?'✓ Factores de signo guardados para este móvil. Puedes preparar la medida.':active?'Prepárate: empieza el gesto cuando termine la cuenta atrás.':'Pulsa cada eje y sigue el gesto indicado. Cada prueba solo corrige el signo de su propio registro; no se intercambian ejes.';
        renderCalibrationCountdown();
    }
    function renderCalibrationCountdown() {
        const box=$('jointCalibrationCountdown'),active=s.calibration.active;
        if(!active){box.hidden=true;box.classList.remove('go');return;}
        const t=now();box.hidden=false;
        if(t<active.start){box.classList.remove('go');box.textContent='Quieto · '+Math.max(1,Math.ceil((active.start-t)/1000));}
        else {box.classList.add('go');box.textContent='¡AHORA! Haz el movimiento de ida y vuelta';}
    }
    function startCalibration(axis) {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.map[axis])return;
        // Durante la cuenta atrás se mide la componente continua; en Z incluye la gravedad.
        s.calibration.active={axis,start:now()+3000,end:now()+6500,baseline:[],samples:[]};renderCalibration();
        tell('Calibración '+axis.toUpperCase()+': mantén el móvil quieto y empieza al aparecer ¡AHORA!.');
    }
    function chooseManualCalibration() {
        if(!s.sensorEnabled||!s.sensor)throw Error('Activa primero el acelerómetro y espera datos.');
        if(s.calibration.active||s.calibration.complete)return;
        s.calibration.manualChoosing=true;renderCalibration();
        tell('Elige si quieres conservar los tres ejes o invertir los tres ejes.');
    }
    function setManualCalibration(sign) {
        if(sign!==1&&sign!==-1)throw Error('Factor manual no válido.');
        if(s.calibration.active||!s.calibration.manualChoosing)return;
        for(const [axis,raw] of Object.entries({x:0,y:1,z:2}))s.calibration.map[axis]={raw,sign,manual:true,method:'manual'};
        s.calibration.manualChoosing=false;s.calibration.complete=true;
        tell('Calibración omitida: se aplica × '+(sign>0?'+1':'−1')+' a X, Y y Z.');renderCalibration();renderDevices();
    }
    function linearDetrend(values) {
        const n=values.length;if(n<3)return values.slice();
        let sx=0,sy=0,sxx=0,sxy=0;
        for(let i=0;i<n;i++){sx+=i;sy+=values[i];sxx+=i*i;sxy+=i*values[i];}
        const d=n*sxx-sx*sx,slope=Math.abs(d)>1e-12?(n*sxy-sx*sy)/d:0,intercept=(sy-slope*sx)/n;
        return values.map((value,i)=>value-(intercept+slope*i));
    }
    function lowPassCalibration(values,cutoffHz=10) {
        // Dos pares RC en ambos sentidos: paso bajo de 4.º orden, fc = 10 Hz y sin desfase temporal.
        if(values.length<4)return values.slice();
        const dt=1/Math.max(20,sampleRate()||60),rc=1/(2*Math.PI*cutoffHz),alpha=dt/(rc+dt);
        const pass=input=>{const output=[input[0]];for(let i=1;i<input.length;i++)output.push(output[i-1]+alpha*(input[i]-output[i-1]));return output;};
        let output=values.slice();
        for(let order=0;order<2;order++)output=pass(pass(output).reverse()).reverse();
        return output;
    }
    function calibrationLobes(values) {
        const peak=Math.max(...values.map(value=>Math.abs(value))),threshold=Math.max(.35,peak*.22),lobes=[];
        let current=null;
        values.forEach((value,index)=>{
            const sign=Math.abs(value)>=threshold?Math.sign(value):0;
            if(!sign){if(current){lobes.push(current);current=null;}return;}
            if(!current||current.sign!==sign){if(current)lobes.push(current);current={sign,start:index,end:index,peak:Math.abs(value)};}
            else {current.end=index;current.peak=Math.max(current.peak,Math.abs(value));}
        });
        if(current)lobes.push(current);
        return {peak,lobes};
    }
    function finishCalibration() {
        const active=s.calibration.active;if(!active)return;
        s.calibration.active=null;
        const rows=active.samples;if(rows.length<12){tell('No hubo suficientes muestras. Repite el gesto.',true);renderCalibration();return;}
        // Cada botón se aplica exclusivamente a su canal X/Y/Z. El gesto no intenta
        // identificar ni reordenar ejes: solo decide si ese canal debe invertirse.
        const raw={x:0,y:1,z:2}[active.axis];
        const quiet=active.baseline.map(row=>row[raw]).filter(finite);
        if(quiet.length<12){tell('No se pudo estimar la continua. Repite sin mover el móvil durante la cuenta atrás.',true);renderCalibration();return;}
        // Primero eliminamos la continua (incluida g en Z), hacemos detrend y filtramos a 10 Hz.
        const base=median(quiet),filtered=lowPassCalibration(linearDetrend(rows.map(row=>row[raw]-base)),10),pattern=calibrationLobes(filtered),{peak,lobes}=pattern;
        const best=lobes.length>=3?lobes.slice().sort((a,b)=>b.peak-a.peak).slice(0,3).sort((a,b)=>a.start-b.start):[];
        // La señal esperada es +, -, +. Si es -, +, -, el registro debe multiplicarse por -1.
        if(peak<.7||best.length<3||best[0].sign!==best[2].sign||best[1].sign===best[0].sign){tell('No se reconoció + − + ni − + −. Repite el gesto completo de ida y vuelta.',true);renderCalibration();return;}
        const sign=best[0].sign;
        s.calibration.map[active.axis]={raw,sign,peak,baseline:base,cutoffHz:10,pattern:'ida-vuelta'};
        s.calibration.complete=['x','y','z'].every(axis=>s.calibration.map[axis]);
        const factor='× '+(sign>0?'+1':'−1');
        tell(s.calibration.complete?'Calibración completa: se han guardado los tres factores de signo.':'Eje '+active.axis.toUpperCase()+': aplicar '+factor+'. Continúa con el siguiente.');renderCalibration();renderDevices();
    }
    function correctedVector(values,calibration=s.calibration) {
        const map=calibration?.map||{};
        if(!['x','y','z'].every(axis=>map[axis]&&Number.isInteger(map[axis].raw)))return values.slice(0,3);
        // Los canales nunca se permutan: X corrige X, Y corrige Y y Z corrige Z.
        return ['x','y','z'].map((axis,index)=>(map[axis].sign||1)*values[index]);
    }
    function filteredGestureSeries(samples,axis,calibration) {
        const index={x:1,y:2,z:3}[axis],rows=samples.filter(row=>Array.isArray(row)&&finite(row[0])&&finite(row[index])).sort((a,b)=>a[0]-b[0]);
        if(rows.length<20)return [];
        const factor=calibration?.map?.[axis]?.sign||1;
        const values=linearDetrend(rows.map(row=>factor*row[index]));
        const dt=median(rows.slice(1).map((row,i)=>row[0]-rows[i][0]).filter(value=>value>=5&&value<=100));
        const rate=dt?1000/dt:60;
        const lowPass=(input=>{if(input.length<4)return input.slice();const step=1/Math.max(20,rate),rc=1/(2*Math.PI*10),alpha=step/(rc+step),pass=x=>{const out=[x[0]];for(let i=1;i<x.length;i++)out.push(out[i-1]+alpha*(x[i]-out[i-1]));return out;};let out=input.slice();for(let order=0;order<2;order++)out=pass(pass(out).reverse()).reverse();return out;})(values);
        return rows.map((row,i)=>[row[0],lowPass[i]]);
    }
    function interpolateGesture(series,time) {
        let low=0,high=series.length-1;
        if(!series.length||time<series[0][0]||time>series[high][0])return null;
        while(high-low>1){const mid=(low+high)>>1;if(series[mid][0]<=time)low=mid;else high=mid;}
        const a=series[low],b=series[high];if(!b||b[0]===a[0])return a[1];
        return a[1]+(b[1]-a[1])*(time-a[0])/(b[0]-a[0]);
    }
    function correlationAt(master,participant,lag,start,end) {
        let n=0,sumA=0,sumB=0,sumAA=0,sumBB=0,sumAB=0;
        for(let t=start;t<=end;t+=1){const a=interpolateGesture(master,t),b=interpolateGesture(participant,t+lag);if(!finite(a)||!finite(b))continue;n++;sumA+=a;sumB+=b;sumAA+=a*a;sumBB+=b*b;sumAB+=a*b;}
        const top=n*sumAB-sumA*sumB,den=Math.sqrt(Math.max(0,(n*sumAA-sumA*sumA)*(n*sumBB-sumB*sumB)));
        return n>100&&den>1e-9?top/den:null;
    }
    function estimateGestureAxis(masterSamples,participantSamples,axis,masterCalibration,participantCalibration,start,end) {
        const master=filteredGestureSeries(masterSamples,axis,masterCalibration),participant=filteredGestureSeries(participantSamples,axis,participantCalibration);
        if(master.length<20||participant.length<20)return {axis,error:'muestras insuficientes'};
        let best={lag:0,correlation:-Infinity};
        for(let lag=-100;lag<=100;lag++){const correlation=correlationAt(master,participant,lag,start,end);if(finite(correlation)&&correlation>best.correlation)best={lag,correlation};}
        const values=master.map(row=>row[1]),rms=Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
        if(!finite(best.correlation)||best.correlation<.55||rms<.05)return {...best,axis,error:'gesto poco claro'};
        return {...best,axis,rms};
    }
    function armSyncGesture(payload,model=s.syncModel) {
        s.syncCalibration.phase='gesture';s.syncCalibration.gesture={id:payload.id,axis:payload.axis,start:payload.start,end:payload.end,model:structuredClone(model),samples:[],sent:false};
        tab('Sync');renderSyncCalibration();
    }
    async function startSyncCalibration() {
        requireHostEdit();
        if(!localStatus().sensor||!s.calibration.complete)throw Error('Activa y calibra los ejes del maestro antes de iniciar.');
        const peers=[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
        if(!peers.length)throw Error('Conecta al menos un participante.');
        for(const p of peers)if(!p.status?.sensor||!p.status?.calibrated||!p.status?.visible)throw Error(p.name+' debe tener el acelerómetro visible y los tres ejes calibrados.');
        // El estado se exporta con el ensayo: guarda IDs, nunca objetos RTCPeerConnection.
        const id=uid();s.syncCalibration={phase:'network',accepted:false,gesture:null,results:{},models:{},correctionMs:0,id,peerIds:peers.map(p=>p.id)};tab('Sync');renderSyncCalibration();
        tell('Midiendo 200 intercambios de reloj a 20 Hz por participante (unos 10 s)…');
        await Promise.all(peers.map(p=>startSync(p,200,50,'precal',id)));
        await pause(500);
        for(const p of peers){const rows=p.samples.filter(row=>row.runId===id&&row.phase==='precal');if(rows.length<185)throw Error('Solo se completaron '+rows.length+' de 200 intercambios con '+p.name+'. Repite la calibración.');const model=clockFit(rows);if(!model)throw Error('No se pudo ajustar el reloj de '+p.name+'.');p.model=model;p.startModel=structuredClone(model);s.syncCalibration.models[p.id]=structuredClone(model);send(p,{type:'CLOCK_MODEL',model});}
        s.syncCalibration.phase='gesture-ready';s.syncCalibration.results[s.id]={axes:{},accepted:true,correctionMs:0};
        tell('Relojes listos. Fija los móviles en la tablilla y pulsa el primer gesto.');renderSyncCalibration();
    }
    function startSyncGesture(axis) {
        requireHostEdit();const state=s.syncCalibration;
        if(state.phase!=='gesture-ready'||!['x','y','z'].includes(axis)||state.results?.[s.id]?.axes?.[axis])return;
        const start=now()+3000,end=start+6000,payload={type:'SYNC_GESTURE_ARM',id:state.id,axis,start,end};
        armSyncGesture(payload,{offset:0,drift:0,reference:0,count:0,rtt:0});broadcast(payload);
        tell('Gesto '+axis.toUpperCase()+' preparado: quietos durante la cuenta atrás.');
        // 3 s de cuenta atrás + 6 s de gesto + 4 s para que todos envíen su ventana.
        setTimeout(()=>finalizeSyncGesture(state.id,axis),13000);
    }
    function finalizeSyncGesture(id,axis) {
        const state=s.syncCalibration,g=state.gesture;if(s.role!=='host'||state.id!==id||!g||g.id!==id||state.phase==='accepted'||state.phase==='failed')return;
        state.phase='processing';const masterSamples=g.samples,masterCalibration=s.calibration;
        state.results[s.id]??={axes:{},accepted:true,correctionMs:0};
        let missing=[];
        const peers=(state.peerIds||[]).map(peerId=>s.peers.get(peerId)).filter(Boolean);
        for(const peerId of state.peerIds||[])if(!s.peers.has(peerId))missing.push('un participante desconectado');
        for(const p of peers){const result=state.results[p.id];if(!result?.windows?.[axis]){missing.push(p.name);continue;}
            result.axes??={};result.axes[axis]=estimateGestureAxis(masterSamples,result.windows[axis],axis,masterCalibration,result.calibration,g.start,g.end);
        }
        if(missing.length){state.phase='gesture-ready';state.gesture=null;tell('No llegó la ventana de '+axis.toUpperCase()+' de '+missing.join(', ')+'. Repite solo ese gesto.',true);renderSyncCalibration();return;}
        if(peers.every(p=>!state.results[p.id]?.axes?.[axis]?.error))state.results[s.id].axes[axis]={axis,lag:0,correlation:1};
        const allAxes=['x','y','z'].every(key=>peers.every(p=>state.results[p.id]?.axes?.[key]&&!state.results[p.id].axes[key].error));
        if(!allAxes){state.phase='gesture-ready';state.gesture=null;tell('Gesto '+axis.toUpperCase()+' procesado. Continúa con el siguiente eje.');renderSyncCalibration();return;}
        for(const p of peers){const result=state.results[p.id],lags=['x','y','z'].map(key=>result.axes[key].lag),spread=Math.max(...lags)-Math.min(...lags);result.correctionMs=median(lags);result.accepted=spread<=8;if(!result.accepted)result.error='Los retardos X, Y y Z no son coherentes.';}
        const rejected=peers.filter(p=>!state.results[p.id]?.accepted);
        if(rejected.length){
            const disagreement={x:0,y:0,z:0};
            for(const p of rejected){const axes=state.results[p.id].axes,centre=median(['x','y','z'].map(key=>axes[key].lag));for(const key of ['x','y','z'])disagreement[key]+=Math.abs(axes[key].lag-centre);}
            const retry=['x','y','z'].sort((a,b)=>disagreement[b]-disagreement[a])[0];
            for(const p of peers){delete state.results[p.id].axes[retry];delete state.results[p.id].windows?.[retry];state.results[p.id].accepted=false;delete state.results[p.id].error;}
            delete state.results[s.id].axes[retry];state.phase='gesture-ready';state.gesture=null;
            tell('El gesto '+retry.toUpperCase()+' es el menos coherente entre móviles. Repite solo ese eje.',true);renderSyncCalibration();return;
        }
        state.phase='accepted';state.accepted=true;
        for(const p of peers){const result=state.results[p.id];p.syncCalibration=structuredClone(result);send(p,{type:'SYNC_GESTURE_APPLY',id,correctionMs:result.correctionMs,axes:result.axes});}
        tell('Sincronización física validada. Ya puedes pasar a Medir.');renderSyncCalibration();renderDevices();
    }
    function motion(event) {
        const a=event.accelerationIncludingGravity;
        if(!a)return;
        recordJointMotion(finite(event.timeStamp)?event.timeStamp:null,a.x,a.y,a.z,finite(event.interval)?event.interval:null);
    }
    function recordJointMotion(timestamp,x,y,z,interval) {
        if(![x,y,z].every(finite))return;
        const received=now();
        // Event creation time, not hardware sampling time. Preserve raw and receipt.
        const used=timestamp!==null&&timestamp<=received+5&&timestamp>=received-1000?timestamp:received;
        if(running()&&s.lastSample&&received-s.lastSample>250)incident('sample-gap','Sin eventos de movimiento durante '+Math.round(received-s.lastSample)+' ms.');
        const run=s.run;
        // Durante el ensayo la malla queda anclada al modelo confirmado al arrancar.
        // Seguimos intercambiando mensajes de reloj para diagnóstico, pero sus ajustes
        // no desplazan retrospectiva ni progresivamente las muestras ya adquiridas.
        const captureModel=run&&activeStates.has(run.state)?run.initialClock:s.syncModel;
        const masterAtCapture=s.role==='host'?used:toMaster(used,captureModel);
        const sample=[0,timestamp,received,x,y,z,interval,used,masterAtCapture];
        const gesture=s.syncCalibration.gesture;
        if(gesture&&gesture.phase!=='finished'&&masterAtCapture>=gesture.start-700&&masterAtCapture<=gesture.end+700)gesture.samples.push([masterAtCapture,x,y,z]);
        const calibration=s.calibration.active;
        if(calibration&&received<calibration.start)calibration.baseline.push([x,y,z]);
        else if(calibration&&received<=calibration.end)calibration.samples.push([x,y,z]);
        s.sensor=true;s.lastSample=received;s.rateTimes.push(received);if(s.rateTimes.length>120)s.rateTimes.shift();
        s.recent.push(sample);while(s.recent.length&&s.recent[0][2]<received-2000)s.recent.shift();
        s.preview.push(sample);if(s.preview.length>600)s.preview.shift();
        if(run&&activeStates.has(run.state)) {
            const t=masterAtCapture;
            if(t>=run.start-1000&&t<=run.end+1000)appendSample(run,sample);
        }
    }
    function stopJointSensor() {
        window.removeEventListener('devicemotion',motion);
        s.sensor=false;s.sensorEnabled=false;s.sensorSource='';
    }
    function appendSample(run,sample) {
        if(run.samples.length>=MAX_SAMPLES){if(!run.sampleLimit){run.sampleLimit=true;incident('limit','Se ha alcanzado el límite de muestras.');}run.end=Math.min(run.end,toMaster(now(),run.initialClock));return;}
        const row=[...sample];row[0]=run.samples.length;run.samples.push(row);
    }
    function startDuringSync() {
        clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;
        if(s.role!=='host')return;
        s.duringSyncTimer=setInterval(()=>{
            if(!running()||s.role!=='host')return;
            for(const p of s.peers.values())if(p.channel?.readyState==='open')syncOnce(p,'during',s.run.id);
        },100);
    }
    function stopDuringSync(){clearInterval(s.duringSyncTimer);s.duringSyncTimer=null;}
    async function requestWake() {try{if(navigator.wakeLock)s.wake=await navigator.wakeLock.request('screen');}catch(e){incident('screen','No se pudo mantener la pantalla activa.');}}
    function releaseWake(){if(s.wake){s.wake.release().catch(()=>{});s.wake=null;}}
    function beginRun(id,start,end,duration) {
        s.results.clear();s.compareExport=null;s.storageFailed=false;
        const networkModel=s.role==='host'?{offset:0,drift:0,reference:0,count:0,rtt:0}:structuredClone(s.syncModel);
        const physicalCorrection=s.role==='host'?0:Number(s.syncCalibration.correctionMs||0);
        const model={...networkModel,offset:networkModel.offset+physicalCorrection,physicalCorrectionMs:physicalCorrection};
        const quiet=s.recent.filter(sample=>sample[2]>=now()-1000).map(sample=>correctedVector(sample.slice(3,6)));
        const previewBaseline=['x','y','z'].map((_,index)=>quiet.length?quiet.reduce((sum,row)=>sum+row[index],0)/quiet.length:0);
        const syncModels=s.role==='host'?Object.fromEntries([...s.peers.values()].map(p=>[p.id,structuredClone(p.startModel||p.model||{})])):{[s.id]:structuredClone(model)};
        s.run={id,session:s.session,start,end,plannedEnd:end,duration,state:'armed',created:new Date().toISOString(),plan:structuredClone(s.plan),initialClock:model,networkClock:structuredClone(networkModel),finalClock:model,syncModels,synchronizationCalibration:structuredClone(s.syncCalibration),samples:[],incidents:[],persisted:0,chunkIndex:0,previewBaseline,device:{id:s.id,name:s.name,role:s.role,point:structuredClone(pointFor()||null),calibration:structuredClone(s.calibration)},sync:[]};
        for(const sample of s.recent){const t=finite(sample[8])?sample[8]:toMaster(sample[7],model);if(t>=start-1000&&t<=end+1000)appendSample(s.run,sample);}
        document.body.classList.add('recording-lock');tab('Measure');ensureJointCharts();setTimeout(()=>{s.jointCharts.time?.resize();s.jointCharts.spectrum?.resize();},50);requestWake();startDuringSync();persist();renderPlan();renderDevices();tell('Inicio programado. Pantalla y gestos bloqueados durante la medida.');
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
            if(!p.status?.calibrated)throw Error(p.name+' debe completar la calibración de ejes.');
        }
        if(!s.calibration.complete)throw Error('Completa la calibración X, Y y Z del maestro antes de medir.');
        if(!s.syncCalibration.accepted)throw Error('Completa primero la pestaña Calibrar y sincronizar.');
        const duration=Number($('jointDuration').value);if(!finite(duration)||duration<5||duration>1800||!Number.isInteger(duration))throw Error('Introduce una duración entera entre 5 y 1800 segundos.');
        const id=uid(),tx={id,ready:new Map(),acks:new Set(),error:null,phase:'ready',peers};
        s.transaction=tx;tab('Measure');$('jointMeasureState').textContent='Confirmando dispositivos…';renderPlan();renderDevices();
        try {
            broadcast({type:'PREPARE',runId:id,duration});tell('Solicitando confirmación a los participantes…');
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
            if(!s.run)$('jointMeasureState').textContent='Preparación interrumpida';
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
        return {schema:'pasarelas-upm-joint-v1',id:run.id,session:run.session,created:run.created,state:run.state,device:run.device,plan:run.plan,windowMasterMs:{start:run.start,end:run.end,plannedEnd:run.plannedEnd},initialClock:run.initialClock,networkClock:run.networkClock||run.initialClock,finalClock:run.finalClock,syncModels:run.syncModels||{},synchronizationCalibration:run.synchronizationCalibration||null,synchronization:run.sync||[],incidents:run.incidents,sampleColumns:['sequence','eventTimeMs','receiptTimeMs','ax','ay','az','reportedIntervalMs','usedTimeMs','masterTimeAtCaptureMs'],acceleration:'includingGravity',units:'m/s²',timestampMeaning:'DOM event/receipt times; not certified hardware acquisition times',clockFormula:'masterMs = localMs - offset - drift * (localMs - reference)',clockCorrection:'masterTimeAtCaptureMs usa el modelo de reloj robusto fijado al inicio del ensayo más la corrección física fija de la tablilla; los intercambios posteriores solo diagnostican su estabilidad.',userAgent:navigator.userAgent};
    }
    function localRecord() {return s.run?{...runMeta(s.run),samples:s.run.samples}:null;}
    async function finishRun(cancelled=false) {
        const run=s.run;if(!run||run.finishing||run.finished)return;run.finishing=true;
        run.state=cancelled?'cancelled':'finished';run.finalClock=s.role==='host'?run.initialClock:structuredClone(s.syncModel);
        stopDuringSync();document.body.classList.remove('recording-lock');releaseWake();
        $('jointMeasureState').textContent='Cerrando registro…';
        await persistBeforeClosing(run);run.finished=true;run.finishing=false;
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
        for(let i=0;i<r.samples.length;i++){const row=r.samples[i];if(!Array.isArray(row)||(row.length!==8&&row.length!==9)||row[0]!==i||![row[2],row[3],row[4],row[5],row[7]].every(finite)||(row.length===9&&!finite(row[8])))throw Error('Muestras recibidas no válidas.');}
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
        $('jointDownload').disabled=!r?.finished;$('jointCsv').disabled=!r?.finished;$('jointDownloadProcessed').disabled=!r?.finished;$('jointCsvProcessed').disabled=!r?.finished;
        $('jointNewRun').disabled=!!running()||!!s.transfer||!!r?.finishing;
        $('jointSendData').hidden=s.role!=='guest';$('jointSendData').disabled=!r?.finished||!!s.transfer;
        if(!r){$('jointResultsList').textContent='Todavía no hay un ensayo registrado.';$('jointSyncResults').hidden=true;return;}
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
        renderSyncResults(r);
    }
    function clearSyncCharts(){for(const chart of s.syncCharts)chart?.destroy();s.syncCharts=[];}
    const modelOffsetAt=(model,time)=>{const m=model||{offset:0,drift:0,reference:0};return m.offset+m.drift*(time-m.reference);};
    const offsetResidual=(row,model)=>row.offset-modelOffsetAt(model,row.local);
    const selectedForModel=(row,model)=>!finite(model?.rttCutoff)||row.rtt<=model.rttCutoff;
    function syncMetric(row,metric,model){return metric==='rtt'?row.rtt:offsetResidual(row,model);}
    function jointTemporalOptions(duration,yTitle,tooltip,legend=true) {
        return {responsive:true,maintainAspectRatio:false,animation:false,normalized:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:legend,position:'top',labels:{boxWidth:22,font:{size:11}}},tooltip:{callbacks:{title:items=>items.length?'t = '+items[0].parsed.x.toFixed(3)+' s':'',label:tooltip}},zoom:{pan:{enabled:true,mode:'xy'},zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'xy'},limits:{x:{min:0,max:duration},y:{min:'original',max:'original'}}}},scales:{x:{type:'linear',min:0,max:duration,title:{display:true,text:'Tiempo desde el inicio del ensayo (s)'},grid:{color:'rgba(0,0,0,.08)'}},y:{title:{display:true,text:yTitle},grid:{color:'rgba(0,0,0,.08)'}}}};
    }
    function histogramBins(values,count) {
        let low=Math.min(...values),high=Math.max(...values);
        if(low===high){const pad=Math.max(.05,Math.abs(low)*.05);low-=pad;high+=pad;}
        const span=high-low, step=span/count, bins=Array.from({length:count},(_,index)=>({low:low+index*step,high:index===count-1?high:low+(index+1)*step,count:0}));
        for(const value of values){const index=Math.min(count-1,Math.max(0,Math.floor((value-low)/span*count)));bins[index].count++;}
        return bins;
    }
    function histogramMarkup(group,phase,metric,values) {
        const key=`${group.key}:${phase}:${metric}`,focus=s.syncView.focus[key],raw=values.filter(finite),data=focus?raw.filter(value=>value>=focus.low&&value<=focus.high):raw;
        const label=metric==='rtt'?'RTT':'Residuo de offset',phaseLabel=phase==='pre'?'Calibración — 200 intercambios a 20 Hz':'Durante el ensayo — 10/s';
        if(!data.length)return `<figure class="joint-rtt-figure"><figcaption>${label} · ${phaseLabel} · sin intercambios en este rango</figcaption></figure>`;
        const suffix=focus?` · zoom: ${focus.low.toFixed(2)} a ${focus.high.toFixed(2)} ms`:'';
        const detail=metric==='offset'?' · respecto al modelo inicial robusto':'';
        return `<figure class="joint-rtt-figure joint-sync-histogram"><figcaption><strong>${label}</strong> · ${phaseLabel}${detail}<br>${data.length} intercambios · mín. ${Math.min(...data).toFixed(2)} ms · mediana ${median(data).toFixed(2)} ms${suffix}</figcaption><div class="joint-histogram-controls"><label>Clases <select data-sync-bins><option value="8">8</option><option value="12">12</option><option value="20">20</option><option value="32">32</option><option value="48">48</option></select></label>${focus?`<button type="button" class="joint-secondary" data-sync-reset="${escape(key)}">Quitar zoom</button>`:'<span>Pulsa una barra para ampliar</span>'}</div><div class="joint-sync-canvas"><canvas id="syncHist-${escape(key)}" aria-label="Histograma de ${label} en ${phaseLabel}"></canvas></div></figure>`;
    }
    function timelineMarkup(group,metric) {
        const label=metric==='rtt'?'RTT':'Residuo de offset';
        return `<figure class="joint-rtt-figure joint-sync-timeline"><figcaption><strong>${label} durante el ensayo</strong> · rueda o pellizco para ampliar; arrastra en X e Y. La leyenda permite ocultar series.</figcaption><div class="joint-sync-canvas joint-sync-timeline-canvas"><canvas id="syncTimeline-${escape(group.key)}-${metric}" aria-label="${label} a lo largo del ensayo"></canvas></div><button type="button" class="joint-secondary" data-sync-chart-reset="${escape(group.key)}:${metric}">Restablecer zoom</button></figure>`;
    }
    function makeHistogramChart(canvas,values,key) {
        const focus=s.syncView.focus[key],data=(focus?values.filter(value=>value>=focus.low&&value<=focus.high):values).filter(finite);if(!canvas||!data.length)return;
        const bins=histogramBins(data,s.syncView.bins),labels=bins.map(bin=>`${bin.low.toFixed(2)}–${bin.high.toFixed(2)}`);
        const chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'Intercambios',data:bins.map(bin=>bin.count),backgroundColor:'#087cc3',borderColor:'#056aa8',borderWidth:1,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>labels[items[0].dataIndex]+' ms',label:item=>item.raw+' intercambios'}}},scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:5,font:{size:10}},title:{display:true,text:'ms'}},y:{beginAtZero:true,ticks:{precision:0},title:{display:true,text:'Número de intercambios'}}},onClick:(event,elements)=>{if(!elements.length)return;const bin=bins[elements[0].index];s.syncView.focus[key]={low:bin.low,high:bin.high};renderSyncResults(s.run);}}});
        s.syncCharts.push(chart);
    }
    function makeTimelineChart(canvas,rows,run,metric,model) {
        if(!canvas)return;const duration=Math.max(1,(run.end-run.start)/1000),points=rows.filter(row=>finite(syncMetric(row,metric,model))&&finite(row.t1)&&row.t1>=run.start&&row.t1<=run.end).map(row=>({x:(row.t1-run.start)/1000,y:syncMetric(row,metric,model),accepted:selectedForModel(row,model)})).sort((a,b)=>a.x-b.x);if(!points.length)return;
        const accepted=points.filter(point=>point.accepted),rejected=points.filter(point=>!point.accepted),label=metric==='rtt'?'RTT (ms)':'Residuo de offset (ms)',color=metric==='rtt'?'#087cc3':'#8e24aa';
        const datasets=[{label:'Intercambios aceptados',data:accepted,borderColor:color,backgroundColor:color,pointRadius:3,pointHoverRadius:5,borderWidth:1.6,tension:.12},{label:'RTT alto / descartados',data:rejected,borderColor:'#98a8b5',backgroundColor:'#98a8b5',pointRadius:3,pointHoverRadius:5,borderWidth:0,showLine:false}];
        if(metric==='offset')datasets.push({label:'Modelo aplicado (0 ms)',data:[{x:0,y:0},{x:duration,y:0}],borderColor:'#263746',borderDash:[6,4],borderWidth:1.4,pointRadius:0,pointHoverRadius:0});
        const options=jointTemporalOptions(duration,label,item=>item.dataset.label+': '+item.parsed.y.toFixed(3)+' ms',true);
        const chart=new Chart(canvas.getContext('2d'),{type:'line',data:{datasets},options});s.syncCharts.push(chart);enableLegendToggling(chart);
    }
    function modelSummaryMarkup(model) {
        if(!model||!finite(model.offset))return '<p class="joint-help">No se conservó el modelo inicial de este dispositivo.</p>';
        const ppm=finite(model.drift)?model.drift*1e6:0;
        return `<div class="joint-model-values"><span><b>Offset robusto</b>${model.offset.toFixed(3)} ms</span><span><b>Deriva</b>${model.drift.toExponential(3)} ms/ms · ${ppm.toFixed(3)} ppm</span><span><b>Referencia</b>${model.reference.toFixed(1)} ms</span><span><b>Intercambios</b>${model.selectedCount??'—'} / ${model.count??'—'} seleccionados</span><span><b>RTT seleccionado</b>mín. ${finite(model.rtt)?model.rtt.toFixed(2):'—'} ms · mediana ${finite(model.rttMedian)?model.rttMedian.toFixed(2):'—'} ms</span><span><b>Umbral RTT</b>${finite(model.rttCutoff)?model.rttCutoff.toFixed(2):'—'} ms</span></div>`;
    }
    function renderSyncResults(run) {
        const target=$('jointRttHistograms'),groups=[];clearSyncCharts();
        if(s.role==='host') {
            for(const p of s.peers.values()) {
                const rows=p.samples.filter(row=>row.runId===run.id);
                const duringRows=rows.filter(row=>row.phase==='during');
                const preRows=p.samples.filter(row=>row.phase==='precal'),model=run.syncModels?.[p.id]||p.startModel||p.model;groups.push({key:p.id,name:p.name||'Participante',preRows,duringRows,model});
            }
        } else {
            const rows=s.syncLog.filter(row=>row.runId===run.id);
            const duringRows=rows.filter(row=>row.phase==='during');
            groups.push({key:'master',name:'Maestro',preRows:s.syncLog.filter(row=>row.phase==='precal'),duringRows,model:run.networkClock||run.initialClock});
        }
        const useful=groups.some(group=>group.preRows.length||group.duringRows.length);
        $('jointSyncResults').hidden=!useful;
        $('jointSyncFormula').innerHTML=`<div class="joint-sync-formula"><strong>Modelo aplicado a las marcas temporales</strong><div><i>t</i><sub>maestro</sub> = <i>t</i><sub>participante</sub> − [offset<sub>0</sub> + deriva · (<i>t</i><sub>participante</sub> − referencia)]</div><small>El offset<sub>0</sub> es la mediana del 30 % de intercambios con RTT menor. La deriva se estima con Theil–Sen si hay al menos 20 s de datos útiles. El modelo se fija antes del ensayo; los intercambios posteriores solo diagnostican su estabilidad.</small></div>`;
        target.innerHTML=groups.map(group=>{const preRtt=group.preRows.map(row=>row.rtt),duringRtt=group.duringRows.map(row=>row.rtt),preOffset=group.preRows.map(row=>syncMetric(row,'offset',group.model)),duringOffset=group.duringRows.map(row=>syncMetric(row,'offset',group.model));return `<article class="joint-rtt-group"><h5>${escape(group.name)}</h5>${modelSummaryMarkup(group.model)}<div class="joint-rtt-grid">${histogramMarkup(group,'pre','rtt',preRtt)}${histogramMarkup(group,'pre','offset',preOffset)}${histogramMarkup(group,'during','rtt',duringRtt)}${histogramMarkup(group,'during','offset',duringOffset)}</div><div class="joint-sync-timeline-grid">${timelineMarkup(group,'rtt')}${timelineMarkup(group,'offset')}</div></article>`;}).join('');
        target.querySelectorAll('[data-sync-bins]').forEach(select=>{select.value=String(s.syncView.bins);select.addEventListener('change',event=>{s.syncView.bins=Number(event.target.value);renderSyncResults(run);});});
        target.querySelectorAll('[data-sync-reset]').forEach(button=>button.addEventListener('click',()=>{delete s.syncView.focus[button.dataset.syncReset];renderSyncResults(run);}));
        target.querySelectorAll('[data-sync-chart-reset]').forEach(button=>button.addEventListener('click',()=>{const [groupKey,metric]=button.dataset.syncChartReset.split(':');const chart=s.syncCharts.find(item=>item.canvas.id===`syncTimeline-${groupKey}-${metric}`);chart?.resetZoom();}));
        for(const group of groups){for(const [phase,rows] of [['pre',group.preRows],['during',group.duringRows]])for(const metric of ['rtt','offset'])makeHistogramChart($(`syncHist-${group.key}:${phase}:${metric}`),rows.map(row=>syncMetric(row,metric,group.model)),`${group.key}:${phase}:${metric}`);for(const metric of ['rtt','offset'])makeTimelineChart($(`syncTimeline-${group.key}-${metric}`),group.duringRows,run,metric,group.model);}
    }
    function exportSession() {
        if(!s.run?.finished)throw Error('Termina primero el ensayo.');
        const records=[...s.results.values()].map(r=>{
            // Keep originals; use one final model per record to avoid time jumps.
            const model=r.device.id===s.id?r.finalClock:(s.peers.get(r.device.id)?.model||r.finalClock);
            const valid=validModel(model)||r.device.role==='host';
            return {...r,exportClock:valid?model:r.initialClock,samples:r.samples.map(row=>({raw:row,masterTimeMs:finite(row[8])?row[8]:toMaster(row[7],valid?model:r.initialClock)}))};
        });
        const expected=s.run.plan.points.filter(p=>p.device).map(p=>p.device);
        download('ensayo_conjunto_'+s.run.id+'.json',{schema:'pasarelas-upm-joint-export-v1',session:s.session,plan:s.run.plan,windowMasterMs:{start:s.run.start,end:s.run.end},complete:expected.every(id=>s.results.has(id)),missingDevices:expected.filter(id=>!s.results.has(id)),networkClockLog:Object.fromEntries([...s.peers.values()].map(p=>[p.id,p.samples])),records,validation:'Experimental: no certified physical sensor synchronization. Data have not been resampled.'});
    }
    function processedCommonExport() {
        const data=comparisonExport();if(!data)throw Error('Termina primero el ensayo y recibe los registros disponibles.');
        const start=data.windowMasterMs.start,end=data.windowMasterMs.end,records=data.records.filter(record=>record.samples?.length),periods=records.map(record=>samplePeriodMs(record,start,end)).filter(finite);
        if(!periods.length)throw Error('No hay suficientes marcas temporales para crear la malla común.');
        const period=Math.max(...periods),grid=[];for(let t=start;t<=end+.1;t+=period)grid.push(t);
        const processed=records.map(record=>{
            const axes=[0,1,2].map(axis=>resampleAxis(record.samples,sample=>structuralValue(sample.raw,record,axis),grid));
            axes[2]=detrendPoints(axes[2]);
            const byTime=axes.map(series=>new Map(series.map(point=>[Math.round(point.x*1000),point.y])));
            const samples=grid.map(t=>{const key=Math.round(t*1000);return {masterTimeMs:t,x:byTime[0].get(key)??null,y:byTime[1].get(key)??null,z:byTime[2].get(key)??null};});
            return {device:record.device,calibration:record.device?.calibration||null,samples};
        });
        return {schema:'pasarelas-upm-joint-processed-v1',source:'muestras brutas transformadas y remuestreadas',plan:data.plan,windowMasterMs:data.windowMasterMs,commonPeriodMs:period,commonRateHz:1000/period,zProcessing:'detrend lineal por móvil tras interpolación',records:processed};
    }
    function exportProcessedJson() {const data=processedCommonExport();download('ensayo_conjunto_procesado_'+s.run.id+'.json',data);}
    function exportProcessedCsv() {
        const data=processedCommonExport(),cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
        const lines=['master_time_s,device,point,x_structural_m_s2,y_structural_m_s2,z_structural_detrended_m_s2'];
        data.records.forEach(record=>record.samples.forEach(sample=>lines.push([((sample.masterTimeMs-data.windowMasterMs.start)/1000).toFixed(6),record.device.name,record.device.point?.name,sample.x,sample.y,sample.z].map(cell).join(','))));
        download('ensayo_conjunto_procesado_'+s.run.id+'.csv','\ufeff'+lines.join('\n'),'text/csv;charset=utf-8');
    }
    function exportCsv() {
        const r=localRecord();if(!r||!s.run.finished)throw Error('No hay un registro terminado.');
        const model=r.finalClock,point=r.device.point;
        const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
        const columns=['device','point','point_x_m','point_y_m','axis','angle_deg','sequence','event_time_ms','receipt_time_ms','ax_m_s2','ay_m_s2','az_m_s2','reported_interval_ms','used_time_ms','master_time_at_capture_ms','master_time_estimated_ms','inside_window'];
        const lines=r.samples.map(row=>{const t=finite(row[8])?row[8]:toMaster(row[7],model);return [r.device.name,point?.name,point?.x,point?.y,point?.axis,point?.angle,...row,t,t>=r.windowMasterMs.start&&t<=r.windowMasterMs.end?1:0].map(cell).join(',');});
        download('aceleraciones_'+r.id+'_'+s.id+'.csv','\ufeff'+columns.join(',')+'\n'+lines.join('\n'),'text/csv;charset=utf-8');
    }
    function comparisonExport() {
        if(s.compareExport) return s.compareExport;
        if(!s.run?.finished) return null;
        const records=[...s.results.values()].map(r=>{
            const model=r.device.id===s.id?r.finalClock:(s.peers.get(r.device.id)?.model||r.finalClock);
            const use=validModel(model)||r.device.role==='host'?model:r.initialClock;
            return {...r,samples:r.samples.map(raw=>({raw,masterTimeMs:finite(raw[8])?raw[8]:toMaster(raw[7],use)}))};
        });
        return {plan:s.run.plan,windowMasterMs:{start:s.run.start,end:s.run.end},records};
    }
    function validComparisonExport(data) {
        if(!data||!data.plan||!Array.isArray(data.records)||!data.windowMasterMs||!finite(data.windowMasterMs.start)||!finite(data.windowMasterMs.end)) throw Error('El archivo no es un ensayo conjunto válido.');
        if(data.records.length<1||data.records.length>MAX_PEERS+1)throw Error('El archivo contiene un número no válido de registros.');
        for(const record of data.records) {
            if(!record?.device?.id||!Array.isArray(record.samples))throw Error('Falta un registro de móvil válido.');
            for(const sample of record.samples) if(!sample||!Array.isArray(sample.raw)||sample.raw.length<8||!finite(sample.masterTimeMs))throw Error('El archivo contiene muestras incompatibles.');
        }
        return data;
    }
    function median(values) {
        const a=values.filter(finite).sort((x,y)=>x-y),n=a.length;if(!n)return null;
        return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
    }
    function samplePeriodMs(record,start,end) {
        const times=record.samples.map(s=>s.masterTimeMs).filter(t=>finite(t)&&t>=start-1000&&t<=end+1000).sort((a,b)=>a-b);
        return median(times.slice(1).map((t,i)=>t-times[i]).filter(dt=>dt>=5&&dt<=250));
    }
    function structuralValue(raw,record,axis) {
        return correctedVector([raw[3],raw[4],raw[5]],record.device?.calibration)[axis];
    }
    function resampleAxis(samples,getValue,grid) {
        const source=samples.filter(s=>finite(s.masterTimeMs)&&finite(getValue(s))).sort((a,b)=>a.masterTimeMs-b.masterTimeMs),out=[];
        let i=0;
        for(const t of grid) {
            while(i+1<source.length&&source[i+1].masterTimeMs<t)i++;
            const a=source[i],b=source[i+1];
            if(!a||!b||b.masterTimeMs===a.masterTimeMs||t<a.masterTimeMs||t>b.masterTimeMs)continue;
            const r=(t-a.masterTimeMs)/(b.masterTimeMs-a.masterTimeMs);
            out.push({x:t,y:getValue(a)+r*(getValue(b)-getValue(a))});
        }
        return out;
    }
    function detrendPoints(points) {
        if(points.length<2)return points;
        const n=points.length,sx=points.reduce((a,p)=>a+p.x,0),sy=points.reduce((a,p)=>a+p.y,0),sxx=points.reduce((a,p)=>a+p.x*p.x,0),sxy=points.reduce((a,p)=>a+p.x*p.y,0),d=n*sxx-sx*sx,m=Math.abs(d)>1e-12?(n*sxy-sx*sy)/d:0,b=(sy-m*sx)/n;
        return points.map(p=>({x:p.x,y:p.y-(m*p.x+b)}));
    }
    function renderComparison() {
        const status=$('jointCompareStatus'),data=comparisonExport();
        for(const chart of s.compareCharts||[])chart.destroy();s.compareCharts=[];
        for(const chart of Object.values(s.jointCharts||{}))chart?.destroy();s.jointCharts={time:null,spectrum:null};
        if(!data) {status.textContent='Termina un ensayo y recibe los registros de los participantes para compararlos aquí.';return;}
        const records=data.records.filter(r=>r.samples?.length).sort((a,b)=>{
            const ap=data.plan.points?.find(p=>p.device===a.device.id),bp=data.plan.points?.find(p=>p.device===b.device.id);
            return (ap?.x??0)-(bp?.x??0);
        });
        if(!records.length) {status.textContent='El ensayo no contiene muestras para representar.';return;}
        if(typeof Chart==='undefined') {status.textContent='No se ha cargado la librería de gráficas. Recarga la página con conexión.';return;}
        const start=data.windowMasterMs.start,end=data.windowMasterMs.end,span=Math.max(1,end-start),axes=[['X',0,'#1565c0','jointCompareCanvasX'],['Y',1,'#c62828','jointCompareCanvasY'],['Z',2,'#2e7d32','jointCompareCanvasZ']],dashes=[[],[8,5],[3,4],[11,4,2,4]],view=$('jointCompareView').value;
        const periods=records.map(r=>samplePeriodMs(r,start,end)).filter(finite),commonPeriod=periods.length?Math.max(...periods):null,grid=[];
        if(view==='common'&&!finite(commonPeriod)){status.textContent='No hay suficientes marcas temporales válidas para construir la rejilla común.';return;}
        if(view==='common'&&finite(commonPeriod))for(let t=start;t<=end+.1;t+=commonPeriod)grid.push(t);
        status.textContent=view==='common'?`${records.length} móviles · rejilla común de ${commonPeriod.toFixed(2)} ms (${(1000/commonPeriod).toFixed(1)} Hz) · interpolación lineal a partir de las marcas temporales corregidas al reloj maestro.`:`${records.length} móviles · marcas temporales originales ya referidas al reloj del maestro; sin remuestreo.`;
        for(const [axis,axisIndex,color,canvasId] of axes) {
            const datasets=[];
            records.forEach((record,deviceIndex)=>{
                const point=data.plan.points?.find(p=>p.device===record.device.id),name=(record.device.name||'Móvil')+(point?' · '+point.name:'');
                const getter=sample=>structuralValue(sample.raw,record,axisIndex);
                const valid=record.samples.filter(sample=>finite(sample.masterTimeMs)&&finite(getter(sample))&&sample.masterTimeMs>=start&&sample.masterTimeMs<=end);
                let points=view==='common'?resampleAxis(record.samples,getter,grid).map(p=>({x:(p.x-start)/1000,y:p.y})):valid.map(sample=>({x:(sample.masterTimeMs-start)/1000,y:getter(sample)}));
                if(axis==='Z')points=detrendPoints(points);
                const stride=Math.max(1,Math.ceil(points.length/4500));
                datasets.push({label:name,data:points.filter((_,i)=>i%stride===0),borderColor:color,borderDash:dashes[deviceIndex%dashes.length],borderWidth:deviceIndex?1.35:2.15,pointRadius:0,tension:0,parsing:false});
            });
            const options=jointTemporalOptions(span/1000,axis==='Z'?'Aceleración Z con detrend (m/s²)':'Aceleración '+axis+' (m/s²)',item=>item.dataset.label+': '+item.parsed.y.toFixed(4)+' m/s²',true);options.scales.x.title.text='Tiempo en el reloj maestro (s)';
            const chart=new Chart($(canvasId).getContext('2d'),{type:'line',data:{datasets},options});
            s.compareCharts.push(chart);enableLegendToggling(chart);
        }
    }
    function ensureJointCharts() {
        if(typeof Chart==='undefined')return false;
        const common={responsive:true,maintainAspectRatio:false,animation:false,events:[],parsing:false,plugins:{legend:{position:'top',labels:{boxWidth:28,font:{size:12}}}},scales:{x:{type:'linear',grid:{color:'rgba(0,0,0,.08)'}},y:{grid:{color:'rgba(0,0,0,.08)'}}}};
        if(!s.jointCharts.time)s.jointCharts.time=new Chart($('jointLive').getContext('2d'),{type:'line',data:{datasets:[{label:'X',data:[],borderColor:'#1565c0',borderWidth:2,pointRadius:0},{label:'Y',data:[],borderColor:'#c62828',borderWidth:2,pointRadius:0},{label:'Z',data:[],borderColor:'#2e7d32',borderWidth:2,pointRadius:0}]},options:{...common,scales:{x:{...common.scales.x,min:0,max:5,title:{display:true,text:'Tiempo (s)'}},y:{...common.scales.y,title:{display:true,text:'Aceleración (m/s²)'}}}}});
        if(!s.jointCharts.spectrum)s.jointCharts.spectrum=new Chart($('jointLiveSpectrum').getContext('2d'),{type:'line',data:{datasets:[{label:'X',data:[],borderColor:'#1565c0',borderWidth:2,pointRadius:0},{label:'Y',data:[],borderColor:'#c62828',borderWidth:2,pointRadius:0},{label:'Z',data:[],borderColor:'#2e7d32',borderWidth:2,pointRadius:0}]},options:{...common,scales:{x:{...common.scales.x,min:0,max:30,title:{display:true,text:'Frecuencia (Hz)'}},y:{...common.scales.y,min:0,title:{display:true,text:'Amplitud'}}}}});
        return true;
    }
    function drawPreview() {
        if(!ensureJointCharts())return;
        const rows=s.preview.filter(v=>v[2]>now()-5000);if(rows.length<2)return;
        const baseline=s.run?.previewBaseline||[0,0,0],start=rows[0][2],values=rows.map(v=>correctedVector(v.slice(3,6)).map((value,index)=>value-baseline[index]));
        const chart=s.jointCharts.time,max=Math.max(.2,...values.flatMap(v=>v.map(Math.abs))),limit=Math.ceil(max*2)/2;
        chart.data.datasets.forEach((dataset,axis)=>dataset.data=rows.map((row,index)=>({x:(row[2]-start)/1000,y:values[index][axis]})));
        chart.options.scales.x.min=0;chart.options.scales.x.max=5;chart.options.scales.y.min=-limit;chart.options.scales.y.max=limit;chart.update('none');
    }
    function refreshJointPreviewBaseline(run) {
        const quiet=s.recent.filter(sample=>sample[2]>=now()-750).map(sample=>correctedVector(sample.slice(3,6)));
        if(quiet.length<6)return;
        run.previewBaseline=['x','y','z'].map((_,index)=>median(quiet.map(values=>values[index])));
    }
    function drawLiveSpectrum() {
        if(!ensureJointCharts())return;
        const rows=s.preview.filter(v=>v[2]>now()-5000);if(rows.length<16)return;
        const baseline=s.run?.previewBaseline||[0,0,0],source=rows.map(v=>{const q=correctedVector(v.slice(3,6));return {ax:q[0]-baseline[0],ay:q[1]-baseline[1],az:q[2]-baseline[2]};}),rate=sampleRate();if(!finite(rate)||rate<2)return;
        const chart=s.jointCharts.spectrum,spectra=[calculateSpectrum(source,'ax',rate),calculateSpectrum(source,'ay',rate),calculateSpectrum(source,'az',rate)],max=Math.max(.001,...spectra.flatMap(series=>series.map(p=>p.y))),limit=Math.ceil(max*100)/100;
        chart.data.datasets.forEach((dataset,axis)=>dataset.data=spectra[axis]);chart.options.scales.x.min=0;chart.options.scales.x.max=30;chart.options.scales.y.min=0;chart.options.scales.y.max=limit;chart.update('none');
    }
    function tick() {
        if(root.hidden)return;
        const r=s.run;
        if(s.calibration.active) {
            const a=s.calibration.active,t=now();
            if(t>=a.end)finishCalibration();
            else if(t<a.start)$('jointCalibrationHelp').textContent='Mantén el móvil quieto: calculando la continua de referencia.';
            else $('jointCalibrationHelp').textContent='Registrando gesto: detrend y filtro paso bajo de 10 Hz…';
            renderCalibrationCountdown();
        }
        const gesture=s.syncCalibration.gesture;
        if(gesture&&now()>=gesture.end&&gesture.phase!=='finished') {
            gesture.phase='finished';
            if(s.role==='guest'&&!gesture.sent){
                gesture.sent=true;const host=[...s.peers.values()][0];
                send(host,{type:'SYNC_GESTURE_RESULT',id:gesture.id,axis:gesture.axis,samples:gesture.samples,calibration:s.calibration});
                tell('Ventana del gesto enviada al maestro. Procesando correlaciones…');
            }
        }
        renderSyncCalibration();
        if(s.transaction?.phase==='ready') {
            $('jointMeasureState').textContent='Confirmando dispositivos…';
        }
        if(r&&activeStates.has(r.state)) {
            const t=toMaster(now(),r.initialClock);
            if(t<r.start){
                refreshJointPreviewBaseline(r);
                $('jointMeasureState').textContent='Inicio en '+Math.max(0,Math.ceil((r.start-t)/1000))+' s';
            }
            else {
                if(r.state==='armed')refreshJointPreviewBaseline(r);
                r.state='recording';const elapsed=Math.max(0,Math.min(t,r.end)-r.start);
                $('jointMeasureState').textContent=t>r.end?'Guardando margen final…':Math.floor(elapsed/60000).toString().padStart(2,'0')+':'+Math.floor(elapsed/1000%60).toString().padStart(2,'0');
                $('jointRunTime').textContent=Math.floor(elapsed/60000).toString().padStart(2,'0')+':'+(elapsed/1000%60).toFixed(1).padStart(4,'0');
                $('jointProgress').value=Math.min(1,elapsed/Math.max(1,r.end-r.start));
            }
            if(t>r.end+1000)finishRun().catch(e=>tell(e.message,true));
        }
        $('jointSampleCount').textContent=r?.samples.length||0;$('jointRate').textContent=localStatus().sensor?sampleRate().toFixed(1)+' Hz':'—';
        drawPreview();
        if(s.uiTick%4===0)drawLiveSpectrum();
        if(++s.uiTick%4===0){renderDevices();broadcast({type:'STATUS',status:localStatus()});if(running())persist();}
    }
    function resetSession() {
        if((running()||s.transaction)&&!confirm('¿Cancelar la medida y salir? Los bloques guardados seguirán disponibles en este navegador.'))return;
        if(running()||s.transaction)stopRun('Salida de la sesión');
        if(s.run){if(running())s.run.state='cancelled';persist();}
        stopScan();if($('jointPairDialog').open)$('jointPairDialog').close();
        for(const p of s.peers.values())disposePeer(p);s.peers.clear();s.currentInvite=null;
        stopJointSensor();stopDuringSync();document.body.classList.remove('recording-lock');releaseWake();
        for(const chart of s.compareCharts||[])chart.destroy();s.compareCharts=[];
        s.role=null;s.session=null;s.run=null;s.results.clear();s.compareExport=null;s.pending=null;s.transaction=null;s.syncLog=[];s.recent=[];s.rateTimes=[];s.preview=[];s.planView=null;s.planPan=null;s.planPinch=null;s.planPointers.clear();
        s.calibration={map:{},active:null,complete:false};s.syncCalibration={phase:'idle',accepted:false,gesture:null,results:{},models:{},correctionMs:0};$('jointCalibration').hidden=true;$('jointCalibrationOverride').hidden=true;
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
    document.querySelectorAll('[data-joint-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.jointTab);if(b.dataset.jointTab==='Results')renderResults();if(b.dataset.jointTab==='Sync')renderSyncCalibration();});
    $('jointCreate').onclick=guard(()=>{
        open();s.id=uid();s.role='host';s.name='Maestro';s.session=uid();
        try{const stored=localStorage.getItem('upm-joint-plan-v1');if(stored)s.plan=checkPlan(JSON.parse(stored));}catch(e){tell('No se pudo recuperar el plano anterior.',true);}
        if(!s.plan.points.length)s.plan.points=[{id:'P1',name:'Centro de vano',x:s.plan.length/2,y:s.plan.width/2,axis:'z',angle:0,device:s.id},{id:'P2',name:'L/4',x:s.plan.length/4,y:s.plan.width/2,axis:'z',angle:0,device:null}];
        else {s.plan.points.forEach(p=>p.device=null);s.plan.points[0].device=s.id;}
        s.selected=s.plan.points[0].id;workspace();tell('Define el plano y pulsa Invitar móvil para incorporar un participante.');
    });
    $('jointJoin').onclick=()=>openPair();$('jointPair').onclick=guard(()=>pairingAction(invite));
    $('jointRetryPair').onclick=guard(retryPair);
    $('jointPrepareSafari').onclick=guard(prepareSafariConnection);
    $('jointAndroidNearbyDone').onclick=()=>{$('jointAndroidNearbyNotice').hidden=true;$('jointPairStatus').textContent='Permiso indicado como activado. Reinicia el emparejamiento para usar la nueva configuración.';};
    $('jointCopyDiagnostics').onclick=guard(async()=>{
        const value=$('jointPairDiagnosticsText').textContent||s.lastPairDiagnostic;
        if(!value)throw Error('Todavía no hay un diagnóstico disponible.');
        try{await navigator.clipboard.writeText(value);$('jointPairStatus').textContent='Diagnóstico copiado. Pégalo en el chat.';}
        catch(e){$('jointPairDiagnosticsText').focus();$('jointPairStatus').textContent='Mantén pulsado el diagnóstico para copiarlo.';}
    });
    $('jointNetworkMode').onchange=()=>{$('jointPairStatus').textContent='Pulsa Reiniciar emparejamiento para generar una invitación nueva con este modo.';};
    $('jointPairClose').onclick=()=>{$('jointPairDialog').close();stopScan();};
    $('jointPairDialog').addEventListener('close',stopScan);
    $('jointReadCode').onclick=guard(()=>pairingAction(()=>readCode()));$('jointScanCode').onclick=guard(scanCode);$('jointStopScan').onclick=stopScan;
    $('jointGenerateAnswer').onclick=guard(()=>pairingAction(createGuestAnswer));
    $('jointCopyCode').onclick=guard(async()=>{const text=$('jointPairOutput').value;try{await navigator.clipboard.writeText(text);$('jointPairStatus').textContent='Código copiado.';}catch(e){$('jointPairOutput').focus();$('jointPairOutput').select();$('jointPairStatus').textContent='Selecciona y copia el código completo.';}});
    for(const id of ['jointLength','jointWidth'])$(id).addEventListener('change',()=>{if(s.role!=='host'||running()||s.transaction)return;$('jointApplyGeometry').click();});
    $('jointApplyGeometry').onclick=guard(()=>{
        requireHostEdit();const candidate={...s.plan,name:$('jointName').value,length:Number($('jointLength').value),width:Number($('jointWidth').value)};
        s.plan=checkPlan(candidate);
        // Una geometría nueva siempre se muestra completa y sin arrastrar la cámara previa.
        s.planView=null;s.planPan=null;s.planPinch=null;s.planPointers.clear();
        savePlan();tell('Dimensiones guardadas. Vista del plano reajustada.');
    });
    $('jointAddPoint').onclick=guard(()=>{requireHostEdit();s.adding=!s.adding;renderPlan();});
    $('jointAddPointTable').onclick=guard(()=>addPoint());
    $('jointRemovePoint').onclick=guard(()=>{requireHostEdit();if(!s.selected)throw Error('Selecciona un punto.');s.plan.points=s.plan.points.filter(p=>p.id!==s.selected);s.selected=s.plan.points[0]?.id;savePlan();});
    $('jointResetView').onclick=guard(()=>{requireHostEdit();resetPlanView();});
    $('jointApplyPoint').onclick=guard(()=>{
        requireHostEdit();const original=s.plan.points.find(p=>p.id===s.selected);if(!original)return;
        const device=$('jointPointDevice').value||null;
        if(device&&s.plan.points.some(p=>p.id!==original.id&&p.device===device))throw Error('Ese móvil ya tiene otro punto. Desasígnalo primero.');
        const candidate={...original,name:$('jointPointName').value,x:Number($('jointPointX').value),y:Number($('jointPointY').value),axis:$('jointPointAxis').value,angle:Number($('jointPointAngle').value),device};
        s.plan=checkPlan({...s.plan,points:s.plan.points.map(p=>p.id===candidate.id?candidate:p)});savePlan();renderDevices();tell('Punto actualizado.');
    });
    $('jointSavePlan').onclick=()=>download('plano_puntos.json',{schema:'pasarelas-upm-plan-v1',...s.plan,points:s.plan.points.map(p=>({...p,device:null}))});
    $('jointImportPlan').onchange=guard(async e=>{requireHostEdit();const file=e.target.files[0];if(!file)return;if(file.size>100000)throw Error('El archivo de plano es demasiado grande.');const plan=checkPlan(JSON.parse(await file.text()));plan.points.forEach(p=>p.device=null);s.plan=plan;s.planView=null;s.planPan=null;s.planPinch=null;s.planPointers.clear();s.selected=plan.points[0]?.id;savePlan();e.target.value='';tell('Plano importado. Asigna los móviles a los puntos.');});
    $('jointPointsTable').addEventListener('pointerover',e=>{const row=e.target.closest('[data-row-point]');if(!row)return;const id=row.dataset.rowPoint;for(const tr of $('jointPointsTable').rows)tr.classList.toggle('joint-row-hover',tr===row);for(const node of $('jointPlan').querySelectorAll('[data-point]'))node.classList.toggle('joint-point-hover',node.dataset.point===id);});
    $('jointPointsTable').addEventListener('pointerleave',()=>{for(const tr of $('jointPointsTable').rows)tr.classList.remove('joint-row-hover');for(const node of $('jointPlan').querySelectorAll('[data-point]'))node.classList.remove('joint-point-hover');});
    $('jointPlan').addEventListener('pointerover',e=>{const el=e.target.closest('[data-point]');if(!el)return;for(const tr of $('jointPointsTable').rows)tr.classList.toggle('joint-row-hover',tr.dataset.rowPoint===el.dataset.point);});
    $('jointPlan').addEventListener('pointerleave',()=>{for(const tr of $('jointPointsTable').rows)tr.classList.remove('joint-row-hover');});
    let swipeStart=null;
    $('jointPointsTable').addEventListener('touchstart',e=>{
        const row=e.target.closest('[data-row-point]');
        swipeStart=row&&e.touches.length===1&&!e.target.closest('input,select,button')?{row,x:e.touches[0].clientX,y:e.touches[0].clientY,axis:null}:null;
    },{passive:true});
    $('jointPointsTable').addEventListener('touchmove',e=>{
        if(!swipeStart||e.touches.length!==1)return;
        const dx=e.touches[0].clientX-swipeStart.x,dy=e.touches[0].clientY-swipeStart.y;
        if(!swipeStart.axis&&Math.hypot(dx,dy)>9)swipeStart.axis=Math.abs(dx)>Math.abs(dy)*1.4?'x':'y';
        if(swipeStart.axis!=='x'||s.role!=='host'||running()||s.transaction)return;
        e.preventDefault();
        swipeStart.row.style.transform=`translateX(${Math.max(-76,Math.min(0,dx))}px)`;
    },{passive:false});
    $('jointPointsTable').addEventListener('touchend',e=>{
        if(!swipeStart)return;
        const {row,x,axis}=swipeStart;swipeStart=null;
        const dx=e.changedTouches.length?e.changedTouches[0].clientX-x:0;
        const reveal=axis==='x'&&dx< -55&&s.role==='host'&&!running()&&!s.transaction;
        for(const other of $('jointPointsTable').querySelectorAll('[data-row-point]')){if(other!==row){other.classList.remove('joint-swipe-reveal');other.style.transform='';}}
        row.classList.toggle('joint-swipe-reveal',reveal);row.style.transform=reveal?'translateX(-76px)':'';
    },{passive:true});
    $('jointPointsTable').addEventListener('touchcancel',()=>{if(swipeStart){swipeStart.row.style.transform='';swipeStart=null;}},{passive:true});
    $('jointPointsTable').onclick=guard(e=>{
        const d=e.target.closest('[data-delete-point]');
        if(d){requireHostEdit();const id=d.dataset.deletePoint;s.plan.points=s.plan.points.filter(p=>p.id!==id);s.plan.points.forEach((p,i)=>p.name='P'+(i+1));s.selected=s.plan.points[0]?.id||null;savePlan();return;}
        const b=e.target.closest('[data-select-point]');if(b){s.selected=b.dataset.selectPoint;renderPlan();}
    });
    $('jointPointsTable').addEventListener('focusin',e=>{const row=e.target.closest('[data-row-point]');if(!row)return;s.selected=row.dataset.rowPoint;for(const tr of $('jointPointsTable').rows)tr.classList.toggle('joint-row-selected',tr===row);for(const node of $('jointPlan').querySelectorAll('[data-point]'))node.classList.toggle('selected',node.dataset.point===s.selected);});
    $('jointPointsTable').onchange=guard(e=>{
        const field=e.target.dataset.pointField,id=e.target.dataset.pointId;if(!field||!id)return;
        requireHostEdit();const p=s.plan.points.find(q=>q.id===id);if(!p)return;
        let value=e.target.value;
        if(['x','y','angle'].includes(field)){if(value.trim()==='')throw Error('Introduce un valor.');value=Number(value);if(!Number.isFinite(value))throw Error('Valor no válido.');if(field!=='angle')value=Math.round(value);}
        if(field==='device'){value=value||null;if(value&&s.plan.points.some(q=>q.id!==id&&q.device===value))throw Error('Ese móvil ya está asignado a otro punto.');}
        const candidate={...p,[field]:value};s.plan=checkPlan({...s.plan,points:s.plan.points.map(q=>q.id===id?candidate:q)});s.selected=id;savePlan();if(field==='device')renderDevices();
    });
    $('jointPlan').addEventListener('keydown',guard(e=>{
        const el=e.target.closest('[data-point]');if(!el)return;
        if(e.key==='Enter'||e.key===' '){e.preventDefault();s.selected=el.dataset.point;renderPlan();}
    }));
    $('jointPlan').addEventListener('pointerdown',guard(e=>{
        const svg=$('jointPlan'),el=e.target.closest('[data-point]'),pos=svgPosition(e);s.planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(s.planPointers.size===2){const a=[...s.planPointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;s.planPinch={distance:Math.hypot(dx,dy),view:planViewport(),center:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}};s.drag=null;s.planPan=null;svg.setPointerCapture(e.pointerId);return;}
        if(el){s.selected=el.dataset.point;if(s.role==='host'&&!running()&&!s.transaction){s.drag=s.selected;svg.setPointerCapture(e.pointerId);}renderPlan();}
        else if(s.adding&&pos&&pos.x>=0&&pos.x<=s.plan.length&&pos.y>=0&&pos.y<=s.plan.width)addPoint(pos.x,pos.y);
        else if(s.role==='host'&&!running()&&!s.transaction){s.planPan={x:e.clientX,y:e.clientY,view:planViewport()};svg.setPointerCapture(e.pointerId);}
    }));
    $('jointPlan').addEventListener('pointermove',e=>{
        if(s.planPointers.has(e.pointerId))s.planPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(s.planPinch&&s.planPointers.size>=2){const a=[...s.planPointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y,distance=Math.max(20,Math.hypot(dx,dy)),factor=s.planPinch.distance/distance,base=s.planPinch.view,rect=$('jointPlan').getBoundingClientRect(),box=$('jointPlan').viewBox.baseVal,g=geometry(base),qx=(s.planPinch.center.x-rect.left)/rect.width*box.width,qy=(s.planPinch.center.y-rect.top)/rect.height*box.height,world={x:base.x+(qx-g.left)/g.scale,y:base.y+base.h-(qy-g.top)/g.scale};zoomPlanAt(world,factor,base);renderPlan();return;}
        if(s.drag){const pos=svgPosition(e),p=s.plan.points.find(p=>p.id===s.drag);if(!p||!pos)return;const snapped=snapPlanPosition(pos);p.x=snapped.x;p.y=snapped.y;renderPlan();return;}
        if(s.planPan){const base=s.planPan.view,g=geometry(base);s.planView=planViewport({x:base.x-(e.clientX-s.planPan.x)/g.scale,y:base.y+(e.clientY-s.planPan.y)/g.scale,w:base.w,h:base.h});renderPlan();}
    });
    for(const event of ['pointerup','pointercancel'])$('jointPlan').addEventListener(event,guard(e=>{s.planPointers.delete(e.pointerId);if(s.planPointers.size<2)s.planPinch=null;if(s.drag){s.drag=null;savePlan();}s.planPan=null;}));
    $('jointPlan').addEventListener('wheel',e=>{if(s.role!=='host'||running()||s.transaction)return;e.preventDefault();const before=svgPosition(e);if(!before)return;zoomPlanAt(before,e.deltaY<0?.8:1.25);renderPlan();},{passive:false});
    $('jointDeviceName').onchange=()=>{s.name=$('jointDeviceName').value.trim().slice(0,40)||'Mi móvil';broadcast({type:'HELLO',id:s.id,name:s.name,status:localStatus()});renderDevices();renderPlan();};
    $('jointEnableSensor').onclick=guard(enableSensor);
    $('jointCalibrateX').onclick=guard(()=>startCalibration('x'));
    $('jointCalibrateY').onclick=guard(()=>startCalibration('y'));
    $('jointCalibrateZ').onclick=guard(()=>startCalibration('z'));
    $('jointSkipCalibration').onclick=guard(chooseManualCalibration);
    $('jointManualPlus').onclick=guard(()=>setManualCalibration(1));
    $('jointManualMinus').onclick=guard(()=>setManualCalibration(-1));
    $('jointSyncStart').onclick=guard(startSyncCalibration);
    $('jointSyncGestureX').onclick=guard(()=>startSyncGesture('x'));
    $('jointSyncGestureY').onclick=guard(()=>startSyncGesture('y'));
    $('jointSyncGestureZ').onclick=guard(()=>startSyncGesture('z'));
    $('jointSync').onclick=guard(async()=>{for(const p of s.peers.values())startSync(p);tell('Comprobando el enlace con 24 intercambios. Esto no cambia la calibración física ya validada.');});
    $('jointStart').onclick=guard(startRun);$('jointStop').onclick=()=>stopRun();
    $('jointDownload').onclick=guard(exportSession);$('jointCsv').onclick=guard(exportCsv);$('jointDownloadProcessed').onclick=guard(exportProcessedJson);$('jointCsvProcessed').onclick=guard(exportProcessedCsv);$('jointSendData').onclick=guard(sendRecord);$('jointRecover').onclick=guard(recover);
    $('jointCompareView').onchange=renderComparison;
    $('jointCompareResetZoom').onclick=()=>s.compareCharts?.forEach(chart=>chart.resetZoom('none'));
    $('jointImportSession').onchange=guard(async e=>{
        const file=e.target.files[0];if(!file)return;
        if(file.size>100000000)throw Error('El ensayo JSON es demasiado grande para abrirlo en el navegador.');
        s.compareExport=validComparisonExport(JSON.parse(await file.text()));e.target.value='';renderComparison();tell('Ensayo conjunto cargado para comparación.');
    });
    $('jointNewRun').onclick=guard(()=>{
        if(running()||s.transfer||s.run?.finishing)throw Error('El registro todavía se está cerrando. Espera unos segundos.');
        if(s.run&&!confirm('Descarga antes los resultados. ¿Preparar un nuevo ensayo? El registro local seguirá guardado en este navegador.'))return;
        s.run=null;s.results.clear();$('jointProgress').value=0;$('jointMeasureState').textContent='Preparando dispositivos';$('jointRunTime').textContent='00:00.0';renderPlan();renderDevices();tab('Devices');
    });
    const blockMeasurementTouch=event=>{
        if(running()&&!event.target.closest('#jointStop'))event.preventDefault();
    };
    document.addEventListener('touchstart',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('touchmove',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('pointerdown',blockMeasurementTouch,{capture:true,passive:false});
    document.addEventListener('visibilitychange',()=>{if(running()){incident('visibility',document.hidden?'Página oculta: puede haber huecos de adquisición.':'Página visible de nuevo.');if(!document.hidden)requestWake();}});
    window.addEventListener('beforeunload',e=>{if(running()||s.transfer){e.preventDefault();e.returnValue='';}});
    setInterval(tick,250);
    if(location.hash.startsWith('#joint=')) {
        guard(()=>{open();openPair();$('jointPairInput').value=location.href;$('jointPairStatus').textContent='Invitación cargada. Pulsa Leer código para continuar.';history.replaceState(null,'',location.pathname+location.search);})();
    }
})();
