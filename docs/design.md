# Diseño (paso 04 — borrador adelantado en el descubrimiento)

## 1. Referencia: pantallas de Viralytics (revisadas el 22-11-2026 sobre @fotoperfumes)

| Pantalla | Qué muestra | Qué tomamos | Problema que vimos |
|---|---|---|---|
| **Badges en la cuadrícula** | Sobre cada post del perfil: `2.4× Breakout`, `5.9× Smash hit`, `0.4× Below avg`, `ER 4.7%`, `Collab`, `Sleeper` | Sí, es la vista estrella | Solo en lo escaneado (plan free: 90 días / 100 reels) |
| **Chip flotante** | "12 reels · mediana 9.3K · 0 breakouts" | Sí | — |
| **Botón "Download all"** en el perfil | Descarga masiva | No en v1 | — |
| **Control Panel** | Tipo (Reels / Posts / Timeline), Scan Profile, Download Profile, Save Creator, rango "Recent data · N días", Scan more data | Sí, simplificado | El rango está bloqueado en free |
| **Content** | Grilla de reels con likes, comentarios, vistas, duración, ER, fecha; filtros, orden, búsqueda por caption, selección, exportar CSV / media | Sí | Exportación limitada a 20 |
| **Analytics / Overview** | ER del perfil, vistas/likes/comentarios totales, seguidores; mediana, IQR, "Relative Success"; histograma de vistas (debajo / cerca / sobre la mediana), consistencia, Top performers, rango IQR, descargar reporte | Sí | Con 11 reels de 276 publicaciones las estadísticas no son confiables y no lo avisa |
| **Eng. Chart** | Línea de vistas / likes / comentarios / ER / duración en el tiempo, con zoom | Sí | — |
| **Best Time** | Mapa de calor día × hora, top 3 franjas por vistas promedio, distribución 24 h, zona horaria | Sí | Calculado con 11 posts, sin aviso de muestra pequeña |
| **Timeline** | Calendario anual de días con publicación, racha máxima | Sí (secundario) | — |
| **Tags** | Top hashtags y palabras del caption | Sí | Salió vacío en la prueba |
| **Saved Creators** | Perfiles guardados, seguidores, posts capturados, "fetched till"; **Compare** (2 perfiles) y **Content Gap** | Sí, ampliado | Solo compara de a 2 |
| **Settings** | Plan, licencia, página por defecto, filtro por defecto, auto-cargar al hacer scroll, mostrar badges en la cuadrícula, formato de números | Ajustes sí; plan/licencia no | — |

Cómo etiqueta Viralytics (leído en su código): multiplicador = vistas ÷ mediana de lo escaneado. Niveles: ≥20× *Mega viral*, ≥10× *Viral*, ≥5× *Smash hit*, ≥2× *Breakout*, luego *Above avg* / *On par* / *Below avg*. *Sleeper* = reel con ER alto y multiplicador < 1. *Relative Success* = mediana de vistas ÷ seguidores × 1000.

## 2. Fórmula de viralidad propia

Basada en el "outlier score" que usan las herramientas de YouTube e Instagram (vistas ÷ mediana del propio canal, usando la mediana y no el promedio), con tres correcciones que Viralytics no tiene.

### 2.1 Multiplicador (¿le fue mejor de lo normal a esa cuenta?)
```
multiplicador = vistas del reel ÷ mediana de vistas de los 30 reels anteriores del mismo perfil (sin contar el propio)
```
- **Reels:** vistas. **Posts y carruseles:** likes + comentarios (Instagram no da vistas públicas en todos los posts).
- **Línea base móvil:** compara cada reel con lo que la cuenta lograba en esa época, no con todo el historial. Si la cuenta creció, sus reels viejos no quedan castigados.
- **Confianza:** con menos de 8 reels de referencia se marca "pocos datos" y no se etiqueta como viral.
- **Madurez:** un reel de menos de 72 h se marca "En curso" y no entra en ninguna mediana; entre 3 y 7 días la etiqueta es provisional.

