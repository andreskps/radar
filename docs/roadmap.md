# Roadmap (paso 05)

| Paso | Estado |
|---|---|
| 01 Descubrimiento | Hecho (22-11-2026) |
| 02 Evaluación | Hecho (22-11-2026) — extensión propia con WXT, US$ 0 recurrente |
| 03 Definición | Hecho (22-11-2026) — 18 RF, 5 RNF, 9 metas |
| 04 Diseño | Hecho (22-11-2026) |
| 05 Planificación | Hecho (22-11-2026) |
| 06 Ejecución | En curso — Fases 0–2 hechas; Fase 3 hecha; Fase 4 implementada con validación en vivo pendiente; Fase 5 implementada con validación en vivo pendiente (22-11-2026), ver `docs/fases/` |

## Versiones fijadas (verificadas en npm el 22-11-2026)
| Paquete | Versión | Nota |
|---|---|---|
| Node.js | 24.x (instalado: 24.22.1) | WXT pide ≥ 22 |
| wxt | 0.21.5 | |
| @wxt-dev/module-react | 1.2.2 | |
| react / react-dom | 19.3.1 | |
| typescript | **6.0.3** | Se evita la 7.0 (reescritura nueva, recién salida) hasta que el ecosistema la adopte |
| tailwindcss / @tailwindcss/vite | 4.3.5 | |
| dexie | 4.4.7 | |
| exceljs | 4.4.0 | Última estable (dic-2024), sin reemplazo mejor |
| chart.js | 4.6.1 | |
| @huggingface/transformers | 4.3.2 | Whisper en el navegador |
| vitest | 5.1.1 | |
| fake-indexeddb | 6.2.8 | Para probar la base sin navegador |

## MVP
**Fases 0–6**: analizar *un* perfil completo, ver etiquetas y panel, y exportarlo a Excel. Ya sirve para trabajo real.
**v1 completa**: Fases 7–9 (Centro con clientes, ranking y comparación; transcripción; entrega al equipo).

## Fases de ejecución
Cada fase = un commit + `docs/fases/fase-N.md`. Validar antes de cerrar; preguntar antes de seguir.

### Fase 0 — Esqueleto
Proyecto WXT + React + TypeScript + Tailwind + Vitest; manifest con los permisos de `architecture.md` §4.1; content script vacío en instagram.com; página "Centro" vacía; repositorio git.
**Hecho cuando:** `npm run build` y `npm run typecheck` sin errores; la extensión carga en Chrome sin advertencias; en instagram.com aparece un indicador "Radar activo"; `npm test` corre una prueba de ejemplo.

### Fase 1 — Motor de métricas
Funciones puras: multiplicador móvil (30 previos, sin el propio), niveles, madurez (72 h / 7 días), confianza (< 8), ER, alcance/seguidores, Joya oculta, Puntaje Viral por percentiles, mejor hora (con mínimo de 30 posts), hashtags y palabras por multiplicador.
**Hecho cuando:** pruebas Vitest cubren cada nivel y cada borde (exactamente 2×, 5×, 10×; 71 h vs. 73 h; 7 vs. 8 de referencia; likes ocultos; vistas faltantes) y pasan al 100 % (meta M4); cobertura de ramas del módulo ≥ 95 %.

### Fase 2 — Lector de Instagram
Adaptadores (API web → GraphQL → datos de la página), normalización al modelo `posts`, paginación, detección de 429 y de sesión cerrada. Respuestas reales guardadas como *fixtures* (sin datos de la cuenta propia) para las pruebas.
**Hecho cuando:** desde la consola de la extensión se leen perfil + todos los Reels y posts de 2 perfiles reales; las pruebas de normalización con fixtures pasan; un 429 simulado devuelve el estado "pausa" y no un error.
**Depende del usuario:** cuenta secundaria de Instagram con sesión iniciada en el Chrome de pruebas.

### Fase 3 — Base local y escaneo de un perfil
Esquema Dexie (`architecture.md` §5), programador con ritmo seguro, pausa/reanudación con `chrome.alarms`, re-escaneo incremental con snapshots, recálculo de métricas.
**Hecho cuando:** un perfil de ~1.000 reels se escanea completo en ≤ 15 min (M1, ajustada en D8); cerrar y abrir Chrome a mitad del escaneo lo reanuda; un re-escaneo trae solo lo nuevo; pruebas de la base con fake-indexeddb pasan.

