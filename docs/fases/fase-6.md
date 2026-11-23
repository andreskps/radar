# Fase 6: Exportación (22-11-2026)

**Estado:** implementada y validada fuera de Instagram, con pruebas automáticas, el Excel real de este equipo y la vista previa del panel y del Centro en el navegador. Quedan pendientes tres cosas:
- abrir el archivo en Google Sheets;
- importar la base en otro perfil de Chrome con la extensión instalada;
- exportar desde el panel dentro de Instagram.

Las tres dependen del usuario: las dos primeras necesitan su cuenta de Google o un segundo perfil de Chrome, y la tercera la recarga ↻ pendiente desde la Fase 4.

## Objetivo
- Excel por perfil, con las hojas Resumen y Posts.
- CSV.
- Exportar e importar la base completa en JSON (RF-16, RF-17).

Con esta fase se cierra el MVP.

## Cambios
| Archivo | Qué hace |
|---|---|
| `src/export/zip.ts` | ZIP mínimo con CRC32, comprimido con `CompressionStream('deflate-raw')` cuando el entorno lo tiene. |
| `src/export/xlsx.ts` | Escritor de .xlsx propio. Ver el detalle abajo. |
| `src/export/csv.ts` | CSV RFC 4180 con BOM UTF-8 y CRLF. Neutraliza las fórmulas (`=`, `+`, `-` y `@` al inicio). El separador y el decimal se pueden cambiar (D10). |
| `src/export/profile.ts` | Arma las hojas Resumen y Posts y el CSV con las mismas 22 columnas. Ver el detalle abajo. |
| `src/export/backup.ts` | Copia completa de la base en JSON. Ver el detalle abajo. |
| `src/export/download.ts` | Descarga con un enlace temporal y URL de Blob. No necesita el permiso `downloads`. |
| `src/ui/panel/ExportButtons.tsx`, `Panel.tsx` | "Exportar todo: Excel · CSV" en la cabecera del panel. Exporta todo el historial guardado, no solo el rango visible, y dice cuántas filas y en cuánto tiempo. |
| `src/entrypoints/center/DataView.tsx`, `App.tsx` | Centro › **Datos**: la tabla de perfiles guardados con Excel y CSV para cada uno, más "Exportar base" e "Importar base…". |
| `src/ui/format.ts` | Nueva `durationText`: "35 ms" o "1,4 s". |
| `tests/export/export.test.ts` | 8 pruebas: CSV, XLSX (abriendo el ZIP y comprobando el CRC), perfil, M5 con 10.000 filas, ida y vuelta de la base, choque de usuario y archivos inválidos. |
| `tests/visual/center.html` y `center.tsx` | Vista previa del Centro real en `http://localhost:5199/center.html`, sobre IndexedDB local con dos perfiles simulados. Con `?reset` se vuelve a sembrar y con `?empty` queda vacía. |

**Detalle del escritor de .xlsx (`xlsx.ts`):**
- Textos en línea, sin tabla de cadenas compartidas.
- Formatos de número: entero, decimal, multiplicador `0.0×`, porcentaje y fecha con o sin hora.
- Enlaces con la fórmula `HYPERLINK`, que funciona igual en Excel y en Sheets.
- Encabezado fijo con filtros, y `_xlnm._FilterDatabase` para que Excel no "repare" el archivo.
- Quita los caracteres que XML no acepta y corta cada celda a 32.767 caracteres.
- Las fechas van en la hora de Bogotá, porque Excel no guarda zona horaria.

**Detalle de la exportación por perfil (`profile.ts`):**
- La hoja Resumen trae el perfil, sus estadísticas con la muestra y el aviso de pocos datos, cuántos posts hay de cada nivel y cómo leer los números (con los umbrales reales).
- La hoja Posts va de la más reciente a la más vieja.
- El archivo se llama `radar-usuario-AAAA-MM-DD.xlsx`.

**Detalle de la copia de la base (`backup.ts`):**
- Incluye 9 tablas y deja fuera `scanJobs`: un trabajo a medias no sirve en otro equipo.
- Al importar se fusiona por clave, en una sola transacción. Reglas:
  - si otra cuenta tiene el mismo usuario, se renombra la vieja a `usuario~id`, como ya hace el escaneo;
  - si un post viejo tiene el mismo código con otro id, se reemplaza;
  - los históricos (snapshots) no se duplican: se compara el post y el momento.
- Valida el archivo y muestra los errores en español.

No hay dependencias nuevas.

## Decisiones
- **D9.** El Excel se escribe con código propio y no con ExcelJS, como decía el stack. Motivos:
  1. Los botones del panel viven en el content script, que se carga en cada página de Instagram. ExcelJS pesa cerca de 1 MB minificado y trae polyfills de Node.
  2. Lo que se necesita es poco: varias hojas, formatos, enlaces y filtros.
  3. El mismo código funciona en el panel, el Centro y las pruebas.

  Con todo esto, el content script pesa 440 kB. Si más adelante hacen falta gráficas dentro del Excel o estilos complejos, se reevalúa.
