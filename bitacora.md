# Bitacora de Desarrollo — PFS4 SoilProbe

Proyecto de validacion estadistica de sondas de tierra propias contra sensores comerciales (estandar de oro).

---

## v0.4.0 — 18 de marzo de 2026

### Cambios realizados

Implementacion de la hoja de estilos del frontend, correccion del error critico `ReactCurrentDispatcher` que impedia el renderizado, inicializacion del socket de WebSockets, y blindaje del pipeline de Docker.

### Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `frontend/src/index.css` | Creacion completa — hoja de estilos con paleta morada/blanca/azul |
| `frontend/public/index.html` | Se agregaron meta viewport, theme-color, descripcion y fuente Inter |
| `frontend/src/index.js` | Se agrego `import './index.css'` |
| `frontend/src/App.jsx` | Se reemplazaron clases Tailwind por clases CSS propias; se corrigio inicializacion de socket |
| `frontend/package.json` | Se pinaron `react` y `react-dom` a 18.2.0 exacto; se agregaron `overrides` |
| `frontend/Dockerfile` | Se cambio imagen base a `node:18-alpine`; se agrego `npm dedupe` y verificacion |
| `frontend/.dockerignore` | Creacion — excluye `node_modules`, `build`, `.env` del contexto Docker |

### Descripcion general

**Estilos:** Se creo `index.css` desde cero con un sistema de diseno basado en CSS custom properties (variables). La paleta usa tonos morados (`#4a1d96` a `#f5f3ff`), azules (`#1d4ed8` a `#dbeafe`) y blancos/grises neutros. Se definieron componentes reutilizables: tarjetas (`.card`), contenedor de grafica (`.chart-container`), grid de estadisticas (`.stats-grid`), botones con 3 variantes, inputs, tablas y badges. Todos los elementos interactivos tienen tamano minimo de 44px para accesibilidad tactil. Se incluyo diseno responsive para pantallas menores a 768px y una animacion de entrada `fadeUp` para las tarjetas.

**HTML:** Se actualizo `index.html` para incluir la meta tag `viewport` (requerida para responsive), precarga de la fuente Inter via Google Fonts con `preconnect`, y `theme-color` para la barra del navegador movil.

**Error React:** La aplicacion mostraba pantalla en blanco con el error `Cannot read properties of undefined (reading 'ReactCurrentDispatcher')` en consola. Esto ocurria porque `react-dom` intentaba acceder a los internals de `react` pero obtenia una instancia diferente (duplicada). Se identificaron y corrigieron 3 causas raiz: resolucion de version incorrecta, imagen Docker incompatible, y ausencia de `.dockerignore`.

**Socket:** La variable `socket` se usaba en `App.jsx` sin haber sido creada. Se importaba `io` de `socket.io-client` pero nunca se invocaba `io()`. Esto causaria un `ReferenceError` en tiempo de ejecucion.

### Descripcion tecnica

**CSS (`index.css`)** — El sistema de colores usa custom properties en `:root` para permitir tematizacion centralizada:

```css
:root {
  --purple-900: #4a1d96;   /* Textos principales, hover de botones */
  --purple-700: #6b3fa0;   /* Botones primarios, encabezados h2/h3 */
  --purple-500: #8b5cf6;   /* Focus rings, scrollbar hover */
  --purple-100: #ede9fe;   /* Bordes de tarjetas, separadores */
  --blue-500:   #3b82f6;   /* Botones secundarios */
  --blue-100:   #dbeafe;   /* Fondo degradado (destino) */
}
```

El fondo del body usa un degradado lineal de 135°:

$$\text{background} = \nabla_{135°}\left(\texttt{purple-50},\ \texttt{blue-100}\right)$$

Los botones tienen tres estados visuales con transiciones de 200ms:
- **Normal**: `background: var(--purple-700)`
- **Hover**: `translateY(-1px)` + `box-shadow` con `rgba(74,29,150, 0.25)`
- **Active**: `translateY(0)` (retorno elastico)

