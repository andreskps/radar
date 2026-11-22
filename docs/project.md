# Proyecto — Descubrimiento (paso 01)

## Problema
Saber qué contenido de la competencia en Instagram funcionó (viral) y cuál no, sin límites artificiales de cantidad de posts, rango de fechas ni exportaciones, como sí ponen las herramientas de pago (ej. Viralytics).

## Usuario
El usuario, su equipo y sus clientes (pocas personas). Se reparte el paquete a mano; **no** se publica en la Chrome Web Store.
Hipótesis por confirmar: nicho de perfumería árabe/nicho.

## Respuestas de la entrevista (ronda 1)
- **Distribución:** equipo / clientes, instalación manual.
- **Funciones v1:** badges sobre la cuadrícula (multiplicador vs. mediana, ER %, Collab), exportar todo a Excel/CSV, transcripciones de Reels con IA local.
- **Fuera de v1:** descarga masiva de videos/portadas.
- **Contenido:** Reels, posts y carruseles, y comparación entre varios perfiles.
- **Cuenta:** se usará una cuenta secundaria de Instagram para analizar.

## Lo que ya se sabe
- Referencia visual: Viralytics. Sobre la cuadrícula del perfil, cada post lleva:
  - Multiplicador vs. promedio del perfil con etiqueta: `0.7× Below avg`, `1.0× On par`, `1.4× Above avg`, `4.5× Breakout`.
  - Engagement rate (`ER 2.3%`).
  - Etiquetas: `Collab`, `Sleeper`, tipo de contenido (Reel / carrusel).
- Debe permitir extraer **todos** los posts, en **cualquier rango de fechas**, y exportar.
- Estudio técnico previo de Viralytics: lee los datos con la sesión del usuario en instagram.com, calcula todo localmente; solo la licencia pasa por su servidor.

## Respuestas de la entrevista (ronda 2)
- **Uso:** buscar ideas de contenido para sus clientes y para su propia marca.
- **Competidores:** todos los posibles, de cualquier tamaño → la herramienta debe aguantar muchos perfiles y perfiles grandes.
- **Viralidad:** el usuario delega la fórmula → propuesta investigada en `docs/design.md` §2.
- **Vista de comparación:** "los mejores reels" → Ranking del nicho como vista principal.

## Decisiones por defecto (tomadas por nosotros, el usuario puede cambiarlas)
- Idioma de transcripción: español por defecto, seleccionable por perfil.
- Exportación: Excel (.xlsx) con varias hojas, y CSV.
- Navegadores: cualquiera basado en Chromium (Chrome, Edge, Brave).
- Zona horaria: Bogotá (UTC-5).
- Sin fecha límite.

## Objetivo
Encontrar en minutos qué reels y posts de la competencia funcionaron mejor de lo normal, para convertirlos en ideas de contenido para clientes y para la marca propia, sin límites de cantidad ni de fechas.

## Alcance v1
- Dentro: etiquetas de viralidad en la cuadrícula, escaneo completo de un perfil, panel de análisis, ranking del nicho entre perfiles, comparación de N perfiles, grupos por cliente y colecciones, transcripción local, exportación Excel/CSV.
- Fuera: descarga masiva de videos y portadas, Stories, publicación en la Web Store, backend o cuentas de usuario.

## Herramientas actuales
Viralytics en plan gratis (90 días o 100 reels, exportar 20). En la prueba sobre @fotoperfumes solo analizó 11 de 276 publicaciones, así que sus estadísticas eran poco confiables. Detalle en `docs/design.md` §1.

## Restricciones y riesgos conocidos
- "Ilimitado" de nuestra parte no elimina los límites de Instagram: rate limits (429) y posibles bloqueos temporales si se piden miles de posts muy rápido. La extensión debe ir a un ritmo seguro.
- Leer datos por endpoints internos va contra los términos de Instagram; riesgo para la cuenta usada. Mitigación a decidir (cuenta secundaria, ritmo lento).
- Los endpoints internos de Instagram cambian sin aviso → mantenimiento continuo.
