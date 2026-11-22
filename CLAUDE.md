# Radar (nombre provisional; antes "Competitor Insights")

Extensión de Chrome propia para analizar el contenido público de perfiles de Instagram de la competencia: qué posts y Reels fueron virales, cuáles no, y exportar todo.

## Estado
Pasos 01–05 hechos. Paso 06 (Ejecución): Fases 0, 1 y 2 hechas (falta que el usuario confirme la carga en Chrome); sigue la Fase 3 (base local y escaneo). Para pruebas reales se usa la cuenta de Instagram que esté iniciada en el Chrome del usuario (autorizado), con ritmo lento. Trabajo por fases: una fase por commit, registro en `docs/fases/fase-N.md` (ver `docs/roadmap.md`).
Nombre provisional del producto: **Radar**.

## Stack
WXT (Manifest V3) · TypeScript · React + Tailwind · Dexie (IndexedDB) · ExcelJS · Chart.js · transformers.js/Whisper en offscreen · Vitest. Sin backend.

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

El lector de Instagram está en `src/ig/`. Usa GraphQL de la web de Instagram, porque la API v1 ya no funciona (ver D6 en `docs/architecture.md`). Los `doc_id` están en `src/ig/queries.ts`. Desde la consola de DevTools en instagram.com, con el contexto "Radar", se puede llamar a `radar.read('usuario')`.
El motor de métricas está en `src/metrics/`: funciones puras y `analyzeProfile` como entrada principal. Las decisiones que precisan la fórmula están en `docs/fases/fase-1.md`.

Entrypoints en `src/entrypoints/`: `background.ts`, `instagram.content/` (UI en Shadow Root), `center/`.
Chrome 158 ignora `--load-extension`. Para pruebas automatizadas se usa Edge con un perfil temporal; Chrome se prueba a mano.