Los bigotes del boxplot de outliers de la UI usan el mismo criterio de Tukey definido en `stats.js`:

$$\text{Whisker}_{low} = \max\left(\min(x),\ Q_1 - 1.5 \times IQR\right)$$

El grid de estadisticas usa `auto-fit` con `minmax(280px, 1fr)` para reflow automatico sin media queries dedicadas. Recharts hereda la paleta via overrides de sus clases internas (`.recharts-default-tooltip`, `.recharts-legend-item-text`).

**Error `ReactCurrentDispatcher`** — Cuando webpack empaqueta `react-dom`, este hace internamente:

```js
var React = require('react');
var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
```

Si `require('react')` resuelve a una instancia diferente de React (una copia duplicada en `node_modules`), `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` es `undefined` porque esa copia no fue inicializada por el bundle principal. El error se manifiesta como:

```
TypeError: Cannot read properties of undefined (reading 'ReactCurrentDispatcher')
```

**Causa 1 — Version flotante:** `"react": "^18.2.0"` se resuelve a `18.3.1` en un `npm install` fresco (sin lock file). React 18.3.x reestructuro parcialmente sus internals como puente hacia React 19. `react-scripts@5.0.1` (publicado en diciembre 2022) fue testeado con React 18.2.0 y no con 18.3.x. La combinacion genera conflictos de resolucion de modulos en webpack.

**Correccion:** Se pinaron ambas dependencias a version exacta sin caret:

```json
"dependencies": {
  "react": "18.2.0",
  "react-dom": "18.2.0"
},
"overrides": {
  "react": "18.2.0",
  "react-dom": "18.2.0"
}
```

El campo `overrides` de npm fuerza a **todas** las subdependencias transitivas (incluidas las de `react-scripts`, `recharts`, etc.) a usar exactamente `18.2.0`, eliminando la posibilidad de que npm instale una segunda copia en un `node_modules` anidado.

**Causa 2 — Imagen Docker:** `node:20-alpine` incluye npm 10.x, cuyo algoritmo de resolucion de dependencias difiere del npm 9.x con el que se testeo `react-scripts@5.0.1`. Se cambio a `node:18-alpine` (npm 9.x). Ademas se agrego `npm dedupe` post-install para aplanar el arbol de dependencias, y `npm ls react --all` como verificacion en tiempo de build (debe mostrar una unica entrada `react@18.2.0`).

**Causa 3 — Sin `.dockerignore`:** La instruccion `COPY . .` del Dockerfile copia todo el contexto de build al contenedor. Si existiera un `node_modules` local en el host, pisaria el `node_modules` limpio generado por `npm install` en el paso anterior. Se creo `.dockerignore` excluyendo `node_modules`, `build` y archivos `.env`.

**Socket (`App.jsx`)** — Se importaba `io` de `socket.io-client` pero la variable `socket` se usaba sin inicializar, causando `ReferenceError: socket is not defined`. Se corrigio creando la conexion dentro del `useEffect`:

```js
useEffect(() => {
    const socket = io(BACKEND_URL);
    socket.on('new_sensor_data', (newReading) => { ... });
    return () => {
        socket.off('new_sensor_data');
        socket.disconnect();
    };
}, []);
```

El socket se crea al montar el componente y se desconecta en la funcion de cleanup del effect, evitando conexiones huerfanas al desmontar.

---

## v0.3.0 — 19 de marzo de 2026

### Cambios realizados

Ampliacion del esquema de base de datos para soportar las 7 magnitudes fisicoquimicas completas del suelo.

### Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `db/init.sql` | Se agregaron 4 columnas nuevas al `CREATE TABLE` |
| `backend/src/server.js` | Se actualizaron MQTT handler, POST endpoint y SELECT del endpoint de validacion |
| `backend/src/stats.js` | Se amplio el array de campos del orquestador principal |

