import { percentileRank } from './stats';

export interface ScoreInput {
  id: string;
  multiplier: number | null;
  reach: number | null;
  er: number | null;
}

export interface ScoreWeights {
  multiplier: number;
  reach: number;
  er: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = { multiplier: 0.5, reach: 0.3, er: 0.2 };

/**
 * Puntaje Viral 0–100 para comparar posts de varios perfiles (design.md §2.4):
 * 50 % percentil(multiplicador) + 30 % percentil(vistas ÷ seguidores) + 20 % percentil(ER).
 *
 * Los percentiles se calculan sobre el grupo que se pasa (pasar un solo tipo: reels o posts).
 * Sin multiplicador no hay puntaje. Si falta alcance o ER, su peso se reparte entre los demás.
 */
export function viralScores(items: readonly ScoreInput[], weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): Map<string, number | null> {
  const keys = ['multiplier', 'reach', 'er'] as const;
  const sorted = Object.fromEntries(
    keys.map((k) => [
      k,
      items
        .map((i) => i[k])
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b),
    ]),
  ) as Record<(typeof keys)[number], number[]>;

  const scores = new Map<string, number | null>();
  for (const item of items) {
    if (item.multiplier === null) {
      scores.set(item.id, null);
      continue;
    }
    let total = 0;
    let weightSum = 0;
    for (const k of keys) {
      const v = item[k];
      if (v === null) continue;
      total += weights[k] * percentileRank(sorted[k], v);
      weightSum += weights[k];
    }
    scores.set(item.id, Math.round((total / weightSum) * 100));
  }
  return scores;
}
