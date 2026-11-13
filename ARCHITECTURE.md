# Arquitectura de VWOMA

VWOMA es una aplicación web estática para registro de pasarelas, adquisición
de aceleraciones y medidas conjuntas con varios teléfonos. Se publica en
GitHub Pages, sin servidor de aplicación ni proceso de compilación.

## Estructura actual (fase 10 de la refactorización)

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
src/joint/session-state.js Estado inicial de sesión y estructuras por ensayo
src/joint/ui-events.js     Enlaces DOM, tabla de puntos, gestos táctiles y SVG
src/joint/joint-app.js     Orquestación de pantallas, sensores y mensajes
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
`src/joint/ui-events.js` contiene los listeners de gesto del plano, mientras
que `joint-app.js` conserva las decisiones de negocio y orquestación. Se carga el controlador
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
   la transferencia incompatible se corrigió y su funcionamiento fue confirmado
   por el usuario el 13 de noviembre de 2026.
4. Preparar setups multipunto sobre módulos de estado y eventos aislados.
5. Introducir un único estado coordinador y ciclos de vida explícitos para
   dispositivos, adquisición, transferencias y almacenamiento.
6. Completar pruebas de integración y compatibilidad antes de fusionar.

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


### Corrección de la preview: formato de registro vs. almacenamiento (13-11-2026)

**Causa raíz confirmada:** la publicación de `/pruebas/` aplicaba
`replaceAll('upm-joint-v1','upm-joint-vwoma-preview-v1')` sobre todo
`joint-app.js`. Esa sustitución no solo aislaba IndexedDB: también
transformaba el esquema del registro de
`pasarelas-upm-joint-v1` a
`pasarelas-upm-joint-vwoma-preview-v1`.
El receptor de WebRTC exigía la versión original. El participante ya
fallaba en su validación local y por eso informaba
«Registro local conservado. Registro incompatible: versión del formato
no reconocida». El problema no era el sensor ni la conexión.

`scripts/preview-config.cjs` sustituye **exclusivamente** tres
expresiones concretas: nombre de base IndexedDB, clave de escritura
del plano y clave de lectura del plano. Mantiene idéntico el protocolo
y exige que `runMeta()`, la validación de registros y la señalización
de transferencia coincidan en `pasarelas-upm-joint-v1`.
`tests/preview-config.test.cjs` reproduce expresamente la antigua
sustitución global y exige que sea rechazada por las pruebas.

El historial de ensayos ya guardados bajo el esquema experimental
erróneo se puede **descargar desde Recuperar**: solo al exportarlos
se normaliza esa variante conocida al esquema correcto,
preservando las muestras y la identidad de cada dispositivo.
No se altera silenciosamente el almacenamiento IndexedDB original.
Este procedimiento no convierte archivos arbitrarios ni atribuye un
registro a otro teléfono. La pantalla y el mecanismo de recuperación
siguen requiriendo comprobación manual real en los móviles.

### Extracción de estado y eventos de la interfaz (fase 10, 13-11-2026)

La última corrección de transferencia fue probada por el usuario en móviles.
Sobre ese punto estable se extrajeron dos módulos clásicos y sin dependencias:

- `src/joint/session-state.js` construye un estado independiente por instancia,
  con los mismos valores iniciales, Maps, arrays y colas de escritura.
- `src/joint/ui-events.js` registra exactamente los mismos eventos de botones,
  tabla con Scroll Snap y gestos de desplazamiento/pellizco del plano.
  Recibe callbacks del coordinador, sin implementar WebRTC, adquisición,
  almacenamiento ni esquemas de exportación.

`joint-app.js` mantiene la creación de sesión y el acceso a la clave de plano
para que la generación de `/pruebas/` siga aislando los datos sin sustituir
accidentalmente el formato científico. Se conservan los mensajes WebRTC,
identificadores, formato JSON/CSV, fórmulas y límites de adquisición.

Los tests verifican estado por instancia, registro de eventos, orden de carga,
syntax de nuevos scripts y compatibilidad de la generación experimental.
La interfaz móvil real todavía requiere un recorrido manual por plano,
papelera, zoom, adquisición, resultados y reintento de transferencia.

### Interfaz móvil y coherencia de gráficos (13-11-2026)

Las pestañas usan una barra horizontal estable y conservan la vista visible
al alternar entre paneles. Durante una adquisición el panel de Medir queda
fijado a la ventana del teléfono, evitando el salto al principio de la página
en Chrome Android; el registro continúa con los gestos bloqueados.

