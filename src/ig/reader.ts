// Lector de Instagram: perfil, publicaciones (timeline) y reproducciones de Reels, paginados.
import { extractUserId, type IgClient } from './client';
import { normalizeMedia, normalizeProfile, normalizeReelStats, mergeReelStats } from './normalize';
import { profileVariables, reelsVariables, timelineVariables } from './queries';
import type { IgFailure, IgPost, IgProfile, IgReelStats, IgResult, Page } from './types';

type Raw = Record<string, any>;

const changed = (what: string): IgFailure => ({
  ok: false,
  status: 'error',
  httpStatus: 200,
  message: `Instagram cambió la consulta de ${what}: la respuesta no tiene el formato esperado. Hay que actualizar el lector.`,
});

/** ID numérico desde la página del perfil. */
export async function resolveUserId(client: IgClient, username: string): Promise<IgResult<string>> {
  const name = username.replace(/^@/, '').toLowerCase();
  const page = await client.html(`/${encodeURIComponent(name)}/`);
  if (!page.ok) return page.httpStatus === 404 ? { ...page, message: `No existe el perfil @${name}` } : page;
  const id = extractUserId(page.data, name);
  return id ? { ok: true, data: id } : { ok: false, status: 'error', httpStatus: 200, message: `No se pudo leer el ID de @${name}` };
}

export async function fetchProfile(client: IgClient, username: string): Promise<IgResult<IgProfile>> {
  const id = await resolveUserId(client, username);
  if (!id.ok) return id;
  const res = await client.graphql<Raw>('profile', profileVariables(id.data));
  if (!res.ok) return res;
  const profile = normalizeProfile(res.data.data?.user);
  return profile ? { ok: true, data: profile } : changed('perfil');
}

/** Una página del timeline (todas las publicaciones: fotos, carruseles y reels), con fecha. */
export async function fetchTimelinePage(client: IgClient, profile: IgProfile, cursor: string | null): Promise<IgResult<Page<IgPost>>> {
  const res = await client.graphql<Raw>('timeline', timelineVariables(profile.username, cursor));
  if (!res.ok) return res;
  const conn = res.data.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
  if (!conn || !Array.isArray(conn.edges)) return changed('publicaciones');
  const items = (conn.edges as Raw[]).map((e) => normalizeMedia(e?.node, profile.id)).filter((p): p is IgPost => p !== null);
  const next = conn.page_info?.has_next_page === true ? (conn.page_info?.end_cursor ?? null) : null;
  return { ok: true, data: { items, nextCursor: next } };
}

/** Una página de la pestaña Reels (trae las reproducciones). */
export async function fetchReelsPage(client: IgClient, profile: IgProfile, cursor: string | null): Promise<IgResult<Page<IgReelStats>>> {
  const res = await client.graphql<Raw>('reels', reelsVariables(profile.id, cursor));
  if (!res.ok) return res;
  const data = (res.data.data ?? {}) as Raw;
  const conn = Object.values(data).find((v: Raw) => v && typeof v === 'object' && v.clips_connection)?.clips_connection;
  if (!conn || !Array.isArray(conn.edges)) return changed('Reels');
  const items = (conn.edges as Raw[]).map((e) => normalizeReelStats(e?.node?.media ?? e?.node)).filter((s): s is IgReelStats => s !== null);
  const next = conn.page_info?.has_next_page === true ? (conn.page_info?.end_cursor ?? null) : null;
  return { ok: true, data: { items, nextCursor: next } };
}

export interface ReadAllOptions {
  /** Espera entre páginas (ritmo seguro). Por defecto 2–4 s al azar. */
  delay?: () => Promise<void>;
  /** Solo lo publicado desde esta fecha (ms): se deja de paginar al pasarla. */
  since?: number;
  signal?: AbortSignal;
  onProgress?: (info: { kind: 'timeline' | 'reels'; page: number; read: number }) => void;
}

export const randomDelay =
  (minMs = 2000, maxMs = 4000) =>
  () =>
    new Promise<void>((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));

