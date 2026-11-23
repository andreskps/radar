# Radar (nombre provisional)

Extensión de Chrome para analizar el rendimiento del contenido público de perfiles de Instagram: detecta posts y Reels virales, compara cada uno contra la mediana del perfil y exporta los datos.

> En construcción: Fases 0 a 6 listas (lectura, escaneo, etiquetas, panel y exportación). Ver `docs/roadmap.md`.

## Desarrollo
Requiere Node.js 22 o superior.

```
npm install
npm run dev        # abre un navegador de pruebas con la extensión y recarga en caliente
npm run build      # genera dist/chrome-mv3
npm run typecheck
npm test
```

## Instalar en otro PC
Necesitas [Git](https://git-scm.com/downloads) y [Node.js](https://nodejs.org) 22 o superior. En una terminal:

```
git clone https://github.com/andreskps/radar.git
cd radar
npm ci
npm run build
```

Luego carga `radar/dist/chrome-mv3` como se explica abajo. Para actualizar más adelante: `git pull`, `npm ci`, `npm run build` y ↻ en la página de extensiones.

Los datos escaneados viven en el navegador, no en el repositorio. Para pasarlos de un PC a otro: Centro › Datos › exportar la base (JSON) y, en el otro PC, importarla.

## Instalar en Chrome, Edge o Brave
1. `npm run build`
2. Abre `chrome://extensions` (o `edge://extensions` / `brave://extensions`) y activa **Modo de desarrollador**.
3. **Cargar descomprimida** → elige la carpeta `dist/chrome-mv3`.
4. Abre instagram.com: abajo a la derecha debe aparecer **Radar activo**. Clic en el icono de la extensión → abre el **Centro**.
