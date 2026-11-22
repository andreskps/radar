import { describe, expect, it } from 'vitest';
import { extractHashtags, extractWords, termsByMultiplier } from '../../src/metrics';

describe('extractHashtags', () => {
  it('minúsculas, sin repetir, con acentos', () => {
    expect(extractHashtags('Hola #Perfume #perfume #reseña_2026 fin')).toEqual(['#perfume', '#reseña_2026']);
  });
  it('vacío', () => {
    expect(extractHashtags(null)).toEqual([]);
    expect(extractHashtags('sin etiquetas')).toEqual([]);
  });
});

describe('extractWords', () => {
  it('quita palabras vacías, enlaces, menciones, hashtags, números y palabras cortas', () => {
    const words = extractWords('Los 3 MEJORES perfumes para el verano 2026 con @tienda https://x.co/abc #oferta de AROMA y aroma');
    expect(words).toEqual(['mejores', 'perfumes', 'verano', 'aroma']);
  });
  it('vacío', () => {
    expect(extractWords(undefined)).toEqual([]);
    expect(extractWords('😀 !!')).toEqual([]);
  });
});

describe('termsByMultiplier', () => {
  const entries = [
    { multiplier: 6, caption: 'Perfume dulce #viral #perfume' },
    { multiplier: 4, caption: 'Perfume amaderado #viral' },
    { multiplier: 5, caption: 'Perfume dulce #viral #perfume' },
    { multiplier: 0.5, caption: 'Perfume barato #perfume' },
    { multiplier: 0.7, caption: 'Perfume barato #perfume' },
    { multiplier: null, caption: 'Perfume dulce #viral' },
  ];

  it('ordena hashtags por multiplicador mediano, no por frecuencia', () => {
    const r = termsByMultiplier(entries, { kind: 'hashtag', minCount: 2 });
    expect(r.sampleSize).toBe(5);
    // #perfume aparece más veces, pero su mediana de [0.5, 0.7, 5, 6] es 2.85 < 5.
    expect(r.terms.map((t) => [t.term, t.count])).toEqual([
      ['#viral', 3],
      ['#perfume', 4],
    ]);
    expect(r.terms[0]!.medianMultiplier).toBe(5);
    expect(r.terms[1]!.medianMultiplier).toBeCloseTo(2.85, 10);
  });

  it('palabras, con mínimo de apariciones y límite', () => {
    const r = termsByMultiplier(entries, { kind: 'word', minCount: 2, limit: 2 });
    expect(r.terms).toEqual([
      { term: 'dulce', count: 2, medianMultiplier: 5.5 },
      { term: 'perfume', count: 5, medianMultiplier: 4 },
    ]);
  });

  it('usa la lista de hashtags si viene y desempata por cantidad y nombre', () => {
    const r = termsByMultiplier(
      [
        { multiplier: 2, hashtags: ['B', '#a'] },
        { multiplier: 2, hashtags: ['b', 'c'] },
        { multiplier: 2, hashtags: ['#A'] },
        { multiplier: 2, hashtags: ['c'] },
        { multiplier: 2, hashtags: ['b'] },
      ],
      { kind: 'hashtag', minCount: 1 },
    );
    expect(r.terms.map((t) => t.term)).toEqual(['#b', '#a', '#c']);
  });

  it('por defecto exige 3 apariciones', () => {
    expect(termsByMultiplier(entries, { kind: 'word' }).terms.map((t) => t.term)).toEqual(['perfume']);
  });
});
