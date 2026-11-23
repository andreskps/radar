// Exportación de un perfil: Excel con hojas "Resumen" y "Posts", y CSV con las mismas
// columnas de "Posts". Funciones puras sobre los datos del panel (PanelPost), así el panel
// sobre Instagram y el Centro exportan exactamente lo mismo.
import type { ProfileRow } from '../db/schema';
import type { PanelPost } from '../db/views';
import type { Confidence, Maturity, PostType } from '../metrics/types';
import { DEFAULT_THRESHOLDS as T } from '../metrics/tiers';
import { TIER_STYLES } from '../ui/format';
import { summarize, TIER_ORDER, TIME_ZONE, type Stat, type TierBucket } from '../ui/panel/analytics';
import { toCsv, type CsvOptions, type CsvValue } from './csv';
import { toExcelDate, writeXlsx, type Cell, type CellFormat, type Column, type Sheet } from './xlsx';

export interface ExportOptions {
  now: number;
  timeZone?: string;
}

const TYPE_LABEL: Record<PostType, string> = { reel: 'Reel', post: 'Post', carousel: 'Carrusel' };
const MATURITY_LABEL: Record<Maturity, string> = { en_curso: 'En curso (< 72 h)', provisional: 'Provisional (< 7 días)', final: 'Final' };
const CONFIDENCE_LABEL: Record<Confidence, string> = { ok: 'OK', pocos_datos: 'Pocos datos', sin_datos: 'Sin datos' };
const BUCKET_LABEL: Record<TierBucket, string> = {
  ...(Object.fromEntries(Object.entries(TIER_STYLES).map(([k, v]) => [k, v.label])) as Record<keyof typeof TIER_STYLES, string>),
  en_curso: 'En curso',
  sin_datos: 'Sin nivel (pocos datos o sin cifra)',
};

const yesNo = (b: boolean) => (b ? 'Sí' : 'No');
export const postUrl = (p: Pick<PanelPost, 'code' | 'type'>) => `https://www.instagram.com/${p.type === 'reel' ? 'reel' : 'p'}/${p.code}/`;

/** Una columna de la hoja Posts: cómo se ve en Excel y cómo en CSV. */
interface PostColumn extends Column {
  get: (p: PanelPost, tz: string) => Cell;
  csv?: (p: PanelPost, tz: string) => CsvValue;
}

const csvDate = new Map<string, Intl.DateTimeFormat>();
function csvDateText(ms: number, tz: string): string {
  let f = csvDate.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    csvDate.set(tz, f);
  }
  return f.format(new Date(ms)); // "2026-11-22 14:05"
}

