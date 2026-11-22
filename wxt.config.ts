import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Build de pruebas (VITE_RADAR_DEV_BRIDGE=1): puente para herramientas automatizadas y recarga
// automática. El service worker compara su sello con build-stamp.txt del disco y se recarga
// solo cuando hay un build nuevo. El build normal no incluye nada de esto.
const devBridge = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_RADAR_DEV_BRIDGE === '1';
const buildStamp = devBridge ? String(Date.now()) : '';

// Permisos: ver docs/architecture.md §4.1
export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    define: { __RADAR_BUILD_STAMP__: JSON.stringify(buildStamp) },
  }),
  hooks: {
    'build:publicAssets': (_wxt, assets) => {
      if (devBridge) assets.push({ relativeDest: 'build-stamp.txt', contents: buildStamp });
    },
  },
  manifest: {
    name: 'Radar',
    description: 'Analiza qué contenido de la competencia en Instagram se volvió viral.',
    permissions: ['storage', 'unlimitedStorage', 'offscreen', 'alarms', 'notifications', 'downloads'],
    host_permissions: ['*://*.instagram.com/*'],
    action: {
      default_title: 'Abrir Centro de Radar',
    },
  },
});
