# Arquitectura

## 1. Evaluación (paso 02): ¿agente, automatización o código?

| Opción | Cómo sería | Costo | Veredicto |
|---|---|---|---|
| **Agente de IA** (Claude navegando Instagram) | Le pides "analiza estos 20 perfiles" y navega | Alto por cada análisis (tokens + tiempo), lento, resultados no repetibles | ❌ No tiene sentido: el cálculo es determinista, no necesita razonar |
| **Automatización en la nube** (Apify, scrapers de pago) | Un actor extrae perfiles y se calcula en una hoja | ~US$ 1–3 por cada 1.000 posts, recurrente; sin la vista sobre la cuadrícula | ❌ Cuesta por uso y pierde la experiencia visual que quieres |
| **Código: extensión de Chrome propia** | Lee los datos con tu sesión de Instagram y calcula todo en tu navegador | US$ 0 recurrente; solo tiempo de desarrollo | ✅ **Elegida** |

Razones: es lo que ya probó que funciona (Viralytics), no tiene costo por uso, los datos nunca salen de tu equipo y permite la experiencia visual sobre Instagram.

IA solo donde aporta: **transcripción local con Whisper** (gratis, en tu equipo). Opcional a futuro: resumir patrones de ganchos con un modelo de IA (con costo por uso), fuera de v1.

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework de extensión | **WXT** (Manifest V3) | Estándar actual para extensiones: recarga en caliente, entrypoints por archivo, UI en Shadow Root (`createShadowRootUi`) para que Instagram no rompa nuestros estilos ni al revés, build para Chrome/Edge/Brave |
| Lenguaje | TypeScript | Menos errores en el cálculo y en las respuestas de Instagram |
| UI | React + Tailwind | Panel complejo (grillas, filtros, gráficas) |
| Gráficas | Chart.js (o Recharts) | Línea en el tiempo, histograma, mapa de calor |
| Base de datos local | **IndexedDB vía Dexie** + permiso `unlimitedStorage` | Miles de posts por perfil; `chrome.storage` se queda corto |
| Excel | ExcelJS | Varias hojas, formato, enlaces |
| Transcripción | transformers.js + Whisper en documento offscreen (WebGPU / WASM) | Gratis y privado |
| Pruebas | Vitest (fórmula y parsers) + prueba manual guiada en Instagram | La fórmula se prueba con datos fijos |

Versiones exactas fijadas en `roadmap.md` (verificadas en npm el 22-11-2026).

## 3. Costos

| Concepto | Costo |
|---|---|
| Licencias, servidores, APIs | **US$ 0** |
| Modelo Whisper | Gratis; se descarga una vez (~80–150 MB) en cada equipo |
| Cuenta secundaria de Instagram | Gratis |
| Publicar en la Web Store | No aplica (US$ 5 únicos si algún día se quisiera) |
| Mantenimiento | Tiempo: Instagram cambia sus consultas internas varias veces al año |

## 4. Componentes (paso 04)

```
┌──────────── Pestaña de Instagram ────────────┐      ┌──── Pestaña "Centro" (página de la extensión) ────┐
│ Content script                                │      │ Clientes · Ranking del nicho · Comparar          │
│  ├─ Badges + chip en la cuadrícula            │      │ Colecciones · Cola de escaneo · Ajustes          │
│  ├─ Panel lateral (Shadow DOM, React)         │      │ Exportar Excel/CSV · Importar/Exportar base      │
│  └─ Lector de Instagram (fetch con sesión)    │      └───────────────────────┬──────────────────────────┘
└───────────────┬───────────────────────────────┘                              │
                │ mensajes tipados                                             │ lee directo
                ▼                                                              ▼
        Service worker ─────────────── IndexedDB (Dexie) ◄──────────── Motor de métricas (TS puro)
         ├─ Cola de escaneo + chrome.alarms (reanuda)
         ├─ Notificaciones
         └─ Documento offscreen: Whisper (transcripción)
```

