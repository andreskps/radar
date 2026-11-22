# Requerimientos (paso 03)

## Funcionales — v1

### Escaneo
- **RF-01** Escanear un perfil público completo: todos sus Reels, posts y carruseles, sin límite de cantidad ni de fecha.
- **RF-02** Elegir rango: últimos N días, rango de fechas o todo el historial.
- **RF-03** Cola de escaneo: agregar varios perfiles y que se escaneen uno tras otro, con progreso, pausa y reanudación (también tras cerrar Chrome).
- **RF-04** Re-escanear un perfil trae solo lo nuevo y actualiza las cifras de lo existente (guarda un snapshot).

### Análisis
- **RF-05** Calcular por post: multiplicador móvil, nivel, ER, alcance vs. seguidores, Joya oculta, Collab, madurez y confianza (fórmula en `design.md` §2).
- **RF-06** Badges sobre la cuadrícula del perfil en Instagram, activables o desactivables.
- **RF-07** Panel del perfil: resumen (mediana, IQR, % de virales, ER), mejores reels, gráfica en el tiempo, mejor hora (mapa de calor), calendario, hashtags y palabras.
- **RF-08** Toda estadística muestra con cuántos posts se calculó y avisa si son pocos.
- **RF-09** Grilla de contenido con filtros (tipo, nivel, fechas, duración, collab), orden por cualquier métrica y búsqueda por caption.

### Competencia y clientes
- **RF-10** Clientes: crear grupos de perfiles por cliente (incluida la marca propia).
- **RF-11** Ranking del nicho: mejores posts de todos los perfiles de un grupo, ordenados por Puntaje Viral, con filtros.
- **RF-12** Comparar N perfiles en una tabla.
- **RF-13** Colecciones: guardar posts en carpetas ("ideas para X") con nota.

### Transcripción
- **RF-14** Transcribir reels en el equipo (Whisper), uno o en lote; idioma por defecto español.
- **RF-15** Extraer el gancho (primeras ~15 palabras / primeros 3 s) como campo propio.

### Exportación
- **RF-16** Exportar a Excel: hoja Resumen, hoja Ranking, una hoja por perfil; y CSV. Sin límite de filas.
- **RF-17** Exportar/importar toda la base para compartir con el equipo.

### Ajustes
- **RF-18** Umbrales de niveles, ritmo de escaneo, idioma, formato de números, página inicial.

## No funcionales
- **RNF-01** Sin servidor: ningún dato sale del navegador (salvo la descarga única del modelo Whisper).
- **RNF-02** Funciona en Chrome, Edge y Brave (Chromium, Manifest V3).
- **RNF-03** Interfaz en español; hora de Bogotá por defecto.
- **RNF-04** Los estilos de la extensión no alteran Instagram ni al revés (Shadow DOM).
- **RNF-05** Si Instagram cambia algo y el lector falla, se muestra un mensaje claro, nunca datos incorrectos.

## Criterios de éxito (metas numéricas)
| # | Meta | Cómo se mide |
|---|---|---|
| M1 | Escanear un perfil de **1.000 reels en ≤ 10 min** con el ritmo seguro | Cronómetro sobre un perfil real grande |
| M2 | **0 bloqueos** de la cuenta secundaria escaneando **30 perfiles en una sesión** | Prueba controlada de una tarde |
| M3 | Badges visibles **≤ 2 s** al abrir un perfil ya escaneado | Medición en el navegador |
| M4 | Fórmula: **100 %** de las pruebas unitarias pasan (niveles, bordes, madurez, pocos datos) | `vitest` |
| M5 | Exportar **10.000 filas a Excel en ≤ 15 s** | Medición con datos reales |
| M6 | Transcribir un reel de **60 s en ≤ 60 s con GPU** (≤ 3 min sin GPU) | Medición en 2 equipos |
| M7 | Guardar **50 perfiles × 1.000 posts** sin errores ni lentitud (< 1 s al abrir el panel) | Prueba con datos reales |
| M8 | Del perfil al Excel del cliente en **≤ 3 clics** | Recorrido manual |
| M9 | El multiplicador coincide **±5 %** con un cálculo manual en hoja de cálculo para 3 perfiles | Comparación manual |

## Fuera de v1
Descarga masiva de videos/portadas, Stories, resumen con IA de patrones, publicación en la Web Store, cuentas de usuario o sincronización en la nube.
