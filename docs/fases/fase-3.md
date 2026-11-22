# Fase 3 — Base local y escaneo de un perfil (22-11-2026)

## Objetivo
Guardar en IndexedDB lo que lee el lector, escanear con ritmo seguro, pausar y reanudar solo (también tras cerrar Chrome), re-escanear solo lo nuevo y recalcular las métricas.

## Cambios
| Archivo | Qué hace |
|---|---|
| `src/db/schema.ts` | Esquema Dexie v1 con las 10 tablas de `architecture.md` §5 y sus tipos (`ProfileRow`, `PostRow`, `MetricRow`, `ScanJobRow`…) |
| `src/db/repo.ts` | `saveProfile`, `savePosts` (no pisa las reproducciones), `applyReelStats` (une por código), `finalizeProfile` (snapshots, métricas, Puntaje Viral por grupo, cobertura), `deleteProfile` (borrado en cascada) |
| `src/scan/step.ts` | Un paso = una petición + guardar. Fases del trabajo: `profile → timeline → reels → finalize`. Manejo de fallos (`applyFailure`) |
| `src/scan/queue.ts` | `ScanQueue`: cola persistente, ritmo 2–4 s entre páginas y 20–40 s entre perfiles, pausa/reanudar/cancelar del usuario, una sola corrida a la vez |
| `src/scan/tabFetcher.ts` | El service worker pide cada página al content script de una pestaña de Instagram; si no hay, abre una en segundo plano |
| `src/scan/messages.ts` | Mensajes tipados SW ↔ content script |
| `background.ts` | Arma la cola, alarmas de reanudación y vigía, contador en el icono, responde `scan/*` y `db/profile` |
| `instagram.content/index.tsx` | Ejecuta las peticiones de la cola y suma a la consola `radar.scan`, `jobs`, `pause`, `resume`, `cancel` y `stored` |

Dependencias nuevas, con las versiones fijadas en el roadmap: `dexie@4.4.7`, `fake-indexeddb@6.2.8` (solo para pruebas).

## Cómo funciona
- **Reanudación:** el trabajo se guarda en `scanJobs` después de cada página, con su cursor. Al arrancar, el service worker llama a `ensureRunning()`. Lo hace cuando Chrome se abre, cuando suena la alarma `radar-scan-wake` (fin de una pausa) y cada minuto por el vigía `radar-scan-watchdog` mientras hay escaneo. Un trabajo que quedó en `running` sigue desde su cursor.
- **Pausas:** un 429 pausa 15 min y, si se repite seguido, 60 min. La pausa frena **toda** la cola, porque afecta a la cuenta y no a un perfil. Sesión cerrada, verificación o bloqueo detienen todo hasta que el usuario llama a `resume`. Sin red o con 5xx se reintenta 3 veces, con 1 min entre intentos, y después el trabajo queda en error. Un error de formato ("Instagram cambió la consulta") no se reintenta.
- **Re-escaneo incremental** (modo `auto` sobre un perfil con escaneo completo): el corte es `min(ahora − 30 días, post más reciente guardado)`. Trae lo nuevo y refresca las cifras de los últimos 30 días. El modo `full` ("actualizar todo") recorre el perfil entero.
- **Snapshots:** al cerrar cada escaneo se guarda uno por post tocado, solo si cambiaron sus vistas, likes o comentarios.
- **Métricas:** se recalculan sobre todo el perfil al final de cada escaneo. El `viralScore` guardado es dentro del propio perfil y grupo; el Centro lo recalcula para el grupo que muestre.

## Validación
| Criterio | Resultado |
|---|---|
| Pruebas de la base con fake-indexeddb | ✅ `tests/db/repo.test.ts` (9): esquema, fusión timeline/Reels, sin duplicados, snapshots solo con cambios, Puntaje Viral, cascada |
| Cola y escaneo con Instagram simulado | ✅ `tests/scan/queue.test.ts` (19): completo, ritmo, 429 (15 → 60 min, cursor conservado, sin duplicar), la pausa frena toda la cola, reanudar con una cola nueva tras "matar" el service worker, incremental (con fijado viejo arriba), corte con último escaneo viejo, `full`, sesión cerrada, red, pausa y cancelación del usuario |
| `npm test` | ✅ 159 de 159 |
| Cobertura informativa | `src/db` y `src/scan` (step + queue): líneas 100 %, ramas 90,5 % |
| `npm run typecheck`, `npm run build` | ✅ |
| **M1: ~1.000 reels ≤ 15 min** | ✅ en real: @attoperfumes (3.359 posts, 2.065 reels) completo en 31,8 min y 454 páginas (~4,2 s por página, con el cierre de Chrome incluido). Proyectado a 1.000 reels: ~169 páginas ≈ 11,8 min |
| Cerrar y abrir Chrome a mitad del escaneo | ✅ en real: Chrome se cerró con ⋮ → Salir en la página 256 (3.060 posts). Al reabrirlo siguió desde ahí, sin repetir el perfil |
| Re-escaneo trae solo lo nuevo | ✅ en real: 7 páginas y 27 s (frente a 454 páginas). Corte el 23-10-2026 (30 días); se refrescaron 36 posts y se guardaron 19 snapshots nuevos, solo de los que cambiaron |
| Segundo perfil real (pendiente de la Fase 2) | ✅ @attoperfumes completo: 3.359 de 3.360 posts guardados, 3.359 métricas, 1 reel sin pareja, cobertura del 18-03-2021 al 21-11-2026 |

