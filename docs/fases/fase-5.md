# Fase 5 — Panel lateral (22-11-2026)

**Estado: implementada y revisada en una vista previa local con datos simulados. Falta la validación en vivo** con 2 perfiles reales. Depende de la misma recarga pendiente de la Fase 4: el usuario no está en el equipo para pulsar ↻ en `chrome://extensions`.

## Objetivo
Panel de un perfil sobre Instagram con las pestañas Resumen, Contenido, Tiempo y Palabras, avisos de confianza y modo claro/oscuro (design.md §6.2).

## Cambios
| Archivo | Qué hace |
|---|---|
| `src/db/views.ts` | `PanelPost` y `loadPanelData`: todos los posts con texto, hashtags, portada y métrica. `toBadgePost` es común con las etiquetas |
| `src/ui/panel/analytics.ts` | Funciones puras: filtros (30 d · 90 d · 1 año · Todo; Todo · Reels · Posts), resumen, contenido (búsqueda sin tildes, filtros y orden con los vacíos al final), serie en el tiempo, mejor hora, meses y palabras. Cada estadística lleva su `n` |
| `src/ui/panel/Panel.tsx` | Cabecera (usuario, seguidores, estado del escaneo, filtros, Escanear/Actualizar, tema, cerrar) y pestañas |
| `SummaryTab.tsx` | 4 tarjetas (mediana de vistas, % virales, ER mediano, posts por semana) con `n` y aviso, histograma por nivel, Top 6 |
| `ContentTab.tsx` | Búsqueda, filtros de nivel y collab, orden por 6 métricas en las dos direcciones, tarjetas con enlace al post y "Ver más" de 40 en 40 |
| `TimeTab.tsx` | Dispersión en el tiempo con Chart.js 4.6.1 (escala log, color por nivel), mapa de calor día × hora (Bogotá) con las 3 mejores franjas, publicaciones por mes con los virales |
| `WordsTab.tsx` | Hashtags y palabras por multiplicador mediano (3 o más usos), con un espacio para los ganchos (Fase 8) |
| `controller.ts`, `store.ts`, `ProfileChip.tsx`, `instagram.content/index.tsx` | Botón "Abrir panel" en el chip; tema guardado (por defecto, el de Instagram); mide `panelMs` (del clic al primer frame con datos), visible en `radar.ui()` |
| `background.ts`, `messages.ts` | Mensaje `view/panel` |
| `tests/visual/` + `npm run preview:panel` | Vista previa local del panel real con 1.000 posts simulados (`?theme=light` para el modo claro) |

Dependencia nueva, con la versión fijada en el roadmap: `chart.js@4.6.1` (solo se registran scatter, punto, escalas lineal y logarítmica y tooltip).

## Decisiones
- El panel reemplaza al chip mientras está abierto, y se cierra con ✕ o al salir del perfil.
- **Selección múltiple** (transcribir, colección, exportar) no va en esta fase: sus acciones llegan en las Fases 6–8. Hoy cada tarjeta abre el post en Instagram.
- Mejor hora: el color usa una escala fija de 0.5× a 3×, para que una franja atípica no apague el resto. Cada franja dice su `n`.
- "Posts por semana" en "Todo" cuenta desde el primer post del rango hasta hoy.
- Las URL de portada de Instagram vencen. Si una no carga, queda el fondo gris; renovarlas es tarea de un re-escaneo.

## Validación
| Criterio | Resultado |
|---|---|
| `npm test` | ✅ 199 de 199 (12 nuevas en `tests/ui/panel.test.ts`) |
| `npm run typecheck`, `npm run build` | ✅ |
| Cálculos de las 4 pestañas con 1.000 posts | ✅ menos de 300 ms (prueba automática) |
| **Panel abre en < 1 s con 1.000 posts** | ✅ en la vista previa: 57 ms del clic al primer frame (sin el mensaje al SW). ⏳ Falta medirlo en Instagram con @attoperfumes (3.359 posts), donde se suma el envío desde el SW |
| Cada estadística muestra su tamaño de muestra | ✅ revisado en las 4 pestañas (vista previa) |
| Modo claro y oscuro | ✅ revisado en la vista previa |
| **Las 4 pestañas funcionan con 2 perfiles reales** | ⏳ Pendiente: @attoperfumes y @fotoperfumes ya están escaneados |

Ajustes hechos tras revisar la vista previa: la escala del mapa de calor y los límites del eje de fechas del gráfico, que se pasaba de la fecha del último post.

## Pendientes
- Validación en vivo de las Fases 4 y 5 cuando el usuario pulse ↻ una vez (las recargas siguientes son automáticas).
