// Chrome rechaza un content script con "no-caracteres" Unicode (U+FFFE, U+FFFF, U+FDD0–U+FDEF):
// "No está codificado con UTF-8" y la extensión no carga. En el código se escriben como ￾.
import { describe, expect, it } from 'vitest';

const NONCHAR = /[﷐-﷯￾￿]/;
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx,css,html}', { query: '?raw', import: 'default', eager: true });

describe('codificación del código fuente', () => {
  it('ningún archivo de src/ tiene no-caracteres Unicode escritos tal cual', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const bad = Object.entries(sources)
      .filter(([, text]) => NONCHAR.test(text))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });
});
