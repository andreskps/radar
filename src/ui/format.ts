// Formatos y textos de las etiquetas (design.md §2.2 y §5). Funciones puras.
import type { BadgePost } from '../db/views';
import type { ScanJobRow } from '../db/schema';
import type { Tier } from '../metrics/types';

const trim = (n: number) => (n < 100 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)));

/** 950 · 9.2K · 1.3M. `null` → "—". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1000) return String(Math.round(n));
  if (n < 999_500) return `${trim(n / 1000)}K`;
  return `${trim(n / 1_000_000)}M`;
}

export function multiplierText(m: number | null): string {
  if (m === null) return '—';
  return `${m >= 10 ? Math.round(m) : m.toFixed(1)}×`;
}

export function percent(r: number | null): string {
  if (r === null) return '—';
  return `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
}

export interface TierStyle {
  label: string;
  icon: string;
  color: string;
  /** Fondo sólido para los virales, tenue para el resto. */
  solid: boolean;
}

export const TIER_STYLES: Record<Tier, TierStyle> = {
  mega_viral: { label: 'Mega viral', icon: '🚀', color: '#A855F7', solid: true },
  viral: { label: 'Viral', icon: '🔥', color: '#F97316', solid: true },
  despego: { label: 'Despegó', icon: '⚡', color: '#22C55E', solid: true },
  arriba: { label: 'Arriba de lo normal', icon: '↗', color: '#60A5FA', solid: false },
  normal: { label: 'Normal', icon: '=', color: '#9CA3AF', solid: false },
  bajo: { label: 'Bajo lo normal', icon: '↘', color: '#F87171', solid: false },
};

export type BadgeKind = 'tier' | 'en_curso' | 'pocos_datos' | 'sin_datos';

export interface BadgeModel {
  kind: BadgeKind;
  /** Texto principal: "🔥 6.2×", "⏳ En curso", "1.4× · pocos datos", "Sin datos". */
  main: string;
  color: string;
  solid: boolean;
  /** Etiquetas pequeñas debajo: ER, 💎, Collab. */
  chips: string[];
  /** Detalle del tooltip, línea por línea. */
  details: string[];
}

const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
const GREY = '#9CA3AF';

export function badgeModel(p: BadgePost): BadgeModel {
  const chips: string[] = [];
  if (p.er !== null) chips.push(`ER ${percent(p.er)}`);
  if (p.hiddenGem) chips.push('💎 Joya oculta');
  if (p.collab) chips.push('Collab');

  const unit = p.type === 'reel' ? 'reels' : 'posts';
  const details = [
    p.type === 'reel' ? `Vistas: ${p.views === null ? 'sin dato' : compact(p.views)}` : null,
    `Likes: ${p.likesHidden ? 'ocultos' : compact(p.likes)}`,
    `Comentarios: ${compact(p.comments)}`,
    `Publicado: ${dateFmt.format(p.takenAt)}`,
    p.sampleSize > 0 ? `Comparado con ${p.sampleSize} ${unit} anteriores (mediana ${compact(p.baseline)})` : `Sin ${unit} anteriores para comparar`,
  ].filter((l): l is string => l !== null);

  if (p.maturity === 'en_curso') {
    return { kind: 'en_curso', main: '⏳ En curso', color: GREY, solid: false, chips, details: [...details, 'Tiene menos de 72 h: aún no se compara'] };
  }
  if (p.tier && p.confidence === 'ok') {
    const s = TIER_STYLES[p.tier];
    const extra = p.maturity === 'provisional' ? ['Provisional: tiene menos de 7 días'] : [];
    return { kind: 'tier', main: `${s.icon} ${multiplierText(p.multiplier)}`, color: s.color, solid: s.solid, chips, details: [`${s.label} (${multiplierText(p.multiplier)})`, ...details, ...extra] };
  }
  if (p.confidence === 'pocos_datos' && p.multiplier !== null) {
    return { kind: 'pocos_datos', main: `${multiplierText(p.multiplier)} · pocos datos`, color: GREY, solid: false, chips, details: [...details, 'Menos de 8 de referencia: no se etiqueta'] };
  }
  return { kind: 'sin_datos', main: 'Sin datos', color: GREY, solid: false, chips, details };
}

/** Texto del contador del icono (máx. ~4 caracteres). */
export function actionBadgeText(storedPosts: number | null, job: ScanJobRow | null): string {
  if (job && job.status === 'paused') return '||';
  if (job && (job.status === 'running' || job.status === 'queued')) return job.read > 0 ? compact(job.read) : '…';
  return storedPosts ? compact(storedPosts) : '';
}

const PAUSE_TEXT: Record<string, string> = {
  rate_limit: 'Instagram pidió esperar',
  login_required: 'Inicia sesión en Instagram',
  checkpoint: 'Instagram pide verificar la cuenta',
  action_blocked: 'Instagram bloqueó la acción',
  user: 'Pausado',
  network: 'Sin conexión, se reintenta',
};

/** Estado del escaneo en una línea para el chip. */
export function jobText(job: ScanJobRow, now = Date.now()): string {
  switch (job.status) {
    case 'queued':
      return 'En cola…';
    case 'running':
      return job.phase === 'reels' || job.phase === 'finalize'
        ? `Escaneando · ${compact(job.read)} posts · vistas de ${compact(job.reelsRead)} reels`
        : `Escaneando · ${compact(job.read)} posts`;
    case 'paused': {
      const why = PAUSE_TEXT[job.pauseReason ?? 'user'] ?? 'Pausado';
      const mins = job.resumeAt ? Math.max(1, Math.ceil((job.resumeAt - now) / 60_000)) : null;
      return mins ? `${why} · sigue en ${mins} min` : why;
    }
    case 'error':
      return `Error: ${job.message ?? 'desconocido'}`;
    case 'cancelled':
      return 'Cancelado';
    case 'done':
      return 'Escaneo completo';
  }
}

export function agoText(at: number | null, now = Date.now()): string {
  if (at === null) return 'nunca';
  const mins = Math.round((now - at) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** "850 ms", "1,4 s". */
export function durationText(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`;
}
