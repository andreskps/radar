import type { Thresholds, Tier } from './types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  megaViral: 10,
  viral: 5,
  despego: 2,
  arriba: 1.25,
  normal: 0.8,
};

/** Nivel según el multiplicador. Cada umbral es inclusivo (exactamente 2× = Despegó). */
export function tierOf(multiplier: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): Tier {
  if (multiplier >= thresholds.megaViral) return 'mega_viral';
  if (multiplier >= thresholds.viral) return 'viral';
  if (multiplier >= thresholds.despego) return 'despego';
  if (multiplier >= thresholds.arriba) return 'arriba';
  if (multiplier >= thresholds.normal) return 'normal';
  return 'bajo';
}

export const TIER_LABELS: Record<Tier, string> = {
  mega_viral: 'Mega viral',
  viral: 'Viral',
  despego: 'Despegó',
  arriba: 'Arriba de lo normal',
  normal: 'Normal',
  bajo: 'Bajo lo normal',
};

/** Niveles que cuentan como "viral" en los resúmenes (≥ 2×). */
export const VIRAL_TIERS: readonly Tier[] = ['mega_viral', 'viral', 'despego'];