### M1 frente al ritmo seguro (D3)
Instagram entrega 12 publicaciones por página, y hay que leer el timeline (fechas) y además la pestaña Reels (reproducciones). Con la espera de 2–4 s de D3 y ~1,5 s por petición (medido en la Fase 2):

| Perfil | Peticiones | Tiempo estimado |
|---|---|---|
| 1.000 reels, sin fotos | ~169 | ~12,6 min |
| 1.000 reels + 500 fotos (prueba de rendimiento) | 210 | ~15,7 min |

La base no es el cuello de botella: 1.500 posts se guardan y procesan en ~0,3 s. Para llegar a 10 min habría que bajar la espera a ~1–2 s, lo que contradice D3. **Decisión (D8, 22-11-2026):** se mantiene el ritmo seguro y M1 pasa a ≤ 15 min para 1.000 reels. El usuario delegó la elección y se priorizó no arriesgar la cuenta.

### Prueba en vivo (22-11-2026)
En el Chrome del usuario, con la sesión autorizada, controlada desde Claude in Chrome con el puente de pruebas (ver Decisiones). Sin ningún 429 ni pausa de Instagram en los 454 pedidos.

Observación: 2.065 reels se unieron con el timeline, pero 2.028 tienen reproducciones. Para unos 37, la pestaña Reels no trae `play_count`. Quedan como "sin datos", nunca como 0 (regla de §5.1).

## Decisiones
- **El content script no ve la base:** corre en el origen de instagram.com y su IndexedDB es la de Instagram. Todo acceso a datos desde Instagram (badges de la Fase 4, panel de la Fase 5) va por mensajes al service worker.
- Las notificaciones de "escaneo terminado" no van en esta fase: Chrome exige un icono y la extensión aún no tiene. Por ahora el avance se ve en el contador del icono (posts leídos, `||` en pausa, `!` en error) y en la consola. Pasan a la Fase 5/9 con el icono.
- La pausa del usuario no frena otros perfiles; las de Instagram sí.
- Los reels sin pareja en el timeline se cuentan en el perfil (`unmatchedReels`), solo en escaneos completos.
- **Puente de pruebas:** el contexto de la página no ve el `radar` de la consola, porque este vive en el contexto aislado. Para probar desde herramientas automatizadas, el content script acepta `window.postMessage({ source: "radar-dev", id, cmd, args })` y responde con `radar-dev-reply`. Solo admite `scan`, `jobs`, `stored`, `pause`, `resume` y `cancel`, y solo existe con `VITE_RADAR_DEV_BRIDGE=1 npm run build`. El build normal no lo incluye (comprobado).
- Si otra cuenta tenía el mismo usuario (lo cambió o lo liberó), la vieja se renombra `usuario~id` en vez de fallar.

## Checklist de prueba en vivo (para repetir)
1. `npm run build` y luego cargar `dist/chrome-mv3` en `chrome://extensions` (Cargar descomprimida; si ya estaba, recargar). Recargar también la pestaña de Instagram.
2. En instagram.com, abrir DevTools → Consola → contexto **Radar**: `await radar.scan('attoperfumes')`. Anotar la hora.
3. Seguir el avance en la consola o en el contador del icono. A mitad del escaneo, **cerrar Chrome por completo** y volver a abrirlo. En ≤ 1 min debe seguir solo (`await radar.jobs()` muestra el cursor avanzando).
4. Al terminar: `await radar.stored('attoperfumes')` → posts = total del perfil (menos los reels sin pareja), métricas = posts. Anotar el tiempo total.
5. Repetir `await radar.scan('attoperfumes')`: debe terminar en pocas páginas (`pages` en `radar.jobs()`).

## Pendientes
- Contador del icono por pestaña y perfil: pasa a la Fase 4 (pedido del usuario).
- Sigue pendiente del usuario: probar la extensión en su Chrome y confirmar el nombre "Radar".
