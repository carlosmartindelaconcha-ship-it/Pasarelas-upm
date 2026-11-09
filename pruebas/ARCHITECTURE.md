# Arquitectura de VWOMA

VWOMA es una aplicación web estática para registro de pasarelas, adquisición
de aceleraciones y medidas conjuntas con varios teléfonos. Se publica en
GitHub Pages, sin servidor de aplicación ni proceso de compilación.

## Estructura actual (fase 4 de la refactorización)

```text
index.html                 HTML y orden de carga
app.js                     Registro e inspección, adquisición individual,
                           gráficas y adaptación a cálculos espectrales
src/signal/preprocessing.js Interpolación, regularización, detrend y RMS; módulo puro
src/signal/spectra.js      FFT, espectro de amplitudes y PSD Welch; módulo puro
src/joint/plan-controller.js Plano, geometría, puntos, tabla y dibujo SVG;
                           controlador con dependencias explícitas
src/joint/webrtc-transport.js Protocolo QR/SDP, conexiones WebRTC, ICE/STUN,
                           canales de datos y diagnósticos de emparejamiento
src/joint/joint-app.js     Orquestación: eventos del plano y dispositivos,
                           sincronización, calibración, adquisición,
                           almacenamiento, resultados y exportación
style.css                  Estilos generales
vwoma-identity.css         Identidad visual
vwoma-i18n.css             Selector de idiomas
vwoma-i18n.js              Traducciones e interfaz multilingüe
tests/pairing.test.cjs     Pruebas del emparejamiento y señalización
tests/preprocessing.test.cjs Pruebas de interpolación, detrend, RMS y remuestreo
tests/plan-controller.test.cjs Pruebas del plano y gestión de puntos
tests/spectra.test.cjs     Pruebas numéricas de FFT, espectro y Welch
tests/architecture.test.cjs Contrato de integración entre scripts
```

### Contrato de integración

Esta primera fase **separa archivos, pero no elimina todavía el acoplamiento**.
El cálculo espectral se extrae a `src/signal/spectra.js`, que publica
`globalThis.VWOMASpectra` en navegador y `module.exports` en Node.
De igual forma, `src/signal/preprocessing.js` publica
`globalThis.VWOMAPreprocessing` y expone sus funciones mediante CommonJS
para probarlas sin navegador. Los nombres de funciones originales permanecen
accesibles mediante adaptadores en `app.js`.
El procesamiento conserva exactamente las funciones FFT, espectro y Welch
anteriores. `app.js` mantiene los nombres antiguos como adaptadores.
`src/signal/preprocessing.js` y `src/signal/spectra.js` se cargan
antes que `app.js` y no dependen de la interfaz, la red ni el almacenamiento.
El plano está separado en `src/joint/plan-controller.js`. Su factoría
`VWOMAPlan.createController({...})` recibe estado, límites, acceso DOM,
comprobaciones y callbacks de persistencia/dispositivos; conserva la lógica
existente de creación, validación, dibujo y borrado de puntos.
`src/joint/joint-app.js` todavía contiene los listeners de gesto del plano,
pero ya no contiene el controlador del plano. Se carga el controlador
entre `app.js` y `src/joint/joint-app.js`.

La comunicación WebRTC se traslada a `src/joint/webrtc-transport.js`.
`VWOMATransport.createTransport({...})` recibe explícitamente el estado,
el reloj, los callbacks de sincronización y las funciones de UI.
No se cambian los mensajes, modos de red, parámetros ICE/STUN, códigos QR,
tiempos de espera ni diagnósticos. Se carga entre `plan-controller.js` y
`joint-app.js`. El módulo sigue acoplado al estado del ensayo por diseño:
será objeto de fases posteriores con contratos más estrechos.
Para evitar cambios de comportamiento, `app.js` y
`src/joint/joint-app.js` son *scripts clásicos* (no ES modules) y se cargan
en ese orden con `defer`. En el ámbito global de la página, un script
clásico posterior puede utilizar identificadores de nivel superior de otro
script clásico anterior.

El módulo de medida conjunta utiliza todavía funciones y variables
de la aplicación heredada, entre ellas:

- `calculateSpectrum`
- `mainMenu`, `testForm`
- `createAccelerationChart`, `createSpectrumChart`,
  `createPsdChart`, `createRmsChart`
- `accelerationChart`, `spectrumChart`, `psdChart`, `rmsChart`
- `enableLegendToggling`

**No convertir ninguno de los dos scripts a `type="module"` por separado.**
Hacerlo requeriría diseñar e implementar explícitamente esos contratos
mediante importaciones/exportaciones o APIs. Tampoco hay que alterar el
orden de las etiquetas `script` sin revisar sus dependencias.

La extracción fue textual, sin modificar los algoritmos, las estructuras
de datos, el modelo temporal, la configuración ICE ni los eventos de UI.
En la primera fase, el contenido de los dos scripts concatenados reproducía
exactamente el `app.js` original antes de extraer las funciones matemáticas
(9 de noviembre de 2026).

## Pruebas

Las pruebas automatizadas no necesitan dependencias externas:

```sh
node --check src/signal/preprocessing.js
node --check src/signal/spectra.js
node --check app.js
node --check src/joint/plan-controller.js
node --check src/joint/webrtc-transport.js
node --check src/joint/joint-app.js
node --check vwoma-i18n.js
node --test tests/*.test.cjs
```

Las pruebas de emparejamiento sustituyen WebRTC por dobles de prueba.
No verifican una conexión real entre dispositivos.

Antes de fusionar con `main`, se necesita una prueba manual de humo
en móvil (especialmente Safari iOS y Chrome Android):

1. Inicio, cambio de idioma, navegación e identidad visual.
2. Registro de pasarela y toma de imágenes; acceso GPS cuando proceda.
3. Adquisición individual: permisos, señales, FFT/PSD, parada y exportaciones.
4. Plano de medida conjunta: añadir y borrar puntos, deslizamiento,
   pellizco, selección, zoom y persistencia.
5. Dos dispositivos: intercambio de códigos/QR, enlace local/STUN, estados
   y diagnósticos, calibraciones y medidas sincronizadas.
6. Resultados, importación, exportación, recuperación y ensayo repetido.

## Siguientes fases propuestas

1. Cubrir con pruebas deterministas las funciones puras de procesamiento
   (interpolación, eliminación de tendencia, FFT y Welch).
2. Ampliar pruebas numéricas y de integración para preprocesamiento y FFT.
3. Desacoplar los modelos de reloj y sincronización, y después los
   eventos del plano, setups futuros y persistencia respecto a WebRTC.
4. Introducir un único estado coordinador y ciclos de vida explícitos para
   dispositivos, adquisición, transferencias y almacenamiento.
5. Completar pruebas de integración y compatibilidad antes de fusionar.

En todas las fases, mantener `main` estable hasta terminar las comprobaciones.