| Pieza | Responsabilidad | Dónde corre |
|---|---|---|
| **Lector de Instagram** (`src/ig/`) | Pedir perfil, Reels y posts paginados; normalizar a nuestro modelo. Vías vigentes (verificadas el 22-11-2026, ver D6): ID desde el HTML del perfil → GraphQL de perfil → GraphQL del timeline (todos los posts con fecha) → GraphQL de la pestaña Reels (reproducciones), unidos por código | Content script (necesita las cookies del sitio) |
| **Programador de escaneo** (`src/scan/`) | Cola de perfiles, ritmo seguro, pausa/reanudación, detección de 429 y de sesión cerrada | Service worker ordena; el content script de una pestaña de Instagram ejecuta las peticiones |
| **Motor de métricas** (`src/metrics/`) | Multiplicador móvil, niveles, ER, Puntaje Viral, Joya oculta, mejor hora, hashtags, ganchos | Funciones puras; se usan en panel y Centro |
| **Almacén** (`src/db/`) | Dexie: esquema, migraciones, consultas | Todos los contextos de la extensión |
| **Badges** (`src/ui/badges/`) | Detectar las miniaturas de la cuadrícula (por el código del post en el enlace) y pintar la etiqueta | Content script |
| **Panel lateral** (`src/ui/panel/`) | Vista de un perfil: Resumen, Contenido, Tiempo, Palabras | Content script, Shadow DOM |
| **Centro** (`src/ui/center/`) | Vistas entre perfiles: clientes, ranking, comparar, colecciones, cola, ajustes | Página propia de la extensión (pestaña completa) |
| **Transcriptor** (`src/transcribe/`) | Bajar audio del reel, convertir a PCM 16 kHz, Whisper, extraer gancho | Offscreen |
| **Exportador** (`src/export/`) | Excel multi-hoja y CSV, base completa en JSON | Centro y panel |

**Por qué un "Centro" aparte:** el ranking de decenas de perfiles y las colecciones de clientes no caben en un panel sobre Instagram. Viralytics lo mete todo en el panel lateral; nosotros dejamos el panel para el perfil abierto y el Centro para el trabajo entre perfiles.

### 4.1 Permisos (manifest)
| Permiso | Para qué |
|---|---|
| `host_permissions: *://*.instagram.com/*` | Leer datos y pintar badges |
| `storage`, `unlimitedStorage` | Ajustes y base grande en IndexedDB |
| `offscreen` | Whisper |
| `alarms` | Reanudar la cola si Chrome suspende el service worker |
| `notifications` | Aviso de "escaneo terminado" |
| `downloads` | Guardar Excel/CSV en `Descargas/Radar/<cliente>/` |

No se pide acceso a otras webs, historial ni pestañas. El modelo de Whisper se descarga de Hugging Face (permite CORS, no requiere permiso extra).

### 4.2 Mensajes entre piezas
| Mensaje | De → a | Contenido |
|---|---|---|
| `scan/enqueue` | Panel o Centro → SW | perfiles, rango, tipos |
| `scan/fetchPage` | SW → content script | perfil, cursor, tipo |
| `scan/page` | content script → SW | posts normalizados, siguiente cursor |
| `scan/progress` | SW → todos | perfil, posts leídos, estimado, estado |
| `scan/paused` | SW → todos | motivo (429, sesión cerrada, usuario) y hora de reanudación |
| `transcribe/request` | Panel o Centro → SW → offscreen | post, idioma |
| `transcribe/progress` / `done` | offscreen → solicitante | % y texto |

## 5. Modelo de datos (Dexie / IndexedDB)

