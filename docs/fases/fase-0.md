# Fase 0 — Esqueleto (22-11-2026)

## Objetivo
Proyecto WXT + React + TypeScript + Tailwind + Vitest con los permisos de `architecture.md` §4.1, content script en instagram.com con un indicador "Radar activo", página Centro vacía y repositorio git.

## Cambios
- Carpeta del proyecto movida a `Desktop\RADAR`, aplanada y con `git init` (rama `main`). Se recreó `.claude/{rules,skills,agents}`, que la copia no incluyó.
- `package.json` con versiones exactas (las de `roadmap.md`, más `@types/react` y `@types/react-dom` 19.3.0). Scripts: `dev`, `build`, `zip`, `typecheck`, `test`.
- `wxt.config.ts`: `srcDir: src`, `outDir: dist`, módulo React, Tailwind 4 vía `@tailwindcss/vite`, manifest con nombre, permisos y `host_permissions` de Instagram.
- `src/entrypoints/background.ts`: clic en el icono abre el Centro.
- `src/entrypoints/instagram.content/`: UI en Shadow Root (`createShadowRootUi`, `cssInjectionMode: 'ui'`) con el indicador "Radar activo" (abajo a la derecha, colores de la marca).
- `src/entrypoints/center/`: página Centro con la barra lateral de secciones (vacías hasta la Fase 7).
- `src/assets/theme.css`: Tailwind y tokens de color de `design.md` §5.
- `tests/sample.test.ts`: prueba de ejemplo, incluida la API simulada del navegador (`fakeBrowser`).
- `.gitignore`: se agregan `.wxt/` y `.output/`.
- `README.md` con comandos e instalación.

## Validación
| Criterio | Resultado |
|---|---|
| `npm run typecheck` | ✅ sin errores |
| `npm run build` | ✅ `dist/chrome-mv3`, 471 kB en total |
| `npm test` | ✅ 1 archivo, 2 pruebas pasan |
| Carga sin advertencias | ✅ **Edge** (Chromium) con un perfil temporal: estado `ENABLED`, sin advertencias ni errores de manifest o de ejecución (leído de `edge://extensions`) |
| Indicador en instagram.com | ✅ **Edge**: "Radar activo" visible, `position: fixed`, fondo `#1B1E27`, 12 px, 0 errores JS |
| Centro abre | ✅ **Edge**: título "Radar · Centro", 6 secciones, fondo `#12141A`, 0 errores JS |
| Carga en **Chrome** | ⏳ **Pendiente del usuario.** Chrome 158 ignora `--load-extension` (lo bloquea desde la v137), así que no se puede automatizar. Pasos: README → "Instalar en Chrome". |
| `npm audit` | 0 vulnerabilidades |

## Decisiones
- Se trabaja en `main` (lo eligió el usuario).
- El indicador usa medidas en px y no en rem: dentro del Shadow Root, los rem de Tailwind dependen del tamaño de letra de Instagram (aviso de la documentación de WXT). En la Fase 4 se decide si se convierten todos los rem a px para la UI sobre Instagram.
- Dexie, ExcelJS, Chart.js y transformers.js se instalan en la fase que los usa, no ahora.
- Todavía no hay iconos. Chrome usa una letra por defecto. Se agregan en la Fase 9.

## Pendientes
- El usuario carga `dist/chrome-mv3` en Chrome y confirma que no hay advertencias y que aparece "Radar activo".
- Confirmar el nombre "Radar".
- Desde la Fase 2: cuenta secundaria de Instagram con sesión iniciada en el Chrome de pruebas.