### 2.2 Niveles (en español, configurables)
| Multiplicador | Etiqueta |
|---|---|
| ≥ 10× | 🚀 Mega viral |
| ≥ 5× | 🔥 Viral |
| ≥ 2× | ⚡ Despegó |
| 1.25× – 2× | ↗ Arriba de lo normal |
| 0.8× – 1.25× | = Normal |
| < 0.8× | ↘ Bajo lo normal |

Etiquetas extra: **💎 Joya oculta** (ER ≥ percentil 75 del perfil y multiplicador < 1: gustó mucho a quien lo vio pero no se distribuyó; buena idea para rehacer), **Collab**, **En curso**.

### 2.3 Métricas de apoyo
- **ER (engagement)** de un reel = (likes + comentarios) ÷ vistas. Para posts = (likes + comentarios) ÷ seguidores.
- **Alcance vs. seguidores** = vistas ÷ seguidores. Sirve para comparar cuentas de tamaños distintos.

### 2.4 Puntaje Viral 0–100 (para el ranking entre competidores)
El multiplicador solo dice si a una cuenta le fue bien *respecto de sí misma*: una cuenta chica con un 50× puede tener pocas vistas. Para el ranking del nicho se combina:
```
Puntaje = 50 % percentil(multiplicador) + 30 % percentil(vistas ÷ seguidores) + 20 % percentil(ER)
```
Los percentiles se calculan sobre todos los reels del grupo comparado. Es fácil de explicar a un cliente y no lo domina ningún perfil gigante.

## 3. Mejoras sobre Viralytics
1. **Sin límites propios:** todo el historial, cualquier rango de fechas, exportar todo. El único freno es el ritmo seguro frente a Instagram, con escaneo que se pausa y se reanuda.
2. **Fórmula más justa:** línea base móvil, madurez del reel y aviso de "pocos datos" en cada estadística (Best Time, Top performers, etc.).
3. **Ranking del nicho:** los mejores reels de *todos* los competidores juntos, ordenados por Puntaje Viral, con filtros por fecha, nivel y tipo. Es la vista principal para buscar ideas.
4. **Comparar N perfiles** (no solo 2) en una tabla: mediana de vistas, % de reels virales, frecuencia, mejor hora, ER.
5. **Clientes y colecciones:** grupos de competidores por cliente y guardar reels en colecciones ("ideas para cliente X"), exportables.
6. **Cola de escaneo:** agregar 20 perfiles y que se escaneen solos, uno tras otro, con progreso.
7. **Ganchos:** de la transcripción se extraen las primeras frases (el *hook*) como columna propia, para ver qué ganchos se repiten en los virales.
8. **Excel completo:** una hoja por perfil más una hoja "Ranking" y una "Resumen", con portada, enlace y transcripción.
9. **Todo en español** y con la zona horaria de Bogotá por defecto.

## 4. Principios
- Rápido de leer: el color y la etiqueta dicen todo antes que el número.
- Nunca mostrar una conclusión sin decir con cuántos datos se calculó.
- El panel es para *un* perfil; el Centro es para trabajar *entre* perfiles.
- Diseño y marca propios; no se copian assets, textos ni nombre de Viralytics.

## 5. Identidad visual
- **Nombre provisional:** **Radar** (por confirmar con el usuario).
- **Base:** grafito oscuro `#12141A` / superficie `#1B1E27` / texto `#E8EAF0`; modo claro equivalente (`#F7F7FA` / `#FFFFFF` / `#14161C`).
- **Acento de marca:** verde lima `#C6F432` (radar), distinto del rojo de Viralytics y del degradado de Instagram.
- **Tipografía:** Inter (números tabulares en tablas).
- **Colores de nivel** (fondo sólido para virales, tenue para el resto):

| Nivel | Color | Icono |
|---|---|---|
| Mega viral (≥ 10×) | `#A855F7` violeta | 🚀 |
| Viral (≥ 5×) | `#F97316` naranja | 🔥 |
| Despegó (≥ 2×) | `#22C55E` verde | ⚡ |
| Arriba (1.25–2×) | `#60A5FA` azul tenue | ↗ |
| Normal (0.8–1.25×) | `#9CA3AF` gris tenue | = |
| Bajo (< 0.8×) | `#F87171` rojo tenue | ↘ |
| Joya oculta | `#22D3EE` cian, contorno | 💎 |
| En curso (< 72 h) | gris rayado | ⏳ |

