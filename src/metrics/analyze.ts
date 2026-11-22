import { median, quantile } from './stats';
import { DEFAULT_THRESHOLDS, tierOf } from './tiers';
import type { Confidence, Maturity, MetricGroup, MetricsOptions, PostInput, PostMetrics } from './types';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const IN_PROGRESS_MS = 72 * HOUR_MS;
export const PROVISIONAL_MS = 7 * DAY_MS;
export const DEFAULT_WINDOW = 30;
export const DEFAULT_MIN_SAMPLE = 8;

export function groupOf(type: PostInput['type']): MetricGroup {
  return type === 'reel' ? 'reel' : 'post';
}

export function maturityOf(takenAt: number, now: number): Maturity {
  const age = now - takenAt;
  if (age < IN_PROGRESS_MS) return 'en_curso';
  if (age < PROVISIONAL_MS) return 'provisional';
  return 'final';
}

const isCount = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Vistas para reels; likes + comentarios para posts y carruseles. `null` si no hay dato. */
export function performanceValue(post: PostInput): number | null {
  if (post.type === 'reel') return isCount(post.views) ? post.views : null;
  if (post.likesHidden || !isCount(post.likes)) return null;
  return post.likes + (isCount(post.comments) ? post.comments : 0);
}

/** ER del reel ÷ vistas; del post ÷ seguidores. `null` si faltan datos o los likes están ocultos. */
export function engagementRate(post: PostInput, followers: number | null | undefined): number | null {
  if (post.likesHidden || !isCount(post.likes)) return null;
  const interactions = post.likes + (isCount(post.comments) ? post.comments : 0);
  const base = post.type === 'reel' ? post.views : followers;
  return isCount(base) && base > 0 ? interactions / base : null;
}

/**
 * Métricas de cada post de un perfil (devueltas en el mismo orden de entrada).
 *
 * Multiplicador = valor ÷ mediana de los `window` posts anteriores del mismo grupo,
 * sin contar el propio, ni los que están "en curso", ni los que no tienen dato.
 */
export function analyzeProfile(posts: readonly PostInput[], options: MetricsOptions): PostMetrics[] {
  const { now, followers } = options;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const windowSize = options.window ?? DEFAULT_WINDOW;
  const minSample = options.minSample ?? DEFAULT_MIN_SAMPLE;

  const order = posts
    .map((post, idx) => ({ post, idx }))
    .sort((a, b) => a.post.takenAt - b.post.takenAt || (a.post.id < b.post.id ? -1 : 1));

  const refs: Record<MetricGroup, number[]> = { reel: [], post: [] };
  const result: PostMetrics[] = new Array(posts.length);

  for (const { post, idx } of order) {
    const group = groupOf(post.type);
    const value = performanceValue(post);
    const maturity = maturityOf(post.takenAt, now);
    const window = refs[group];
    const sampleSize = window.length;
    const baseline = median(window);

    const multiplier = value !== null && baseline !== null && baseline > 0 ? value / baseline : null;
    let confidence: Confidence;
    if (value === null) confidence = 'sin_datos';
    else if (sampleSize < minSample) confidence = 'pocos_datos';
    else if (multiplier === null) confidence = 'sin_datos';
    else confidence = 'ok';

    result[idx] = {
      postId: post.id,
      group,
      value,
      baseline,
      sampleSize,
      multiplier,
      tier: confidence === 'ok' && maturity !== 'en_curso' ? tierOf(multiplier!, thresholds) : null,
      maturity,
      confidence,
      er: engagementRate(post, followers),
      reach: value !== null && isCount(followers) && followers > 0 ? value / followers : null,
      hiddenGem: false,
      collab: post.collab === true,
    };

    if (value !== null && maturity !== 'en_curso') {
      window.push(value);
      if (window.length > windowSize) window.shift();
    }
  }

  markHiddenGems(result, minSample);
  return result;
}

/** Joya oculta: ER ≥ percentil 75 del grupo y multiplicador < 1 (gustó, pero no se distribuyó). */
function markHiddenGems(metrics: PostMetrics[], minSample: number): void {
  for (const group of ['reel', 'post'] as const) {
    const eligible = metrics.filter((m) => m.group === group && m.er !== null && m.maturity !== 'en_curso');
    if (eligible.length < minSample) continue;
    const p75 = quantile(eligible.map((m) => m.er!), 0.75)!;
    for (const m of eligible) {
      m.hiddenGem = m.confidence === 'ok' && m.multiplier! < 1 && m.er! >= p75;
    }
  }
}
