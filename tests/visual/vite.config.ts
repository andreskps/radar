// Vista previa local del panel con datos simulados (sin Instagram ni extensión).
// Uso: npx vite --config tests/visual/vite.config.ts  → http://localhost:5199
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  server: { port: 5199, strictPort: true },
});