### Fase 4 — Etiquetas sobre Instagram
Badges en cada miniatura (también al hacer scroll y al cambiar de perfil sin recargar), chip del perfil, botón "Escanear con Radar", tooltip con detalle; interruptor para ocultarlas. Contador del icono **por pestaña**, según el perfil abierto: avance si se está escaneando, posts guardados si ya se escaneó, vacío si no (pedido del usuario el 22-11-2026, como Viralytics).
**Hecho cuando:** en un perfil ya escaneado las etiquetas aparecen en ≤ 2 s (M3); en 3 perfiles el multiplicador coincide ±5 % con un cálculo manual en hoja de cálculo (M9); los estilos de Instagram no cambian (comparación de capturas antes/después).

### Fase 5 — Panel lateral
Pestañas Resumen, Contenido (filtros, orden, búsqueda, selección), Tiempo (línea, mapa de calor, calendario) y Palabras; avisos de confianza; modo claro/oscuro.
**Hecho cuando:** las 4 pestañas funcionan con 2 perfiles reales; cada estadística muestra su tamaño de muestra; el panel abre en < 1 s con 1.000 posts.

### Fase 6 — Exportación (cierra el MVP)
Excel por perfil (Resumen + Posts), CSV, exportar/importar base completa en JSON.
**Hecho cuando:** 10.000 filas en ≤ 15 s (M5); el Excel abre sin errores en Excel y Google Sheets; importar la base en otro perfil de Chrome deja todo igual (conteo de posts y métricas idénticos).
**➜ Entrega MVP al usuario para uso real.**

### Fase 7 — Centro
Clientes (incluida "Mi marca"), cola de escaneo de varios perfiles, Ranking del nicho con Puntaje Viral, Comparar N perfiles, Colecciones con notas, Excel multi-hoja por cliente.
**Hecho cuando:** 30 perfiles escaneados en una sesión sin bloqueo de la cuenta (M2); 50 perfiles × 1.000 posts abren el ranking en < 1 s (M7); del perfil al Excel del cliente en ≤ 3 clics (M8).

### Fase 8 — Transcripción y ganchos
Documento offscreen con Whisper (WebGPU con respaldo WASM), audio del reel a PCM 16 kHz, progreso, lote, idioma; extracción del gancho; búsqueda en transcripciones.
**Hecho cuando:** reel de 60 s en ≤ 60 s con GPU y ≤ 3 min sin GPU (M6), medido en 2 equipos; el gancho aparece en ranking y Excel.

### Fase 9 — Ajustes y entrega al equipo
Ajustes (umbrales, ritmo, idioma, zona horaria, formato), mensajes de error claros, empaquetado .zip, guía de instalación en español para el equipo y clientes.
**Hecho cuando:** las 9 metas medidas y registradas en `docs/fases/fase-9.md`; una persona del equipo instala la extensión siguiendo solo la guía.

## Plan de pruebas
| Tipo | Herramienta | Qué cubre | Cuándo |
|---|---|---|---|
| Unitarias | Vitest | Motor de métricas, normalización de Instagram (fixtures), exportador | Cada commit |
| Base de datos | Vitest + fake-indexeddb | Esquema, migraciones, re-escaneo incremental, borrados en cascada | Fases 3, 6, 7 |
| Manual guiada | Checklist en `docs/fases/fase-N.md` | Instagram real con cuenta secundaria: etiquetas, panel, cola | Cierre de cada fase |
| Rendimiento | Cronómetro y `performance.now()` | Metas M1, M3, M5, M6, M7 | Fases 3–8 |
| Comparación manual | Hoja de cálculo | Meta M9 (multiplicador ±5 %) | Fase 4 |

## Pendientes antes de la Fase 0
- Mover el proyecto a una carpeta definitiva (hoy está en una carpeta temporal de la sesión) e iniciar git.
- Tener la cuenta secundaria de Instagram con sesión iniciada en el Chrome de pruebas (necesaria desde la Fase 2).
