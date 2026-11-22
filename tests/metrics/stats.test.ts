import { describe, expect, it } from 'vitest';
import { median, percentileRank, quantile, TIER_LABELS, tierOf, VIRAL_TIERS } from '../../src/metrics';

describe('median', () => {
  it('vacío → null', () => expect(median([])).toBeNull());
  it('impar', () => expect(median([3, 1, 2])).toBe(2));
  it('par', () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it('no modifica la lista', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('quantile (como PERCENTIL.INC)', () => {
  it('interpola', () => expect(quantile([1, 2, 3, 4], 0.75)).toBe(3.25));
  it('un solo valor', () => expect(quantile([7], 0.75)).toBe(7));
  it('limita q a [0, 1]', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
  });
  it('vacío → null', () => expect(quantile([], 0.5)).toBeNull());
});

describe('percentileRank', () => {
  const sorted = [1, 2, 2, 3, 5];
  it('menor = 0 y mayor = 1', () => {
    expect(percentileRank(sorted, 1)).toBe(0);
    expect(percentileRank(sorted, 5)).toBe(1);
  });
  it('empates comparten el rango medio', () => expect(percentileRank(sorted, 2)).toBe(0.375));
  it('un solo valor → 0.5', () => expect(percentileRank([4], 4)).toBe(0.5));
  it('valor ausente queda entre sus vecinos y dentro de [0, 1]', () => {
    expect(percentileRank(sorted, 4)).toBe(0.875);
    expect(percentileRank(sorted, 0)).toBe(0);
    expect(percentileRank(sorted, 9)).toBe(1);
  });
});

describe('tiers', () => {
  it('etiquetas en español', () => {
    expect(TIER_LABELS[tierOf(10)]).toBe('Mega viral');
    expect(TIER_LABELS[tierOf(2)]).toBe('Despegó');
  });
  it('cuentan como virales los ≥ 2×', () => {
    expect(VIRAL_TIERS).toContain(tierOf(2));
    expect(VIRAL_TIERS).not.toContain(tierOf(1.99));
  });
});
