# Radar (nombre provisional; antes "Competitor Insights")

Extensión de Chrome propia para analizar el contenido público de perfiles de Instagram de la competencia: qué posts y Reels fueron virales, cuáles no, y exportar todo.

## Estado
Pasos 01–05 hechos. Paso 06 (Ejecución): Fases 0, 1 y 2 hechas (falta que el usuario confirme la carga en Chrome). Fase 3 hecha y probada en vivo. Fase 4 (etiquetas y contador por perfil) implementada; falta validarla en vivo (M3, M9, estilos), porque el usuario debe pulsar ↻ una vez en chrome://extensions. Fase 5 (panel lateral) implementada; su validación en vivo depende de la misma recarga. Fase 6 (exportación) hecha: Excel/CSV desde el panel y desde Centro › Datos, copia de la base en JSON (`src/export/`); faltan Google Sheets, importar en otro Chrome y la prueba en Instagram. Sigue la Fase 7 (Centro). M1 ajustada a ≤ 15 min para mantener el ritmo seguro (D8). Para pruebas automatizadas en Chrome: `VITE_RADAR_DEV_BRIDGE=1 npm run build` agrega un puente `postMessage` hacia `radar.*` y recarga automática al detectar un build nuevo (ver `docs/fases/fase-3.md` y `fase-4.md`). La UI sobre Instagram está en `src/ui/`. Para pruebas reales se usa la cuenta de Instagram que esté iniciada en el Chrome del usuario (autorizado), con ritmo lento. Trabajo por fases: una fase por commit, registro en `docs/fases/fase-N.md` (ver `docs/roadmap.md`).
Nombre provisional del producto: **Radar**.

## Stack
WXT (Manifest V3) · TypeScript · React + Tailwind · Dexie (IndexedDB) · .xlsx propio (D9) · Chart.js · transformers.js/Whisper en offscreen · Vitest. Sin backend.

## Mapa del repo
- `docs/project.md` — problema, usuarios, objetivo, alcance
- `docs/requirements.md` — requerimientos y metas numéricas
- `docs/architecture.md` — stack, componentes, datos, decisiones
- `docs/design.md` — identidad visual y flujos
- `docs/roadmap.md` — fases con criterio de "hecho cuando"
- `src/` — código de la extensión (desde el paso 06)
- `tests/` — pruebas

## Reglas del proyecto
- Código 100 % propio. Viralytics se estudió solo como referencia de funcionamiento; no se copia su código, marca ni assets.
- Sin backend ni licencias: todo corre en el navegador del usuario.

## Comandos
- `npm run dev`: navegador de pruebas con recarga en caliente
- `npm run build`: genera `dist/chrome-mv3`, que se carga con "Cargar descomprimida"
- `npm run typecheck`: `wxt prepare` y luego `tsc --noEmit`
- `npm test`: Vitest, con pruebas en `tests/**/*.test.ts`
- `npm run test:coverage`: cobertura de `src/metrics`, con un mínimo del 95 %
- Pruebas de la base: `tests/db/` y `tests/scan/` con fake-indexeddb
- `npm run preview:panel`: vista previa del panel con datos simulados en http://localhost:5199 (`?theme=light` para el modo claro); el Centro en `/center.html` (`?reset` resiembra, `?empty` vacía)
- `RADAR_EXPORT_OUT=carpeta npx vitest run tests/export`: deja `radar-10000.xlsx`, `radar-10000.csv` y `radar-60.xlsx` para abrirlos en Excel

El lector de Instagram está en `src/ig/`. Usa GraphQL de la web de Instagram, porque la API v1 ya no funciona (ver D6 en `docs/architecture.md`). Los `doc_id` están en `src/ig/queries.ts`. Desde la consola de DevTools en instagram.com, con el contexto "Radar", se puede llamar a `radar.read('usuario')`.
La base local está en `src/db/` (Dexie, esquema y operaciones). La cola de escaneo está en `src/scan/`: el service worker la ejecuta y pide cada página al content script. El content script no ve la base (corre en el origen de Instagram) y usa mensajes. En consola: `radar.scan('usuario')`, `radar.jobs()`, `radar.stored('usuario')`.
El motor de métricas está en `src/metrics/`: funciones puras y `analyzeProfile` como entrada principal. Las decisiones que precisan la fórmula están en `docs/fases/fase-1.md`.

Entrypoints en `src/entrypoints/`: `background.ts`, `instagram.content/` (UI en Shadow Root), `center/`.
Chrome 158 ignora `--load-extension`. Para pruebas automatizadas se usa Edge con un perfil temporal; Chrome se prueba a mano.
