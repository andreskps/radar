# Fase 1 — Motor de métricas (22-11-2026)

## Objetivo
Funciones puras (sin navegador ni base de datos) que calculan la fórmula de `design.md` §2: multiplicador móvil, niveles, madurez, confianza, ER, alcance, Joya oculta, Puntaje Viral, mejor hora y hashtags/palabras por multiplicador.

## Cambios
`src/metrics/`:
| Archivo | Qué hace |
|---|---|
| `types.ts` | Tipos: `PostInput`, `PostMetrics`, `Tier`, `Maturity`, `Confidence`, `Thresholds`, `MetricsOptions` |
| `stats.ts` | `median`, `quantile` (igual que PERCENTIL.INC de Excel/Sheets), `percentileRank` (búsqueda binaria) |
| `tiers.ts` | `tierOf` con umbrales inclusivos y configurables, etiquetas en español, `VIRAL_TIERS` (≥ 2×) |
| `analyze.ts` | `analyzeProfile(posts, { now, followers, thresholds?, window?, minSample? })`, `maturityOf`, `performanceValue`, `engagementRate`, Joya oculta |
| `score.ts` | `viralScores`: Puntaje Viral 0–100 (50/30/20 por percentiles) |
| `bestTime.ts` | `bestTime`: mapa día × hora en hora de Bogotá con multiplicador mediano y top 3; exige 30 posts |
| `terms.ts` | `extractHashtags`, `extractWords` (sin palabras vacías ES/EN), `termsByMultiplier` |
| `index.ts` | Punto de entrada del módulo |

Además: `@vitest/coverage-v8` 5.1.1, script `npm run test:coverage` con umbral de 95 % en `vitest.config.ts`.

## Validación
| Criterio | Resultado |
|---|---|
| Cada nivel y cada borde: exactamente 10×, 5×, 2×, 1.25×, 0.8× y justo debajo | ✅ |
| Madurez: 71 h, 72 h − 1 ms, 72 h, 73 h, 7 días − 1 ms, 7 días | ✅ |
| Confianza: 7 vs. 8 de referencia | ✅ |
| Likes ocultos (posts y reels) y vistas faltantes (`null` / ausente) | ✅ |
| Ventana de 30, sin contar el propio, sin "en curso", grupos reel/post separados | ✅ |
| Cálculo igual que en una hoja de cálculo (base de M9): mediana 1.050 → 3× | ✅ |
| `npm test` (meta M4) | ✅ 85 de 85 pasan |
| Cobertura de `src/metrics` (`npm run test:coverage`) | ✅ ramas **99,3 %** (meta ≥ 95 %), líneas, funciones y sentencias 100 % |
| Rendimiento | ✅ 5.000 posts + Puntaje en 26 ms (prueba con límite de 500 ms) |
| `npm run typecheck` y `npm run build` | ✅ sin errores |

## Decisiones (precisan `design.md` §2)
- **Pocos datos:** con menos de 8 de referencia se calcula el multiplicador (informativo), pero el nivel queda vacío.
- **En curso (< 72 h):** se calcula el multiplicador, el nivel queda vacío y el post no entra en ninguna mediana. Entre 72 h y 7 días: nivel "provisional".
- **Línea base 0** (todos los de referencia con 0): sin multiplicador, confianza `sin_datos`.
- **Cifras inválidas** (negativas, NaN) cuentan como faltantes, nunca como 0.
- **Posts y carruseles** se comparan entre sí; los reels, solo con reels. En posts, el "alcance" es (likes + comentarios) ÷ seguidores.
- **Joya oculta:** necesita al menos 8 posts con ER en el grupo, confianza `ok` y no estar en curso.
- **Puntaje Viral:** se calcula por grupo (reels o posts, no mezclados). Sin multiplicador no hay puntaje. Si falta ER o alcance, su peso se reparte. El percentil va de 0 (el peor) a 100 (el mejor); con un solo post da 50.
- **Mejor hora:** solo franjas con ≥ 2 publicaciones entran en el top; con menos de 30 posts se devuelve el mapa pero sin recomendaciones.
- **Palabras y hashtags:** mínimo 3 apariciones por defecto; orden por multiplicador mediano, luego frecuencia.

## Pendientes
- M9 completa (comparar ±5 % con una hoja de cálculo en 3 perfiles reales) se mide en la Fase 4, con datos de Instagram.
- Resumen del perfil (mediana, IQR, % virales) se arma en la Fase 5 con estas funciones.
- Sigue pendiente del usuario: probar la carga en Chrome (Fase 0) y confirmar el nombre "Radar".