### Descripcion general

Se agregaron las columnas `ec` (electroconductividad), `n` (nitrogeno), `p` (fosforo) y `k` (potasio) a la tabla `sensor_readings`. Estas columnas permiten almacenar las lecturas de macronutrientes del suelo que reportan los sensores NPK, ademas de la conductividad electrica. Toda la capa de ingesta (MQTT y REST) y la capa analitica fueron actualizadas para procesar estos nuevos campos de forma automatica.

### Descripcion tecnica

**Base de datos** — Se ejecuto via terminal:

```sql
ALTER TABLE sensor_readings
ADD COLUMN ec NUMERIC(6, 2),  -- Electroconductividad (mS/cm o uS/cm)
ADD COLUMN n  NUMERIC(6, 2),  -- Nitrogeno (mg/kg o ppm)
ADD COLUMN p  NUMERIC(6, 2),  -- Fosforo
ADD COLUMN k  NUMERIC(6, 2);  -- Potasio
```

Y se actualizo `init.sql` para reflejar las columnas en futuros despliegues limpios.

**Backend (`stats.js`)** — El array de campos del orquestador `calculateFullValidation` paso de:

```js
['temperature', 'humidity', 'ph']
```

a:

```js
['temperature', 'humidity', 'ph', 'ec', 'n', 'p', 'k']
```

Dado que todas las funciones estadisticas (t-test, boxplot, Pearson, RMSE, bias, MAE) son genericas y reciben el nombre del campo como parametro string, no fue necesario modificar ninguna logica de calculo. El pipeline completo se propaga automaticamente para los 7 campos.

**Backend (`server.js`)** — El handler MQTT ahora usa una funcion auxiliar `avg(arr)` que promedia cualquier array del payload de forma segura (retorna `null` si el array no existe). El INSERT paso de 5 a 9 columnas. El SELECT del endpoint `/api/stats/validation` ahora incluye `r.ec, r.n, r.p, r.k`. El endpoint POST tambien acepta los 4 campos nuevos en el body de la solicitud.

---

## v0.2.0 — 19 de marzo de 2026

### Cambios realizados

Reestructuracion completa del motor estadistico: se reemplazo el emparejamiento por ventana de tiempo (60s) por un modelo de **analisis por fases experimentales** con prueba T de Student.

### Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `db/init.sql` | Se agrego columna `test_condition` e indice |
| `backend/src/stats.js` | Reescritura completa |
| `backend/src/server.js` | Se actualizaron imports, MQTT handler, endpoints POST y GET validation |

### Descripcion general

El enfoque anterior comparaba sensores usando buckets temporales de 60 segundos. El nuevo modelo se basa en **fases experimentales** (ej. `baseline`, `30ml`, `60ml`) donde cada fase representa una condicion controlada de la tierra de prueba. Se agrego la columna `test_condition` a la base de datos para etiquetar cada lectura con su fase correspondiente.

El analisis ahora se ejecuta en dos pasos:

1. **Paso 1 (Aislamiento)**: Para cada fase, se calculan estadisticas independientes de cada sensor para verificar estabilidad electrica. Se ejecuta una prueba T de Welch para determinar si las medias son estadisticamente iguales.

2. **Paso 2 (Comparacion cruzada)**: Se toman las medias de todas las fases y se calculan Pearson, RMSE y sesgo sobre ellas, evaluando si la sonda reacciona proporcionalmente a los cambios de condicion.

### Descripcion tecnica

**Nueva columna en BD:**

```sql
test_condition VARCHAR(50)  -- 'baseline', '30ml', '60ml', etc.
```

Con indice `idx_sensor_readings_condition` para consultas eficientes agrupadas por fase.

**Funciones nuevas en `stats.js`:**

**Prueba T de Welch** (`welchTTest`) — Muestras independientes, dos colas. Determina si la diferencia entre medias de la sonda comercial y la propia es estadisticamente significativa.

