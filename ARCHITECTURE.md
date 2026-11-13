# Arquitectura de VWOMA

VWOMA es una aplicación web estática para registro de pasarelas, adquisición
de aceleraciones y medidas conjuntas con varios teléfonos. Se publica en
GitHub Pages, sin servidor de aplicación ni proceso de compilación.

## Estructura actual (fase 9 de la refactorización)

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
src/joint/clock-model.js    Ajuste de offset, deriva y RTT, conversiones
                           de reloj y métricas temporales; sin DOM ni red
src/joint/persistence.js    IndexedDB: almacenes runs/chunks, guardado por lotes,
                           recuperación de registros y cierre seguro
src/joint/acquisition.js    Ciclo de medida: muestras, preparación, inicio,
                           parada/cancelación, wake lock y cierre persistente
src/joint/calibration-math.js Filtrado, eliminación de tendencia, signos
                           y correlación de gestos (cálculos puros)
src/joint/calibration-controller.js Calibración de ejes, coordinación
                           de gestos físicos, validación y presentación
src/joint/exports.js       JSON/CSV, malla temporal común, transformaciones
                           estructurales y validación de archivos importados
src/joint/record-transfer.js Transferencia SHA-256 en bloques con ACK/reintentos
src/joint/results-view.js  Presentación de resultados, sincronización y
                           comparación multicanal en Chart.js
src/joint/joint-app.js     Coordinación de pantallas, sensores y mensajes
style.css                  Estilos generales
vwoma-identity.css         Identidad visual
vwoma-i18n.css             Selector de idiomas
vwoma-i18n.js              Traducciones e interfaz multilingüe
tests/pairing.test.cjs     Pruebas del emparejamiento y señalización
tests/preprocessing.test.cjs Pruebas de interpolación, detrend, RMS y remuestreo
tests/plan-controller.test.cjs Pruebas del plano y gestión de puntos
tests/clock-model.test.cjs Modelos de reloj y conversiones temporales
tests/persistence.test.cjs Guardado por lotes, recuperación y fallos IndexedDB
tests/acquisition.test.cjs Pruebas de ciclo de medida, abortos y confirmaciones
tests/calibration-math.test.cjs Filtrado, signos y correlación de retardos
tests/calibration-controller.test.cjs Estados y validación de calibraciones
tests/exports.test.cjs     Esquemas exportados, CSV, mallas y validación
tests/record-transfer.test.cjs Integridad, ACK y transferencia multipaquete
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

Los cálculos de sincronización se separan en `src/joint/clock-model.js`,
que publica `VWOMAClockModel.createClockModel({now,finite})`. El estimador
de cuatro marcas temporales, la selección por RTT bajo, la regresión robusta
de deriva, las conversiones maestro/participante y los diagnósticos mantienen
las expresiones matemáticas originales. La dependencia de `now()` se inyecta
para poder probar con marcas reproducibles. `joint-app.js` conserva el envío
de mensajes SYNC, el estado de la sesión y el valor por defecto de `toMaster`
para no alterar la secuencia de adquisición.

La persistencia se extrae a `src/joint/persistence.js`, cuya factoría
`VWOMAPersistence.createPersistence({...})` recibe explícitamente el nombre de
IndexedDB, el estado del ensayo y las APIs del navegador. Se conservan los
almacenes `runs` y `chunks`, la versión 1, las claves de lotes, la cola de
escritura, los avisos por fallo y el límite de 8 segundos al cerrar el ensayo.
La vista de recuperación continúa en `joint-app.js`, pero lee los registros
mediante `storedRuns()` y `storedChunks()`; así no accede directamente a IndexedDB.
La clave del plano se pasa a `plan-controller.js` como `storageKey` para que
el sitio `/pruebas/` mantenga su plano separado de la página pública.

El ciclo de adquisición conjunta se aloja en `src/joint/acquisition.js`.
`VWOMAAcquisition.createAcquisition({...})` recibe el estado, temporizadores,
reloj, sensores, callbacks de envío/persistencia y una interfaz explícita `ui`.
`joint-app.js` conserva los eventos de presentación, el manejo de DOM y los
metadatos del registro. Las transiciones `armed` → `recording` → `finished`,
los mensajes PREPARE/READY/START_AT/STOP_AT/ABORT, las ventanas temporales y
los márgenes de registro no se modifican. Las funciones de `ui` mantienen
el orden de bloqueo/desbloqueo de la pantalla y actualización de resultados.

La fase 8 aísla la calibración en dos módulos: `src/joint/calibration-math.js`
expone `createMath({median,finite,sampleRate})` con los algoritmos numéricos
de tendencia, filtrado RC bidireccional, detección de lóbulos, corrección de
signos sin intercambio de ejes, interpolación y correlación entre gestos.
`src/joint/calibration-controller.js` recibe ese módulo, el estado y los
callbacks de comunicación/interfaz; mantiene las decisiones de aceptación,
repetición por eje y la calibración física de X, Y y Z.

