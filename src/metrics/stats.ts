// Estadística básica, sin dependencias.

const ascending = (a: number, b: number) => a - b;

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/**
 * Cuantil con interpolación lineal (igual que PERCENTIL.INC de Excel / Google Sheets),
 * para que los resultados se puedan comprobar en una hoja de cálculo.
 */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort(ascending);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const low = sorted[lo]!;
  return low + (sorted[hi]! - low) * (pos - lo);
}

/**
 * Posición relativa de `value` dentro de `sorted` (ordenado ascendente), de 0 a 1.
 * El menor vale 0 y el mayor 1; los empates comparten el rango medio. Con un solo valor, 0.5.
 */
export function percentileRank(sorted: readonly number[], value: number): number {
  const n = sorted.length;
  if (n <= 1) return 0.5;
  const less = bound(sorted, value, false);
  const equal = bound(sorted, value, true) - less;
  const rank = equal > 0 ? less + (equal - 1) / 2 : less - 0.5;
  return Math.min(1, Math.max(0, rank / (n - 1)));
}

/** Búsqueda binaria: cuántos elementos son < value (o ≤ value si `inclusive`). */
function bound(sorted: readonly number[], value: number, inclusive: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const v = sorted[mid]!;
    if (v < value || (inclusive && v === value)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