$$t = \frac{\bar{X}_1 - \bar{X}_2}{\sqrt{\frac{s_1^2}{N_1} + \frac{s_2^2}{N_2}}}$$

Grados de libertad por la ecuacion de Welch-Satterthwaite:

$$df = \frac{\left(\frac{s_1^2}{N_1} + \frac{s_2^2}{N_2}\right)^2}{\frac{\left(\frac{s_1^2}{N_1}\right)^2}{N_1 - 1} + \frac{\left(\frac{s_2^2}{N_2}\right)^2}{N_2 - 1}}$$

**Criterio de decision**: Si $p > 0.05$, no existe diferencia estadistica significativa entre las medias de ambos sensores para esa fase experimental.

El p-value se calcula numericamente a partir de la distribucion t usando la **funcion beta incompleta regularizada** $I_x(a,b)$, implementada con:
- Aproximacion de **Lanczos** para $\ln\Gamma(z)$
- Fracciones continuas de **Lentz** para $B_{cf}(a,b,x)$ (metodo de Numerical Recipes, convergencia en ~200 iteraciones con $\epsilon = 3 \times 10^{-12}$)

La relacion es:

$$p\text{-value} = I_x\left(\frac{df}{2},\ \frac{1}{2}\right),\quad x = \frac{df}{df + t^2}$$

**Boxplot** (`calculateBoxplotStats`) — Calcula Q1, Q2 (mediana), Q3 via `math.quantileSeq`, IQR, bigotes y outliers:

$$\text{Whisker}_{low} = \max\left(\min(datos),\ Q_1 - 1.5 \times IQR\right)$$
$$\text{Whisker}_{high} = \min\left(\max(datos),\ Q_3 + 1.5 \times IQR\right)$$

Puntos fuera de los bigotes se reportan como outliers.

**Analisis por fase** (`calculatePhaseAnalysis`) — Agrupa lecturas por `test_condition`, separa `commercial` vs `custom_probe`, y para cada fase calcula: stats descriptivas, boxplot, prueba T, y MAE (offset de calibracion = $|\bar{X}_{comercial} - \bar{X}_{propia}|$).

**Validacion cruzada** (`calculateCrossPhaseValidation`) — Extrae las medias $\bar{X}$ de cada fase y aplica Pearson, RMSE y analisis residual sobre el vector de medias. Genera datos para scatter plot y Bland-Altman usando promedios por fase.

**Endpoint `/api/stats/validation`** — Reescrito para filtrar solo lecturas con `test_condition IS NOT NULL`. Ya no usa `pairByTimeWindow`. El payload MQTT del ESP32 ahora debe incluir el campo `condicion` para etiquetar la fase.

---

## v0.1.0 — 19 de marzo de 2026

### Cambios realizados

Creacion del motor estadistico de validacion (`stats.js`) y endpoint `/api/stats/validation` con emparejamiento temporal por ventana de tiempo.

### Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `backend/src/stats.js` | Creacion / reescritura completa (reemplazo distribucion binomial) |
| `backend/src/server.js` | Se agregaron imports y endpoint `/api/stats/validation` |

### Descripcion general

Se reemplazo el `stats.js` original (que solo tenia estadisticas descriptivas basicas y una funcion de distribucion binomial) por un motor de validacion de hardware que compara la sonda propia contra el sensor comercial. El backend sincroniza temporalmente las lecturas de ambos sensores agrupandolas en buckets de N segundos, y luego aplica metricas de error y correlacion sobre los pares resultantes.

### Descripcion tecnica

**Emparejamiento temporal** (`pairByTimeWindow`) — Agrupa lecturas de ambos sensores en buckets de `windowMs` milisegundos (default 60,000ms). Dentro de cada bucket, promedia los valores de cada sensor. Solo genera un par cuando ambos sensores tienen datos en la misma ventana.