## 6. Pantallas

### 6.1 Sobre Instagram
1. **Badge en cada miniatura** (esquina superior izquierda): `🔥 6.2×` + `ER 4.1%`; debajo, etiquetas pequeñas (`💎`, `Collab`). Al pasar el mouse: vistas, likes, comentarios, fecha y "comparado con 30 reels".
2. **Chip del perfil** (abajo a la derecha): "Radar · 276 posts · mediana 9.2K · 7 virales". Clic → abre el panel.
3. **Botón junto a "Seguir"**: `Escanear con Radar` (o `Actualizar` si ya está escaneado) + menú para elegir cliente.

### 6.2 Panel lateral (perfil abierto)
Cabecera fija: foto, @usuario, seguidores, estado del escaneo (barra de progreso o "completo · actualizado hace 2 h"), tipo (Reels / Posts / Todo), rango (30 d · 90 d · 1 año · Todo · Personalizado), botones **Escanear**, **Agregar a cliente**, **Exportar**.

Pestañas:
- **Resumen:** tarjetas (mediana de vistas, % virales, ER mediano, publicaciones por semana), histograma por nivel, **Top 6** con miniatura, aviso de confianza.
- **Contenido:** grilla con filtros (nivel, tipo, duración, collab, fechas), orden por cualquier métrica, búsqueda por caption y por **texto de la transcripción**; selección múltiple → transcribir, guardar en colección o exportar.
- **Tiempo:** línea de vistas con puntos coloreados por nivel; mapa de calor de mejor hora (solo si hay ≥ 30 posts, si no se avisa); calendario de publicaciones.
- **Palabras:** hashtags y palabras del caption ordenados por multiplicador mediano (no solo por frecuencia), y **ganchos de los virales**.

### 6.3 Centro (pestaña propia)
Barra lateral: **Clientes · Ranking · Comparar · Colecciones · Cola · Ajustes**. Selector de cliente arriba (incluye "Mi marca").
- **Clientes:** tarjetas por cliente con sus perfiles (propios y competidores), estado de escaneo, botón "Escanear todos".
- **Ranking del nicho:** grilla grande de los mejores posts del cliente seleccionado por **Puntaje Viral**, con filtros (rango, nivel mínimo, tipo, perfil, duración) y búsqueda en transcripciones. Cada tarjeta: miniatura, @perfil, nivel, multiplicador, vistas, puntaje, gancho. Acciones: abrir en Instagram, transcribir, guardar en colección.
- **Comparar:** tabla de N perfiles (seguidores, mediana de vistas, % virales, ER, posts/semana, duración típica, mejor franja) con la marca propia resaltada; mini gráfica por perfil.
- **Colecciones:** carpetas por cliente con notas; exportar una colección a Excel.
- **Cola:** perfiles en espera/escaneando/pausados, motivo de pausa, hora de reanudación, botones pausar/reanudar/quitar.
- **Ajustes:** umbrales de niveles, ritmo de escaneo, idioma de transcripción, zona horaria, mostrar badges, formato de números, exportar/importar base, borrar datos.

## 7. Flujos
1. **Analizar un perfil:** abrir perfil → `Escanear con Radar` → badges aparecen mientras escanea → panel con Resumen.
2. **Montar un cliente:** Centro → Clientes → nuevo cliente → pegar lista de @usuarios → "Escanear todos" (cola) → notificación al terminar.
3. **Buscar ideas:** Centro → Ranking → filtro "últimos 90 días, ≥ Viral" → transcribir los 10 primeros → guardar en colección "Ideas diciembre" → exportar Excel.
4. **Comparar con mi marca:** Centro → Comparar → cliente "Mi marca" → ver en qué métricas está debajo de la mediana del nicho.