Las gráficas de Comparar mantienen los ejes estructurales X/Y/Z y el criterio
original de marcas temporales y detrend. Se igualan las opciones de gráfica
con Realizar medida: tiempo desde cero, límites Y simétricos con margen 20%,
zoom y reinicio global/individual, etiquetas y colores. No se destruyen las
gráficas locales ni se redibujan mientras están ocultas. En dispositivos
táctiles se deshabilita el arrastre en comparación para permitir el scroll
natural con un dedo; se conserva el zoom de dos dedos y el reinicio.

Nuevo control común "Valores: ocultos / visibles", desactivado por defecto,
para habilitar los indicadores de Chart.js en todas las gráficas. Su ajuste
se mantiene únicamente en el almacenamiento local de la versión experimental.

La vista Comparar reutiliza gráficas existentes cuando no han cambiado el ensayo,
los dispositivos, las muestras ni el modo de representación. Conserva el zoom
y evita recalcular y volver a dibujar grandes series en cada cambio de pestaña.

### Fecha automática y gestos idénticos en Comparar (13-11-2026)

El ensayo individual empieza por el botón Iniciar; la descripción es opcional.
Si se deja vacía, después de obtener el sensor se asigna una fecha/hora local
YYYY-MM-DD HH:mm:ss. En captura, Detener sigue siendo el último control.

Las gráficas de Comparar tienen el pan horizontal con un dedo habilitado en
Android y Safari como el ensayo individual, con el mismo zoom XY, acotación
de ejes, formato de ticks y callback para mantener Y centrada.

Se elimina el interruptor de valores: la lectura se muestra al pulsar y
se descarta al iniciar otro gesto de arrastre, zoom, toque o rueda.

### Lectura de valores en gráficas móviles (13-11-2026)

Las pulsaciones breves se procesan directamente como Pointer Events (con
alternativa touchend en navegadores anteriores), con una tolerancia de 15 píxeles
para distinguirlas de un arrastre. La selección no requiere pulsar encima del
punto. Se construye un evento normalizado de Chart.js con `native:null` y
coordenadas propias del canvas; la selección previa podía fallar porque Chart.js
trataba las coordenadas como si fueran un evento del DOM. El gesto de pellizco,
arrastre o rueda oculta la etiqueta sin interceptar la navegación.

### Corrección de pulsaciones que ocultaban el valor (13-11-2026)

Un mismo toque podía producir `pointerup` seguido de un `click` sintético
que Chart.js procesaba por su cuenta, vaciando el tooltip recién seleccionado.
Se desactivó la gestión automática de eventos del plugin tooltip en todas las
gráficas, incluida Comparar, conservando su presentación mediante
`setActiveElements`. El controlador compartido se ocupa exclusivamente de
mostrar y retirar los valores. Comenzar una pulsación dentro de una gráfica
ya no oculta el valor anterior: solo se sustituye tras una selección válida,
o desaparece al arrastrar, pellizcar, hacer zoom o tocar fuera del canvas.
Las pruebas reproducen la secuencia `pointerdown → pointerup → click` y los
toques repetidos en iOS/Android.

### Medida conjunta con un único acelerómetro (13-11-2026)

Cuando el maestro no tiene participantes conectados, «Medir» ofrece
«Iniciar solo con el maestro». Se siguen exigiendo acelerómetro activo,
página visible, punto asignado, calibración de signos XYZ y duración válida.
La validación física entre relojes y los mensajes PREPARE/READY/START_ACK
se omiten exclusivamente cuando el número de participantes activos es cero.

El inicio conserva la cuenta atrás de 4 s y usa el mismo ciclo de adquisición,
almacenamiento y exportación JSON/CSV. Una copia del plano de ese ensayo
elimina asignaciones a antiguos dispositivos desconectados, mientras el plano
editable conserva los puntos para ensayos posteriores. El resultado contiene
un solo registro, y Comparar presenta las tres componentes del maestro con
una única curva por eje. Con participantes conectados se sigue exigiendo
sincronización física y se mantiene intacto el protocolo WebRTC.

Comparar presenta el nombre del único acelerómetro (incluidos registros JSON
importados), con una sola serie por componente X/Y/Z; no exige un segundo
registro para mostrar las curvas.

### Componente continua en comparación de señales (13-11-2026)

La vista `Comparar` aplica **detrend de orden 0** de forma independiente
a cada una de las componentes **X, Y y Z** de cada registro (maestro y
participantes), restando su media aritmética dentro de la ventana de ensayo
representada. Se realiza tras seleccionar las marcas originales o interpolar
a la rejilla común, y **antes** del diezmado gráfico a 4500 puntos; la
reducción de muestras no sesga la estimación de la media. No se resta
ninguna recta ni se modifica la pendiente física de la señal.

La modificación solo afecta a la visualización: no altera las muestras
originales, el formato JSON, el CSV bruto ni el procesamiento de exportación
ya existente (que conserva su detrend lineal de Z).

