# Fase 4 — Etiquetas sobre Instagram (22-11-2026)

**Estado: implementada; falta la validación en vivo.** El usuario no puede recargar la extensión en Chrome por ahora, y Chrome no deja que las herramientas automatizadas abran `chrome://extensions`. Por pedido del usuario se avanzó a la Fase 5 mientras tanto.

## Objetivo
Etiquetas en cada miniatura del perfil, chip del perfil con escanear y actualizar, detalle al pasar el mouse, interruptor para ocultarlas y contador del icono por pestaña (pedido del usuario).

## Cambios
| Archivo | Qué hace |
|---|---|
| `src/db/views.ts` | `ProfileView`: cifras y métrica de cada post por código, más el resumen del perfil (posts, mediana de los últimos 30 reels, virales, joyas) y su trabajo de escaneo |
| `src/ui/route.ts` | Perfil de la URL (con lista de rutas reservadas) y código del post en un enlace |
| `src/ui/format.ts` | Números compactos, multiplicador, ER, modelo de la etiqueta (nivel, color, icono, "En curso", "pocos datos", "Sin datos", detalle), texto del contador y del estado del escaneo |
| `src/ui/badges/` | Etiqueta en un Shadow Root propio por miniatura, en posición absoluta; un `MutationObserver` agrupado por frame las pone y quita al hacer scroll o al cambiar de perfil |
| `src/ui/controller.ts`, `src/ui/store.ts` | Detecta el perfil de la URL (Instagram navega sin recargar), pide la vista al SW, sigue el avance y guarda el interruptor en `storage.local` |
| `instagram.content/ProfileChip.tsx` | Chip abajo a la derecha: "Escanear con Radar", avance con Pausar y Reanudar, o un resumen con "Actualizar" y la casilla "Etiquetas". Reemplaza a "Radar activo" |
| `background.ts` | Mensajes `view/profile`, `tab/profile` y `db/export`. Contador del icono **por pestaña**: avance (fondo lima), posts guardados o vacío |
| `wxt.config.ts`, `background.ts` | Build de pruebas (`VITE_RADAR_DEV_BRIDGE=1`): el SW compara su sello con `build-stamp.txt` y se recarga solo cuando hay un build nuevo, junto con las pestañas de Instagram |

## Decisiones
- **El botón de escanear va en el chip y no junto a "Seguir"** (design.md §6.1 lo ponía allí). Meterlo en la cabecera de Instagram cambia su layout, que es justo lo que esta fase debe evitar. El menú para elegir cliente llega con la Fase 7.
- Las etiquetas se insertan dentro del enlace de cada miniatura, que ya tiene `position: relative`, como un elemento con Shadow Root propio y en posición absoluta. No mueven nada y su CSS no sale de ahí. En el contexto aislado del content script no existe `customElements`: se usa `attachShadow` sobre un elemento con nombre propio, que no necesita registro.
- Durante un escaneo no hay etiquetas nuevas, porque las métricas se calculan al cerrar. Aparecen al terminar.
- Viralytics pinta en la misma esquina. Se recomienda desactivarlo mientras se usa Radar.

## Validación
| Criterio | Resultado |
|---|---|
| `npm test` | ✅ 187 de 187 (28 nuevas en `tests/ui/`: rutas, formatos, modelo de etiqueta, contador, vista del perfil con fake-indexeddb) |
| `npm run typecheck`, `npm run build`; build normal sin puente ni sello | ✅ |
| Estructura real de la cuadrícula (22-11-2026) | Enlaces `/usuario/reel/CODE/` y `/p/CODE/` con `position: relative`, 211×281 px |
| Línea base de layout sin etiquetas (@attoperfumes) | Miniaturas en x = 139 / 351 / 563, 211×281; 24 hojas de estilo en el documento |
| **M3: etiquetas en ≤ 2 s** | ⏳ Pendiente: se mide con `radar.ui()` (`paintMs`) |
| **M9: multiplicador ±5 % frente a hoja de cálculo en 3 perfiles** | ⏳ Pendiente. Perfiles listos: @attoperfumes (3.359 posts) y @fotoperfumes (276/276, escaneado el 22-11-2026 en 133 s). Falta un tercero |
| **Estilos de Instagram sin cambios** | ⏳ Pendiente: comparar posiciones y hojas de estilo con etiquetas activadas y desactivadas, contra la línea base |
| Contador por pestaña | ⏳ Pendiente en vivo |

## Pendientes
1. Que el usuario pulse ↻ una vez en `chrome://extensions` (las siguientes recargas son automáticas).
2. Medir M3, hacer la comparación de M9 (un CSV con fórmulas `=valor/MEDIAN(...)` para abrir en Excel o Sheets, más la comparación automática) y comprobar que los estilos no cambian.