> Nota: Esta funcion fue reemplazada en v0.2.0 por el modelo de fases experimentales.

**RMSE (Root Mean Square Error):**

$$RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(x_{comercial,i} - x_{propio,i})^2}$$

Criterio de viabilidad: $RMSE_{temp} < 0.5°C$ indica sonda altamente viable.

**MAE (Mean Absolute Error):**

$$MAE = \frac{1}{n}\sum_{i=1}^{n}|x_{comercial,i} - x_{propio,i}|$$

**Coeficiente de Correlacion de Pearson ($r$):**

$$r = \frac{\sum_{i=1}^{n}(x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^{n}(x_i - \bar{x})^2 \sum_{i=1}^{n}(y_i - \bar{y})^2}}$$

Criterio de viabilidad: $r \ge 0.95$ indica que el sensor reacciona proporcionalmente. Si el valor absoluto tiene offset pero $r$ es alto, el sensor funciona bien y solo necesita calibracion por software.

**Analisis residual / Sesgo (Bias):**

$$e_i = x_{propio,i} - x_{comercial,i}$$

Si la distribucion de errores $e$ esta centrada en 0, el sensor es exacto. Si esta centrada en un valor $c \neq 0$, existe un sesgo sistematico corregible.

Limites de acuerdo de Bland-Altman:

$$\text{Limite superior} = \bar{e} + 1.96 \times \sigma_e$$
$$\text{Limite inferior} = \bar{e} - 1.96 \times \sigma_e$$

Si el 95% de los puntos caen dentro de estos limites, la sonda esta validada con significancia estadistica.

**Datos para visualizacion:**
- `generateScatterData` — Pares $\{x_{comercial}, x_{propio}\}$ para scatter plot de correlacion (la nube deberia alinearse sobre la recta $y = x$).
- `generateBlandAltmanData` — Pares $\left(\frac{x_c + x_p}{2},\ x_p - x_c\right)$ para el plot de Bland-Altman.

**Endpoint GET `/api/stats/validation`** — Acepta parametros `?window=60&from=ISO&to=ISO`. Consulta la BD, separa por tipo de sensor (`commercial` / `custom_probe`), empareja por ventana temporal, y devuelve metricas completas para temperatura, humedad y pH.

---

## Estructura actual del proyecto

```
pfs4_soilprobe/
├── db/
│   └── init.sql                 -- Esquema PostgreSQL (sensors + sensor_readings)
├── backend/
│   ├── package.json             -- Dependencias: express, pg, mqtt, socket.io, mathjs
│   └── src/
│       ├── server.js            -- API REST + MQTT bridge + WebSockets
│       └── stats.js             -- Motor estadistico de validacion
├── frontend/
│   ├── package.json
│   ├── Dockerfile
│   ├── .dockerignore            -- Excluye node_modules del build Docker
│   ├── public/index.html
│   └── src/
│       ├── App.jsx              -- Dashboard React + Recharts
│       ├── index.js
│       └── index.css            -- Hoja de estilos (paleta morada/blanca/azul)
├── .env                         -- Variables de entorno (PostgreSQL, puertos)
└── bitacora.md                  -- Este archivo
```

## Campos de medicion actuales

| Campo | Columna DB | Tipo | Unidad |
|---|---|---|---|
| Temperatura | `temperature` | `NUMERIC(5,2)` | C |
| Humedad | `humidity` | `NUMERIC(5,2)` | % |
| pH | `ph` | `NUMERIC(4,2)` | - |
| Electroconductividad | `ec` | `NUMERIC(6,2)` | mS/cm o uS/cm |
| Nitrogeno | `n` | `NUMERIC(6,2)` | mg/kg (ppm) |
| Fosforo | `p` | `NUMERIC(6,2)` | mg/kg (ppm) |
| Potasio | `k` | `NUMERIC(6,2)` | mg/kg (ppm) |
