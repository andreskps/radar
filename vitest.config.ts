import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/metrics/**/*.ts'],
      reporter: ['text', 'text-summary'],
      // Meta de la Fase 1: cobertura de ramas del motor de métricas ≥ 95 %.
      thresholds: { branches: 95, lines: 95, functions: 95, statements: 95 },
    },
  },
});
