import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Prueba de ejemplo de la Fase 0: confirma que Vitest y el entorno de WXT funcionan.
describe('entorno de pruebas', () => {
  it('ejecuta pruebas', () => {
    expect(1 + 1).toBe(2);
  });

  it('simula la API del navegador', async () => {
    await fakeBrowser.storage.local.set({ radar: 'ok' });
    expect(await fakeBrowser.storage.local.get('radar')).toEqual({ radar: 'ok' });
  });
});