- **D10.** El CSV es estándar: comas, punto decimal y UTF-8 con BOM. Es lo que leen Google Sheets y las demás herramientas. Este equipo está en es-CO, donde Excel usa `;` y coma decimal al abrir un CSV con doble clic, así que ese CSV saldría en una sola columna. **Para Excel se usa el botón Excel (.xlsx)**, que no tiene ese problema. `toCsv` acepta `{ separator: ';', decimal: ',' }`, y la Fase 9 (Ajustes › formato) puede exponerlo.
- Desde el panel se exporta **todo el historial** del perfil, no lo filtrado. Exportar una selección llega con la selección múltiple (Fase 7).
- La hoja "Ranking" y el Excel de varias hojas por cliente son de la Fase 7 (RF-16 completo), porque necesitan clientes.
- La sección "Datos" del Centro adelanta la parte de Ajustes › "exportar/importar base" de design.md §6.3. Las demás secciones siguen apagadas hasta la Fase 7.

## Validación
| Criterio | Resultado |
|---|---|
| `npm test` | ✅ 207 de 207, de las que 8 son nuevas en `tests/export/`. Se corrió en un worktree limpio desde `2c67b81` con solo los archivos de esta fase. |
| `npm run typecheck` y `npm run build` | ✅ en el mismo worktree. El content script pesa 440 kB. |
| **M5: 10.000 filas a Excel en ≤ 15 s** | ✅ **435 ms** de la base (fake-indexeddb) al archivo de 1,24 MB. El CSV de 10.000 filas tarda 33 ms. En el navegador, desde el panel: Excel de 1.000 filas en 35 ms y CSV en 5 ms. |
| **El Excel abre sin errores en Excel** | ✅ Microsoft Excel de este equipo, por COM. Ver el detalle abajo. |
| El Excel abre sin errores en Google Sheets | ⏳ Pendiente del usuario: hay que subirlo a su Google Drive. Usa solo partes estándar: textos en línea, `HYPERLINK` y formatos de número integrados o personalizados simples. |
| **Importar la base en otro perfil deja todo igual** | ✅ en las pruebas y ✅ en el navegador. Ver el detalle abajo. ⏳ Falta hacerlo con la extensión en un segundo perfil de Chrome. |
| Exportar desde el panel en Instagram | ⏳ Depende de la recarga ↻ pendiente. En la vista previa del panel, los dos botones descargan el archivo con el nombre correcto. |

**Detalle de la prueba en Excel (por COM):**
- `radar-60.xlsx` y `radar-10000.xlsx` abren en unos 250 ms.
- Las dos hojas tienen 22 columnas. Posts trae 10.001 filas, con el encabezado.
- Los filtros están activos y el encabezado queda fijo.
- Los enlaces funcionan.
- Fechas y formatos se ven bien: `2026-11-18 07:00`, que es 12:00 UTC en hora de Bogotá, `1.000`, `0,3×` y `10,5%`.
- No se generó ningún registro de reparación (`error*.xml` en %TEMP%).
- El zip y el XML de cada parte también se revisaron con Python (`zipfile.testzip` y `ElementTree`).

**Detalle de la prueba de importar la base:**
- En las pruebas: exportar, pasar a JSON y luego importar en una base vacía deja las 9 tablas idénticas a la original (los ids de los snapshots no cuentan, porque son locales). `loadPanelData` da el mismo resultado en las dos bases. Importar dos veces no duplica nada, y la cola de escaneo no se copia.
- En el navegador (vista previa del Centro): se exportó la base (858 KB, 2 perfiles, 1.120 posts, métricas e históricos), se vació y se importó el archivo desde "Importar base…". Los conteos quedaron idénticos y la tabla volvió a mostrar los dos perfiles.

## Pendientes
- **Del usuario:**
  - abrir un Excel exportado en Google Sheets;
  - importar una copia en un segundo perfil de Chrome con la extensión;
  - pulsar ↻ en `chrome://extensions`, de lo que dependen las validaciones en vivo de las Fases 4, 5 y 6.
- Con la recarga hecha: exportar @attoperfumes (3.359 posts) desde el panel y desde el Centro, y medir el tiempo real (M5 en vivo).
- Mientras se hacía esta fase había cambios ajenos sin commit en `src/scan/`, `schema.ts`, `controller.ts`, `background.ts`, `index.tsx`, `ProfileChip.tsx`, `src/ui/range.ts` y `tests/scan/range.test.ts`, que agregan un rango de escaneo (`ScanRange`). No se incluyeron en este commit, y con ellos `tsc` da errores en `controller.ts` e `index.tsx`.