export type ReadOutcome = { status: 'complete' } | { status: 'aborted' } | IgFailure;

export interface ReadAllResult {
  profile: IgProfile | null;
  posts: IgPost[];
  /** Reels de la pestaña Reels que no aparecieron en el timeline (no se puede ubicar su fecha). */
  unmatchedReels: string[];
  pages: number;
  /** 'complete', o la pausa/error que detuvo la lectura (lo leído hasta ahí se conserva). */
  outcome: ReadOutcome;
}

async function paginate<T>(
  kind: 'timeline' | 'reels',
  fetchPage: (cursor: string | null) => Promise<IgResult<Page<T>>>,
  out: T[],
  opts: ReadAllOptions & { delay: () => Promise<void>; shouldStop?: (page: T[]) => boolean },
  counter: { pages: number },
): Promise<ReadOutcome> {
  let cursor: string | null = null;
  let page = 0;
  do {
    if (opts.signal?.aborted) return { status: 'aborted' };
    if (counter.pages > 0) await opts.delay();
    const res = await fetchPage(cursor);
    counter.pages++;
    if (!res.ok) return res;
    page++;
    out.push(...res.data.items);
    opts.onProgress?.({ kind, page, read: out.length });
    if (opts.shouldStop?.(res.data.items)) break;
    cursor = res.data.nextCursor;
  } while (cursor);
  return { status: 'complete' };
}

/** Lee el perfil y todo su contenido: timeline (fechas, likes, comentarios) y luego Reels (reproducciones). */
export async function readProfileContent(client: IgClient, username: string, opts: ReadAllOptions = {}): Promise<ReadAllResult> {
  const counter = { pages: 0 };
  const profileRes = await fetchProfile(client, username);
  counter.pages++;
  if (!profileRes.ok) return { profile: null, posts: [], unmatchedReels: [], pages: counter.pages, outcome: profileRes };
  const profile = profileRes.data;
  if (profile.isPrivate) {
    return { profile, posts: [], unmatchedReels: [], pages: counter.pages, outcome: { ok: false, status: 'error', httpStatus: 200, message: `@${profile.username} es privado` } };
  }

  const delay = opts.delay ?? randomDelay();
  const since = opts.since;
  const timeline: IgPost[] = [];
  let outcome = await paginate('timeline', (c) => fetchTimelinePage(client, profile, c), timeline, {
    ...opts,
    delay,
    // Los fijados salen arriba de la primera página aunque sean viejos: se mira el último (orden cronológico).
    shouldStop: since === undefined ? undefined : (items) => items.length > 0 && items.at(-1)!.takenAt < since,
  }, counter);

  const reels: IgReelStats[] = [];
  if (outcome.status === 'complete') {
    const known = new Map(timeline.map((p) => [p.code, p.takenAt]));
    outcome = await paginate('reels', (c) => fetchReelsPage(client, profile, c), reels, {
      ...opts,
      delay,
      // Con rango: parar cuando la página ya trae reels fuera del timeline leído o anteriores a `since`.
      shouldStop: since === undefined ? undefined : (items) => items.some((s) => !known.has(s.code) || known.get(s.code)! < since),
    }, counter);
  }

  const inRange = since === undefined ? timeline : timeline.filter((p) => p.takenAt >= since);
  const { posts } = mergeReelStats(dedupe(inRange), reels);
  // Solo es "sin pareja" un reel que no está en todo el timeline leído (no solo fuera del rango).
  const timelineCodes = new Set(timeline.map((p) => p.code));
  return {
    profile,
    posts: posts.sort((a, b) => b.takenAt - a.takenAt),
    unmatchedReels: reels.map((r) => r.code).filter((c) => !timelineCodes.has(c)),
    pages: counter.pages,
    outcome,
  };
}

function dedupe(posts: IgPost[]): IgPost[] {
  return [...new Map(posts.map((p) => [p.code, p])).values()];
}
