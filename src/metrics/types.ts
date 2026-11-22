// Tipos del motor de métricas. Fórmula: docs/design.md §2.

export type PostType = 'reel' | 'post' | 'carousel';

/** Grupo de comparación: los reels se comparan con reels; posts y carruseles entre sí. */
export type MetricGroup = 'reel' | 'post';

export interface PostInput {
  id: string;
  type: PostType;
  /** Fecha de publicación en milisegundos (epoch). */
  takenAt: number;
  /** Vistas (reels). `null`/ausente = dato no disponible, nunca 0. */
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  /** La cuenta ocultó los likes: el post no entra en medianas de likes. */
  likesHidden?: boolean;
  collab?: boolean;
  caption?: string | null;
  hashtags?: string[];
}

export type Tier = 'mega_viral' | 'viral' | 'despego' | 'arriba' | 'normal' | 'bajo';

/** en_curso: < 72 h · provisional: 72 h – 7 días · final: ≥ 7 días. */
export type Maturity = 'en_curso' | 'provisional' | 'final';

/** ok · pocos_datos (< 8 de referencia) · sin_datos (falta la cifra o la línea base es 0). */
export type Confidence = 'ok' | 'pocos_datos' | 'sin_datos';

export interface PostMetrics {
  postId: string;
  group: MetricGroup;
  /** Vistas (reel) o likes + comentarios (post/carrusel). */
  value: number | null;
  /** Mediana de los posts de referencia (hasta 30 anteriores del mismo grupo). */
  baseline: number | null;
  /** Cuántos posts de referencia se usaron. */
  sampleSize: number;
  multiplier: number | null;
  /** Solo con confianza `ok` y fuera de `en_curso`. */
  tier: Tier | null;
  maturity: Maturity;
  confidence: Confidence;
  /** Reel: (likes + comentarios) ÷ vistas. Post: (likes + comentarios) ÷ seguidores. */
  er: number | null;
  /** value ÷ seguidores. */
  reach: number | null;
  hiddenGem: boolean;
  collab: boolean;
}

export interface Thresholds {
  megaViral: number;
  viral: number;
  despego: number;
  arriba: number;
  normal: number;
}

export interface MetricsOptions {
  /** Momento de referencia para la madurez (ms). */
  now: number;
  followers?: number | null;
  thresholds?: Partial<Thresholds>;
  /** Tamaño de la ventana móvil. Por defecto 30. */
  window?: number;
  /** Mínimo de posts de referencia para confiar. Por defecto 8. */
  minSample?: number;
}
