import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Permisos: ver docs/architecture.md §4.1
export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
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
