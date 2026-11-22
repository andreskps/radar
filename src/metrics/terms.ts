import { median } from './stats';

// Palabras vacías comunes en español e inglés (los captions mezclan ambos).
const STOPWORDS = new Set(
  (
    'que con para por los las del una uno unos unas como mas más pero sus esta este esto estos estas ese esa eso ' +
    'son fue ser hay muy sin sobre todo todos todas tambien también cuando donde quien porque desde hasta entre ' +
    'tu tus mi mis te nos les ya asi así aqui aquí solo sólo cada otro otra hoy algo nada the and for you your with ' +
    'this that are was have has from not but all our out what when can will just get its it\'s they them their'
  ).split(' '),
);

const URL_RE = /https?:\/\/\S+|www\.\S+/giu;
const TAG_RE = /#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /@[\p{L}\p{N}_.]+/gu;
const WORD_RE = /[\p{L}\p{N}]+/gu;

/** Hashtags del caption, en minúscula y sin repetir. */
export function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  return [...new Set((caption.normalize('NFC').match(TAG_RE) ?? []).map((t) => t.toLowerCase()))];
}

/** Palabras con significado del caption (≥ 3 letras, sin hashtags, menciones, enlaces ni palabras vacías). */
export function extractWords(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const clean = caption.normalize('NFC').toLowerCase().replace(URL_RE, ' ').replace(TAG_RE, ' ').replace(MENTION_RE, ' ');
  const words = (clean.match(WORD_RE) ?? []).filter((w) => w.length >= 3 && !/^\p{N}+$/u.test(w) && !STOPWORDS.has(w));
  return [...new Set(words)];
}

export interface TermEntry {
  multiplier: number | null;
  caption?: string | null;
  hashtags?: string[];
}

export interface TermStat {
  term: string;
  count: number;
  medianMultiplier: number;
}

export interface TermsOptions {
  kind: 'hashtag' | 'word';
  minCount?: number;
  limit?: number;
}

/** Hashtags o palabras ordenados por el multiplicador mediano de los posts que los usan (no solo por frecuencia). */
export function termsByMultiplier(entries: readonly TermEntry[], options: TermsOptions): { sampleSize: number; terms: TermStat[] } {
  const { kind, minCount = 3, limit = 50 } = options;
  const byTerm = new Map<string, number[]>();
  let sampleSize = 0;

  for (const e of entries) {
    if (e.multiplier === null) continue;
    sampleSize++;
    const terms =
      kind === 'hashtag'
        ? e.hashtags?.length
          ? [...new Set(e.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`).toLowerCase()))]
          : extractHashtags(e.caption)
        : extractWords(e.caption);
    for (const t of terms) {
      const list = byTerm.get(t) ?? [];
      list.push(e.multiplier);
      byTerm.set(t, list);
    }
  }

  const terms = [...byTerm.entries()]
    .filter(([, values]) => values.length >= minCount)
    .map(([term, values]) => ({ term, count: values.length, medianMultiplier: median(values)! }))
    .sort((a, b) => b.medianMultiplier - a.medianMultiplier || b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);

  return { sampleSize, terms };
}