### Calibración guiada con demostración de un solo ciclo (13-11-2026)

Los gestos XYZ quedan bloqueados hasta pulsar «Calibrar ejes» y terminar
una introducción de 2,2 s con el mensaje superpuesto «EJEMPLO: haz un SOLO
movimiento de ida y vuelta con el móvil en CADA EJE». A continuación se
representa una sola ida y vuelta en X durante 3 s. Después se muestra el
teléfono inmóvil en el centro y se habilitan los tres gestos XYZ.

Cada eje mantiene 3 s de reposo para estimar la continua y registra 3,6 s
(un ciclo de 3 s más 0,6 s de tolerancia). El vídeo SVG se activa solamente
al aparecer «¡AHORA!» y vuelve al reposo al terminar. Las versiones de
un ciclo se generan a partir de los SVG originales cambiando únicamente
`repeatCount` y `fill`; los gráficos SVG de sincronización entre
móviles no se modifican. El filtrado y la detección de lóbulos permanecen
intactos.

### Lectura y velocidad de la demostración (13-11-2026)

La instrucción de calibración se muestra **5 segundos**. Después se ve
«OBSERVA» durante **1,1 segundos**, todavía con el móvil inmóvil.
A continuación, un solo movimiento de ida y vuelta en X dura **2,8 segundos**
(ligeramente más rápido que los 3 s anteriores) y el dibujo queda en reposo.
El mismo ciclo de 2,8 segundos se usa para los gestos X/Y/Z.
La adquisición sigue capturando 3,6 s después de la referencia en reposo
de 3 s: 0,8 s de margen después del ejemplo animado.
Solo se cambian duración, repetición y atributos de animación; no se alteran
la geometría del teléfono, los ejes ni los SVG de sincronización.
Se versionan las URL de los SVG para invalidar caché en Safari y Chrome.

### Ciclos más rápidos y cuenta atrás fuera del centro (13-11-2026)

Los SVG de ejemplo y de cada gesto de los ejes X/Y/Z duran ahora **2 s por
una sola ida y vuelta**, sin modificar la geometría ni los ejes. Tras la cuenta
atrás de 3 s para la referencia en reposo, se registran 2,6 s de aceleraciones
(2 s de movimiento más 0,6 s de margen). Se mantiene el mensaje inicial de 5 s
y «OBSERVA» de 1,1 s.

«QUIETO · 3, 2, 1» y «¡AHORA!» se muestran en la **esquina superior
derecha del propio dibujo**, con márgenes, tamaño compacto y animación
de escala anclada a esa esquina; dejan de tapar el teléfono central.
Los SVG originales y el mecanismo de sincronización entre móviles no cambian.

### Cabecera simplificada de calibración (13-11-2026)

El distintivo «Pendiente» junto a «Corregir el sentido de los ejes»
se sustituye por un único botón secundario «Omitir calibración»,
alineado a la derecha del título. «Calibrar ejes» sigue siendo la acción
principal inmediatamente debajo de la cabecera. El botón de omisión
reutiliza el procedimiento manual existente: muestra bajo la cabecera la
elección explícita de factor +1 o −1 para los tres ejes, sin omitir la
asignación de signos. No se duplican botones ni se altera el formato de
los registros. Si la omisión se elige durante la demostración, esta se
cancela; el botón principal se oculta hasta que se elija el factor.

### Rediseño de calibración en móviles (13-11-2026)

Se elimina el diseño que colocaba «Omitir calibración» al lado del
título y comprimía la explicación en Safari iPhone. El encabezado y
su texto de ayuda ocupan todo el ancho. Debajo hay dos botones con
anchos iguales, «Calibrar ejes» (principal) y «Omitir calibración»
(secundario). Por debajo de 350 px se apilan. Durante la demostración,
si solo queda visible Omitir se alinea a la derecha. Al elegir omitir,
se oculta la fila y aparece el selector manual de signos, sin huecos.
No cambia la adquisición, la física de calibración ni el protocolo.

### Corrección de colisión con el encabezado global (13-11-2026)

La tarjeta de calibración usaba un elemento HTML `<header>` interno
que heredaba erróneamente las reglas globales `header` y `header p`.
Esto generaba el gran panel azul en Safari y hacía que el contenido
desbordara el ancho del móvil, especialmente al elegir «Omitir».
Se sustituye por un `<div class="joint-calibration-head">`, semánticamente
suficiente porque la sección conserva su `aria-labelledby`. Además, todos
los estilos del encabezado principal se limitan a `body > header` y
`body.recording-lock > header`, para impedir regresiones similares.
No cambian la lógica manual de signos, la animación ni el protocolo.
