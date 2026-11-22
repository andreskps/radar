// Cálculos del panel lateral (design.md §6.2). Funciones puras sobre los posts de un perfil.
// Cada estadística devuelve su tamaño de muestra (`n`) para mostrar la confianza (design.md §4).
import type { PanelPost } from '../../db/views';
import { bestTime, type BestTimeResult } from '../../metrics/bestTime';
import { median } from '../../metrics/stats';
import { termsByMultiplier, type TermStat } from '../../metrics/terms';
import { VIRAL_TIERS } from '../../metrics/tiers';
import type { Tier } from '../../metrics/types';

export const DAY_MS = 86_400_000;
export const MIN_SAMPLE = 8;
export const TIME_ZONE = 'America/Bogota';

export type RangeKey = '30d' | '90d' | '1y' | 'all';
export type TypeKey = 'all' | 'reel' | 'post';

export const RANGE_DAYS: Record<RangeKey, number | null> = { '30d': 30, '90d': 90, '1y': 365, all: null };

export interface Filters {
  range: RangeKey;
  type: TypeKey;
  now: number;
}

/** Posts del rango y tipo elegidos ("post" incluye carruseles). */
export function applyFilters(posts: readonly PanelPost[], f: Filters): PanelPost[] {
  const days = RANGE_DAYS[f.range];
  const from = days === null ? -Infinity : f.now - days * DAY_MS;
  return posts.filter((p) => p.takenAt >= from && (f.type === 'all' || (f.type === 'reel' ? p.type === 'reel' : p.type !== 'reel')));
}

export interface Stat {
  value: number | null;
  n: number;
  /** Menos de 8 datos: se muestra el aviso. */
  low: boolean;
}

const stat = (value: number | null, n: number): Stat => ({ value, n, low: n < MIN_SAMPLE });

export type TierBucket = Tier | 'en_curso' | 'sin_datos';
export const TIER_ORDER: readonly TierBucket[] = ['mega_viral', 'viral', 'despego', 'arriba', 'normal', 'bajo', 'en_curso', 'sin_datos'];

export function bucketOf(p: PanelPost): TierBucket {
  if (p.maturity === 'en_curso') return 'en_curso';
  if (p.tier && p.confidence === 'ok') return p.tier;
  return 'sin_datos';
}

export interface Summary {
  count: number;
  medianViews: Stat;
  /** % de posts virales (≥ 2×) entre los que tienen nivel. */
  viralPct: Stat;
  medianEr: Stat;
  /** Publicaciones por semana en el periodo cubierto. */
  perWeek: Stat;
  tiers: Record<TierBucket, number>;
  top: PanelPost[];
}

export function summarize(posts: readonly PanelPost[], f: Pick<Filters, 'range' | 'now'>): Summary {
  const views = posts.filter((p) => p.type === 'reel' && p.views !== null).map((p) => p.views!);
  const rated = posts.filter((p) => bucketOf(p) !== 'en_curso' && bucketOf(p) !== 'sin_datos');
  const virals = rated.filter((p) => VIRAL_TIERS.includes(p.tier!)).length;
  const ers = posts.filter((p) => p.er !== null).map((p) => p.er!);

  const tiers = Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<TierBucket, number>;
  for (const p of posts) tiers[bucketOf(p)]++;

  // Semanas: del rango elegido, o del primer post al día de hoy si es "Todo".
  let weeks = 0;
  if (posts.length) {
    const days = RANGE_DAYS[f.range] ?? (f.now - Math.min(...posts.map((p) => p.takenAt))) / DAY_MS;
    weeks = Math.max(days / 7, 1);
  }

  const top = [...rated].sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0)).slice(0, 6);
  return {
    count: posts.length,
    medianViews: stat(median(views), views.length),
    viralPct: stat(rated.length ? virals / rated.length : null, rated.length),
    medianEr: stat(median(ers), ers.length),
    perWeek: stat(posts.length ? posts.length / weeks : null, posts.length),
    tiers,
    top,
  };
}

// ---- Contenido ----
export type SortKey = 'date' | 'multiplier' | 'views' | 'likes' | 'comments' | 'er';

export interface ContentQuery {
  tier: TierBucket | 'all' | 'virales';
  collab: 'all' | 'yes' | 'no';
  search: string;
  sort: SortKey;
  desc: boolean;
}