| Tabla | Clave e índices | Campos |
|---|---|---|
| `profiles` | `id`, `&username` | nombre, seguidores, foto, verificado, total de publicaciones, `scannedFrom`, `scannedTo`, `complete`, `lastScanAt` |
| `posts` | `id`, `&code`, `[profileId+takenAt]`, `type` | perfil, tipo (`reel` \| `post` \| `carousel`), `takenAt`, vistas, likes, comentarios, duración, caption, hashtags[], menciones[], collab, likes ocultos, URL de portada, `updatedAt` |
| `metrics` | `postId`, `[profileId+tier]`, `viralScore` | multiplicador, nivel, ER, alcance/seguidores, puntaje 0–100 (por grupo), joya oculta, madurez (`en_curso` \| `provisional` \| `final`), tamaño de muestra |
| `snapshots` | `++id`, `[postId+at]` | vistas, likes, comentarios en cada re-escaneo |
| `transcripts` | `postId` | idioma, texto, segmentos con tiempo, gancho, dispositivo usado |
| `clients` | `++id` | nombre, color, nota |
| `clientProfiles` | `[clientId+profileId]` | rol (`propia` \| `competidor`) |
| `collections` | `++id`, `clientId` | nombre |
| `collectionPosts` | `[collectionId+postId]` | nota, fecha |
| `scanJobs` | `++id`, `status` | perfil, rango, cursor, leídos, intentos, `resumeAt` |

### 5.1 Reglas
**Escaneo (ritmo seguro, valores por defecto configurables)**
- Una sola petición a Instagram a la vez; espera aleatoria de **2–4 s** entre páginas y **20–40 s** entre perfiles.
- Tamaño de página: el máximo que acepte cada endpoint (Reels: 50).
- Respuesta **429** → pausa de 15 min; si se repite, 60 min; la cola se reanuda sola (`chrome.alarms`).
- Redirección a login → se detiene todo y se avisa "inicia sesión en Instagram".
- Se requiere tener una pestaña de Instagram abierta; si no hay, el SW la abre en segundo plano.
- Re-escaneo: se detiene al llegar a posts ya guardados con más de 30 días (sus cifras ya casi no cambian), salvo que se pida "actualizar todo".

**Métricas**: las de `design.md` §2. Además:
- Posts con likes ocultos no entran en medianas de likes.
- Reels sin vistas (dato no disponible) quedan como "sin datos", nunca como 0.
- Todos los cálculos guardan el tamaño de muestra para mostrar la confianza.

**Datos**
- Nada sale del navegador. Exportar/importar base es un archivo JSON que el usuario mueve a mano.
- Borrar un cliente no borra los perfiles (pueden estar en otro cliente); borrar un perfil borra sus posts, métricas, snapshots y transcripciones.

Las métricas se recalculan cuando entra un post nuevo del perfil; el Puntaje Viral se calcula al vuelo para el grupo que se esté viendo, porque depende de con quién se compare.

## 6. Decisiones
- **D1** Extensión propia con WXT, sin backend. (22-11-2026)
- **D2** Todos los datos en IndexedDB del navegador; se pueden exportar e importar para compartir con el equipo.
- **D3** Ritmo de escaneo conservador y configurable; se pausa solo ante un 429 de Instagram.
- **D4** Código 100 % propio; Viralytics solo como referencia funcional.
- **D5** Instalación manual (modo desarrollador o .zip) para el equipo y los clientes; no se publica en la Web Store.
- **D6** (22-11-2026, Fase 2) La API v1 de Instagram en la web (`web_profile_info`, `feed/user`, `clips/user`) ya no responde (404 o HTML). El lector usa las mismas consultas GraphQL que la web de Instagram (`/graphql/query` con `doc_id`, tokens `lsd` y `fb_dtsg` de la página). El timeline no trae reproducciones y la pestaña Reels no trae fecha: se leen ambas y se unen por código. Las páginas son de 12. Los `doc_id` cambian con el tiempo: están en `src/ig/queries.ts` y cuando fallan el lector lo dice claramente ("Instagram cambió la consulta de…").

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| Instagram cambia endpoints o `doc_id` | Lector aislado; `doc_id` en un solo archivo (y en Ajustes, Fase 9); error claro cuando la respuesta no tiene el formato esperado. Pasó ya una vez (D6) |
| Bloqueo temporal de la cuenta | Cuenta secundaria, ritmo lento, pausa automática ante 429 |
| Va contra los términos de Instagram | Uso interno, sin publicar; asumido por el usuario |
| Equipos sin GPU: transcripción lenta | WASM como respaldo; transcribir solo los reels elegidos o los virales |