**Límite científico:** el barrido de desfases se evalúa a incrementos de
1 ms sobre señales interpoladas, pero esto **no garantiza precisión temporal
de 1 ms** en el acelerómetro del navegador. Los umbrales, filtros y factores
existentes permanecen sin alterar y requieren validación instrumental en
móviles reales. Los datos originales y el formato exportado se conservan.
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
node --check src/joint/clock-model.js
node --check src/joint/persistence.js
node --check src/joint/acquisition.js
node --check src/joint/calibration-math.js
node --check src/joint/calibration-controller.js
node --check src/joint/exports.js
node --check src/joint/record-transfer.js
node --check src/joint/results-view.js
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
3. Validar resultados/exportación y transferencia con ensayos físicos;
   después aislar los eventos de la interfaz y preparar setups multipunto.
4. Introducir un único estado coordinador y ciclos de vida explícitos para
   dispositivos, adquisición, transferencias y almacenamiento.
5. Completar pruebas de integración y compatibilidad antes de fusionar.

En todas las fases, mantener `main` estable hasta terminar las comprobaciones.


### Resultados, exportaciones y transferencia (fase 9)

`src/joint/exports.js` encapsula los formatos JSON/CSV existentes,
la creación de la malla temporal común y el procesamiento Z con detrend.
Conserva los esquemas `pasarelas-upm-joint-export-v1` y
`pasarelas-upm-joint-processed-v1`, los nombres de columnas y
`commonPeriodMs` como el máximo período mediano de los participantes.
No cambia la resolución ni la validación científica de las medidas.

`src/joint/record-transfer.js` conserva exactamente los mensajes
`TRANSFER_BEGIN`, `TRANSFER_CHUNK`, `TRANSFER_END` y `TRANSFER_ACK`.
Mantiene trozos de 12000 caracteres, SHA-256, los límites originales,
hasta tres intentos por bloque y confirmaciones por índice. El manejador de
mensajes de `joint-app.js` delega en este controlador.

`src/joint/results-view.js` concentra las pantallas de resultados, gráficos
de RTT/offset y comparación entre teléfonos. Recibe por inyección el módulo
de exportación y las funciones de representación; sigue utilizando Chart.js.
El coordinador principal conserva el manejo de eventos de usuario y
el registro en memoria; el formato, datos y tratamiento de señales
permanecen estables.

La separación por responsabilidades no equivale todavía a desacoplamiento
total. Los controladores comparten el estado del ensayo mediante contratos
explícitos y algunos callbacks diferidos hasta la inicialización completa.


### Fiabilidad de las transferencias entre móviles

El transporte mantiene el protocolo de `TRANSFER_BEGIN`, `TRANSFER_CHUNK`,
`TRANSFER_END`, `TRANSFER_ACK` y SHA-256, con bloques de 12 000 caracteres
y el esquema de registro existente. A diferencia de la implementación inicial,
se permite una ventana limitada de 4 bloques en tránsito, en orden por
DataChannel, para evitar esperar un RTT completo entre cada bloque.
La confirmación de todos los ACK de la ventana se exige antes de avanzar.
Se conservan los tres intentos de cada bloque y el ACK final de integridad.

Durante la transferencia se actualizan porcentajes **sin reconstruir**
los gráficos de RTT/offset, que consumían CPU y podían retrasar los
mensajes de WebRTC en Safari. En el maestro aparece el progreso de
recepción; si el participante pierde la conexión, se conserva el registro
en memoria/IndexedDB cuando está disponible y se muestra explícitamente
el error, con posibilidad de reintentar desde "Enviar datos".

La prueba de integración simula dos extremos, los mensajes originales
WebRTC y una transferencia de muchos bloques, y comprueba el límite
de mensajes, el paralelismo acotado y la conservación del registro si
falla la comunicación. Esto no sustituye la prueba de dos teléfonos reales.

### Diagnóstico exacto de un registro incompatible (13-11-2026)

La prueba real detectó que el maestro rechazaba el registro de un participante
con el mensaje genérico «Registro recibido incompatible». Esa excepción
se producía al verificar metadatos **después** de reconstruir el archivo y
comprobar su SHA-256, de modo que no era prueba de corrupción en tránsito.

La validación distingue ahora entre versión de esquema, identificador de ensayo,
identificador del participante emparejado, identidad de sesión, ausencia de
muestras y límite máximo. El participante comprueba su propio registro
**antes** de comenzar la transferencia. El maestro compara la identidad
anunciada en `TRANSFER_BEGIN` con el `p.id` del enlace WebRTC y, si hay
incompatibilidad, devuelve `TRANSFER_REJECT` con el motivo concreto.
El rechazo interrumpe los reintentos de ACK innecesarios y muestra el motivo
en ambos teléfonos. Un esquema o identificador inesperado **no se reescribe
automáticamente**, para evitar atribuir mediciones al sensor incorrecto.

La respuesta `TRANSFER_REJECT` es una extensión compatible dentro de esta
versión experimental; el resto de mensajes, bloques y validación SHA-256
continúan como antes. Los registros locales y el almacenamiento IndexedDB se
conservan cuando se rechaza una transferencia.

Pruebas añadidas: errores de metadatos diferenciados, prueba del objeto
producido por `runMeta` del código real, rechazo temprano de una identidad
distinta a la del enlace, propagación de rechazos hasta el participante,
integridad incorrecta, recuperación tras errores y mensaje persistente en
Resultados. La causa específica del rechazo observado por el usuario sigue
pendiente de una nueva prueba en móviles reales con estos diagnósticos.
