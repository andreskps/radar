# Fase 2 — Lector de Instagram (22-11-2026)

## Objetivo
Leer el perfil y todas las publicaciones (Reels, fotos y carruseles) de cualquier perfil público con la sesión del navegador, normalizarlas al modelo `posts` y detectar 429 y sesión cerrada sin romperse.

## Hallazgo principal: Instagram cambió su API (decisión D6)
La primera versión del lector usaba la API v1 (`/api/v1/users/web_profile_info/`, `/api/v1/feed/user/`, `/api/v1/clips/user/`). Probada en vivo, **ya no responde**: devuelve 404 para cualquier usuario (incluso @instagram) o la página HTML. Se reescribió sobre las mismas consultas que usa hoy la web de Instagram:

| Paso | Cómo | Qué trae |
|---|---|---|
| ID del perfil | HTML de `instagram.com/<usuario>/` (`"profilePage_<id>"`) | ID numérico |
| Perfil | GraphQL `PolarisProfilePageContentQuery` | seguidores exactos, total de publicaciones, verificado, privado |
| Timeline | GraphQL `PolarisProfilePostsTabContentQuery_connection` | **todos** los posts con fecha, likes, comentarios, tipo, caption, collab; **sin reproducciones** |
| Pestaña Reels | GraphQL `PolarisProfileReelsTabContentQuery_connection` | reproducciones (`play_count`) de cada reel; **sin fecha** |

Timeline y Reels se unen por código de post. Instagram devuelve 12 por página aunque se pidan más. Los `doc_id` de las consultas están en `src/ig/queries.ts`. Uno de ellos ya mostró cambios durante esta fase, así que hay que contar con que se actualicen.

## Cambios
`src/ig/`:
| Archivo | Qué hace |
|---|---|
| `types.ts` | `IgProfile`, `IgPost`, `IgReelStats`, `IgResult` (datos · pausa · error, nunca excepciones) |
| `queries.ts` | Nombres, `doc_id` y variables de las 3 consultas |
| `client.ts` | `createClient`: `html()`, `graphql()` con tokens `lsd`/`fb_dtsg` de la página, `classify()` (429, sesión cerrada, verificación, bloqueo), extracción de tokens e ID |
| `normalize.ts` | `normalizeProfile`, `normalizeMedia`, `normalizeReelStats`, `mergeReelStats` |
| `reader.ts` | `fetchProfile`, `fetchTimelinePage`, `fetchReelsPage`, `readProfileContent` (pagina con espera de 2–4 s, `since` para re-escaneos, cancelable, conserva lo leído si se pausa) |

Además:
- **Consola:** el content script expone `radar.profile('usuario')` y `radar.read('usuario', { since })`. Se usan desde DevTools en instagram.com, eligiendo el contexto **Radar** en la consola.
- **Fixtures:** `tests/fixtures/ig/` con respuestas reales de @attoperfumes, limpias (ver su README).
- **Pruebas:** `tests/ig/` (normalización con fixtures, cliente, lector completo con Instagram simulado).

## Validación
| Criterio | Resultado |
|---|---|
| Pruebas de normalización con fixtures | ✅ |
| 429 simulado devuelve "pausa", no error | ✅ (petición suelta y a mitad de una lectura, que además conserva lo ya leído) |
| Sesión cerrada, verificación, bloqueo, formato cambiado | ✅ cada uno con su estado y mensaje en español |
| `npm test` | ✅ 131 de 131 |
| Cobertura `src/ig` (informativa) | ramas 93,5 %, líneas 100 % |
| `npm run typecheck`, `npm run build` | ✅ |
| Consola de la extensión real | ✅ en Edge, `radar.profile('attoperfumes')` desde el contexto "Radar" del content script devuelve el perfil |
| **2 perfiles reales completos** | ver tabla siguiente |

### Lectura real (cuenta con sesión: @petlify.online, autorizada por el usuario)
| Perfil | Resultado | Posts leídos / total en Instagram | Tipos | Reels sin reproducciones | Páginas | Tiempo |
|---|---|---|---|---|---|---|
| @fotoperfumes | completo | 276 / 276 | 124 reels · 83 carruseles · 69 fotos | 0 | 36 | 164 s |
| @attoperfumes | sin registrar | — | — | — | — | — |

La lectura completa de @attoperfumes no quedó registrada en esta fase. El segundo perfil real se valida en la Fase 3 con el escaneo guardado en la base, así que este criterio queda **pendiente** y se cierra allí.

## Decisiones
- La lectura se hace en orden: timeline completo y luego Reels. Si Instagram pausa a mitad, lo leído se conserva y el resultado dice por qué se detuvo. La reanudación con cursor llega en la Fase 3.
- **Reels sin pareja:** algunos reels aparecen en la pestaña Reels pero no en el timeline (en @fotoperfumes, 15 de 139). Sin fecha no se pueden ubicar, así que se informan en `unmatchedReels` y no se guardan.
- Los fijados salen arriba de la primera página aunque sean viejos. Con `since`, se deja de paginar cuando el *último* post de la página es anterior a esa fecha.
- Sin sesión, Instagram entrega igual el perfil público (sin total de publicaciones). No se usa: se asume sesión iniciada.

## Pendientes
- Fase 3: guardar en IndexedDB, cola con ritmo seguro, reanudar tras pausa o cierre, re-escaneo incremental.
- Búsqueda automática de `doc_id` nuevos cuando Instagram los cambie (hoy se actualizan a mano en `queries.ts`). Se evalúa en la Fase 9.
- Sigue pendiente del usuario: probar la extensión en su Chrome y confirmar el nombre "Radar".