export const DEFAULT_QUERY: ContentQuery = { tier: 'all', collab: 'all', search: '', sort: 'date', desc: true };

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function queryContent(posts: readonly PanelPost[], q: ContentQuery): PanelPost[] {
  const words = fold(q.search).split(/\s+/).filter(Boolean);
  const out = posts.filter((p) => {
    const b = bucketOf(p);
    if (q.tier === 'virales' ? !VIRAL_TIERS.includes(b as Tier) : q.tier !== 'all' && b !== q.tier) return false;
    if (q.collab !== 'all' && p.collab !== (q.collab === 'yes')) return false;
    if (words.length) {
      const text = fold(`${p.caption ?? ''} ${p.hashtags.join(' ')}`);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  const key = (p: PanelPost): number | null => {
    switch (q.sort) {
      case 'date':
        return p.takenAt;
      case 'multiplier':
        return p.multiplier;
      case 'views':
        return p.views;
      case 'likes':
        return p.likesHidden ? null : p.likes;
      case 'comments':
        return p.comments;
      case 'er':
        return p.er;
    }
  };
  // Los que no tienen dato van al final, en cualquier dirección.
  return out.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return b.takenAt - a.takenAt;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return q.desc ? kb - ka : ka - kb;
  });
}

// ---- Tiempo ----
export interface TimePoint {
  x: number;
  y: number;
  bucket: TierBucket;
  code: string;
}

/** Valor de rendimiento en el tiempo: vistas (reels) o likes + comentarios (posts). */
export function timeSeries(posts: readonly PanelPost[]): TimePoint[] {
  return posts
    .map((p) => {
      const y = p.type === 'reel' ? p.views : p.likesHidden || p.likes === null ? null : p.likes + (p.comments ?? 0);
      return y === null ? null : { x: p.takenAt, y, bucket: bucketOf(p), code: p.code };
    })
    .filter((p): p is TimePoint => p !== null)
    .sort((a, b) => a.x - b.x);
}

export function heatmap(posts: readonly PanelPost[]): BestTimeResult {
  const entries = posts.filter((p) => p.maturity !== 'en_curso').map((p) => ({ takenAt: p.takenAt, multiplier: p.confidence === 'ok' ? p.multiplier : null }));
  return bestTime(entries, { timeZone: TIME_ZONE });
}

export interface MonthCount {
  key: string;
  label: string;
  count: number;
  virals: number;
}

const monthKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' });
const monthLabel = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, month: 'short', year: '2-digit' });

/** Publicaciones por mes (calendario), de la más vieja a la más nueva, con los meses vacíos. */
export function monthlyCounts(posts: readonly PanelPost[]): MonthCount[] {
  if (!posts.length) return [];
  const map = new Map<string, MonthCount>();
  for (const p of posts) {
    const key = monthKey.format(p.takenAt).slice(0, 7);
    const m = map.get(key) ?? { key, label: monthLabel.format(p.takenAt), count: 0, virals: 0 };
    m.count++;
    if (VIRAL_TIERS.includes(bucketOf(p) as Tier)) m.virals++;
    map.set(key, m);
  }
  const keys = [...map.keys()].sort();
  const out: MonthCount[] = [];
  let [y, mo] = keys[0]!.split('-').map(Number) as [number, number];
  const [ly, lm] = keys.at(-1)!.split('-').map(Number) as [number, number];
  while (y < ly || (y === ly && mo <= lm)) {
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    out.push(map.get(key) ?? { key, label: monthLabel.format(Date.UTC(y, mo - 1, 15)), count: 0, virals: 0 });
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return out;
}

// ---- Palabras ----
export interface WordsResult {
  sampleSize: number;
  hashtags: TermStat[];
  words: TermStat[];
}

export function words(posts: readonly PanelPost[]): WordsResult {
  const entries = posts.map((p) => ({ multiplier: p.confidence === 'ok' ? p.multiplier : null, caption: p.caption, hashtags: p.hashtags }));
  const h = termsByMultiplier(entries, { kind: 'hashtag', limit: 20 });
  const w = termsByMultiplier(entries, { kind: 'word', limit: 20 });
  return { sampleSize: h.sampleSize, hashtags: h.terms, words: w.terms };
}