export const POST_COLUMNS: PostColumn[] = [
  { header: 'Fecha', width: 17, format: 'datetime', get: (p, tz) => toExcelDate(p.takenAt, tz), csv: (p, tz) => csvDateText(p.takenAt, tz) },
  { header: 'Tipo', width: 10, get: (p) => TYPE_LABEL[p.type] },
  { header: 'Enlace', width: 12, get: (p) => ({ link: postUrl(p), text: 'Abrir' }), csv: (p) => postUrl(p) },
  { header: 'Código', width: 14, get: (p) => p.code },
  { header: 'Vistas', width: 12, format: 'int', get: (p) => p.views },
  { header: 'Likes', width: 10, format: 'int', get: (p) => (p.likesHidden ? null : p.likes) },
  { header: 'Comentarios', width: 12, format: 'int', get: (p) => p.comments },
  { header: 'Likes ocultos', width: 12, get: (p) => yesNo(p.likesHidden) },
  { header: 'Duración (s)', width: 11, format: 'int', get: (p) => p.durationSec },
  { header: 'Collab', width: 8, get: (p) => yesNo(p.collab) },
  { header: 'Multiplicador', width: 13, format: 'multiplier', get: (p) => p.multiplier, csv: (p) => (p.multiplier === null ? null : round(p.multiplier, 4)) },
  { header: 'Nivel', width: 20, get: (p) => (p.tier ? TIER_STYLES[p.tier].label : '') },
  { header: 'Línea base', width: 12, format: 'int', get: (p) => p.baseline, csv: (p) => (p.baseline === null ? null : round(p.baseline, 2)) },
  { header: 'Posts de referencia', width: 12, format: 'int', get: (p) => p.sampleSize },
  { header: 'Madurez', width: 20, get: (p) => (p.maturity ? MATURITY_LABEL[p.maturity] : '') },
  { header: 'Confianza', width: 12, get: (p) => (p.confidence ? CONFIDENCE_LABEL[p.confidence] : '') },
  { header: 'ER', width: 9, format: 'percent', get: (p) => p.er, csv: (p) => (p.er === null ? null : round(p.er, 6)) },
  { header: 'Alcance (cifra ÷ seguidores)', width: 14, format: 'percent', get: (p) => p.reach, csv: (p) => (p.reach === null ? null : round(p.reach, 6)) },
  { header: 'Joya oculta', width: 10, get: (p) => yesNo(p.hiddenGem) },
  { header: 'Puntaje viral', width: 11, format: 'int', get: (p) => p.viralScore, csv: (p) => (p.viralScore === null ? null : round(p.viralScore, 2)) },
  { header: 'Hashtags', width: 30, get: (p) => p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ') },
  { header: 'Texto', width: 60, get: (p) => p.caption ?? '' },
];

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

const byDateDesc = (a: PanelPost, b: PanelPost) => b.takenAt - a.takenAt;

export function postsSheet(posts: readonly PanelPost[], tz = TIME_ZONE): Sheet {
  const sorted = [...posts].sort(byDateDesc);
  return {
    name: 'Posts',
    columns: POST_COLUMNS,
    rows: sorted.map((p) => POST_COLUMNS.map((c) => c.get(p, tz))),
  };
}

const num = (n: number | null, format: CellFormat): Cell => (n === null ? null : { n, format });
const title = (s: string): Cell[] => [{ s, format: 'heading' }, { s: '', format: 'heading' }, { s: '', format: 'heading' }, { s: '', format: 'heading' }];
const statRow = (label: string, s: Stat, format: CellFormat, note = ''): Cell[] => [label, num(s.value, format), s.n, s.low ? `Pocos datos (menos de 8). ${note}`.trim() : note];

export function summarySheet(profile: ProfileRow, posts: readonly PanelPost[], { now, timeZone = TIME_ZONE }: ExportOptions): Sheet {
  const s = summarize(posts, { range: 'all', now });
  const dates = posts.map((p) => p.takenAt);
  const reels = posts.filter((p) => p.type === 'reel').length;
  const date = (ms: number | null, format: CellFormat = 'datetime'): Cell => (ms === null ? null : { n: toExcelDate(ms, timeZone), format });

  const rows: Cell[][] = [
    title('Perfil'),
    ['Usuario', `@${profile.username}`],
    ['Nombre', profile.fullName],
    ['Enlace', { link: `https://www.instagram.com/${profile.username}/`, text: `instagram.com/${profile.username}` }],
    ['Seguidores', num(profile.followers, 'int')],
    ['Siguiendo', num(profile.following, 'int')],
    ['Publicaciones según Instagram', num(profile.mediaCount, 'int')],
    ['Publicaciones guardadas en Radar', num(posts.length, 'int'), null, `${reels} reels · ${posts.length - reels} posts y carruseles`],
    ['Escaneo completo', profile.complete ? 'Sí' : 'No', null, profile.complete ? '' : 'Faltan publicaciones antiguas: las estadísticas pueden cambiar.'],
    ['Último escaneo', date(profile.lastScanAt)],
    ['Publicación más antigua', date(dates.length ? Math.min(...dates) : null, 'date')],
    ['Publicación más reciente', date(dates.length ? Math.max(...dates) : null, 'date')],
    [],
    [{ s: 'Estadística (todo el historial)', format: 'heading' }, { s: 'Valor', format: 'heading' }, { s: 'Muestra', format: 'heading' }, { s: 'Nota', format: 'heading' }],
    statRow('Mediana de vistas (reels)', s.medianViews, 'int'),
    statRow('% de virales (≥ 2×)', s.viralPct, 'percent', 'Entre los posts con nivel.'),
    statRow('ER mediano', s.medianEr, 'percent', 'Reels: interacciones ÷ vistas. Posts: interacciones ÷ seguidores.'),
    statRow('Publicaciones por semana', s.perWeek, 'decimal', 'Del primer post guardado a la fecha de exportación.'),
    [],
    [{ s: 'Nivel', format: 'heading' }, { s: 'Posts', format: 'heading' }, { s: '% del total', format: 'heading' }, { s: '', format: 'heading' }],
    ...TIER_ORDER.map((t): Cell[] => [BUCKET_LABEL[t], num(s.tiers[t], 'int'), posts.length ? { n: s.tiers[t] / posts.length, format: 'percent' } : null]),
    [],
    title('Cómo leer los números'),
    ['Multiplicador', null, null, 'Cifra del post ÷ mediana de hasta 30 publicaciones anteriores del mismo grupo (reels con reels; posts y carruseles entre sí).'],
    ['Cifra', null, null, 'Reels: vistas. Posts y carruseles: likes + comentarios.'],
    ['Niveles', null, null, `Mega viral ≥ ${T.megaViral}× · Viral ≥ ${T.viral}× · Despegó ≥ ${T.despego}× · Arriba ≥ ${T.arriba}× · Normal ≥ ${T.normal}× · Bajo < ${T.normal}×.`],
    ['Sin nivel', null, null, 'Menos de 8 publicaciones de referencia, cifra no disponible o publicación de menos de 72 h.'],
    ['Zona horaria', timeZone],
    ['Exportado', date(now)],
  ];

  return {
    name: 'Resumen',
    header: false,
    columns: [
      { header: 'Dato', width: 34 },
      { header: 'Valor', width: 22 },
      { header: 'Muestra', width: 10, format: 'int' },
      { header: 'Nota', width: 70 },
    ],
    rows,
  };
}

export async function profileXlsx(profile: ProfileRow, posts: readonly PanelPost[], opts: ExportOptions): Promise<Uint8Array> {
  return writeXlsx([summarySheet(profile, posts, opts), postsSheet(posts, opts.timeZone)], new Date(opts.now));
}

export function profileCsv(posts: readonly PanelPost[], tz = TIME_ZONE, csvOptions: CsvOptions = {}): string {
  const sorted = [...posts].sort(byDateDesc);
  return toCsv(
    POST_COLUMNS.map((c) => c.header),
    sorted.map((p) =>
      POST_COLUMNS.map((c) => {
        if (c.csv) return c.csv(p, tz);
        const v = c.get(p, tz);
        return typeof v === 'string' || typeof v === 'number' || v === null || v === undefined ? v : null;
      }),
    ),
    csvOptions,
  );
}

/** "radar-marca-2026-11-22.xlsx" (fecha en la zona horaria del usuario). */
export function exportFileName(username: string, ext: string, now: number, tz = TIME_ZONE): string {
  const day = csvDateText(now, tz).slice(0, 10);
  const safe = username.replace(/[^a-z0-9._-]/gi, '_');
  return `radar-${safe}-${day}.${ext}`;
}
