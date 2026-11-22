// Un paso del escaneo = una petición a Instagram + guardar el resultado. El trabajo se guarda
// después de cada paso con su cursor, así que si Chrome se cierra se reanuda en la misma página.
import type { IgFailure, IgPost, IgProfile, IgReelStats, IgResult, Page } from '../ig/types';
import { applyReelStats, finalizeProfile, saveProfile, savePosts } from '../db/repo';
import type { RadarDB, ScanJobRow, ScanMode } from '../db/schema';

/** Quien hace las peticiones (en la extensión: el content script de una pestaña de Instagram). */
export interface Fetcher {
  profile(username: string): Promise<IgResult<IgProfile>>;
  timeline(profile: IgProfile, cursor: string | null): Promise<IgResult<Page<IgPost>>>;
  reels(profile: IgProfile, cursor: string | null): Promise<IgResult<Page<IgReelStats>>>;
}

const MIN = 60_000;
export const DAY = 24 * 60 * MIN;
/** Re-escaneo: se refrescan los posts de los últimos 30 días (architecture.md §5.1). */
export const RECENT_REFRESH_MS = 30 * DAY;
/** Pausa ante un 429: 15 min la primera vez, 60 min si se repite. */
export const RATE_LIMIT_PAUSE_MS = [15 * MIN, 60 * MIN] as const;
/** Fallos de red o de servidor: se reintenta 3 veces, con 1 min de espera. */
export const MAX_ERROR_RETRIES = 3;
export const ERROR_RETRY_MS = MIN;

export function newJob(username: string, mode: ScanMode, now: number): ScanJobRow {
  return {
    username: username.replace(/^@/, '').trim().toLowerCase(),
    profileId: null,
    mode,
    status: 'queued',
    phase: 'profile',
    cursor: null,
    since: null,
    read: 0,
    reelsRead: 0,
    unmatchedReels: 0,
    pages: 0,
    rateLimitHits: 0,
    errorRetries: 0,
    pauseReason: null,
    resumeAt: null,
    message: null,
    createdAt: now,
    startedAt: null,
    updatedAt: now,
    finishedAt: null,
  };
}

/** Qué hacer con un fallo de Instagram. Lo leído hasta ahí ya está guardado y el cursor se conserva. */
export function applyFailure(job: ScanJobRow, failure: IgFailure, now: number): ScanJobRow {
  const base = { ...job, updatedAt: now, message: failure.message };
  if (failure.status === 'paused') {
    if (failure.reason === 'rate_limit') {
      const hits = job.rateLimitHits + 1;
      const wait = hits === 1 ? RATE_LIMIT_PAUSE_MS[0] : RATE_LIMIT_PAUSE_MS[1];
      return { ...base, status: 'paused', pauseReason: 'rate_limit', rateLimitHits: hits, resumeAt: now + wait };
    }
    // Sesión cerrada, verificación o bloqueo: necesitan al usuario, no se reanuda solo.
    return { ...base, status: 'paused', pauseReason: failure.reason, resumeAt: null };
  }
  const transient = failure.httpStatus === 0 || failure.httpStatus >= 500;
  if (transient && job.errorRetries < MAX_ERROR_RETRIES) {
    return { ...base, status: 'paused', pauseReason: 'network', errorRetries: job.errorRetries + 1, resumeAt: now + ERROR_RETRY_MS };
  }
  return { ...base, status: 'error', pauseReason: null, resumeAt: null, finishedAt: now };
}

function ok(job: ScanJobRow, now: number, patch: Partial<ScanJobRow>): ScanJobRow {
  return {
    ...job,
    status: 'running',
    pauseReason: null,
    resumeAt: null,
    message: null,
    rateLimitHits: 0,
    errorRetries: 0,
    pages: job.pages + 1,
    updatedAt: now,
    ...patch,
  };
}

/** Ejecuta el siguiente paso del trabajo y devuelve el trabajo actualizado (no lo guarda). */
export async function runStep(db: RadarDB, job: ScanJobRow, fetcher: Fetcher, now: number): Promise<ScanJobRow> {
  const startedAt = job.startedAt ?? now;
  job = { ...job, startedAt };

  if (job.phase === 'profile') {
    const res = await fetcher.profile(job.username);
    if (!res.ok) return applyFailure(job, res, now);
    if (res.data.isPrivate) return { ...job, status: 'error', message: `@${res.data.username} es privado`, updatedAt: now, finishedAt: now };
    const before = await db.profiles.get(res.data.id);
    await saveProfile(db, res.data);
    // Incremental: lo nuevo desde el post más reciente guardado y lo de los últimos 30 días.
    const since = job.mode === 'auto' && before?.complete ? Math.min(now - RECENT_REFRESH_MS, before.scannedTo ?? now) : null;
    return ok(job, now, { profileId: res.data.id, username: res.data.username, since, phase: 'timeline', cursor: null });
  }

  const profile = job.profileId ? await db.profiles.get(job.profileId) : undefined;
  if (!profile) return { ...job, phase: 'profile', cursor: null, updatedAt: now };

  if (job.phase === 'timeline') {
    const res = await fetcher.timeline(profile, job.cursor);
    if (!res.ok) return applyFailure(job, res, now);
    const { items, nextCursor } = res.data;
    await savePosts(db, items, now);
    // Los fijados salen arriba aunque sean viejos: se mira el último de la página.
    const reachedOld = job.since !== null && items.length > 0 && items.at(-1)!.takenAt < job.since;
    const next = reachedOld ? null : nextCursor;
    return ok(job, now, { read: job.read + items.length, ...(next ? { cursor: next } : { phase: 'reels', cursor: null }) });
  }

  if (job.phase === 'reels') {
    const res = await fetcher.reels(profile, job.cursor);
    if (!res.ok) return applyFailure(job, res, now);
    const { items, nextCursor } = res.data;
    const applied = await applyReelStats(db, items, now);
    const known = applied.takenAt.filter((t): t is number => t !== undefined);
    const reachedOld = job.since !== null && (known.length === 0 || known.at(-1)! < job.since);
    const next = reachedOld ? null : nextCursor;
    return ok(job, now, {
      reelsRead: job.reelsRead + applied.matched,
      unmatchedReels: job.unmatchedReels + applied.unmatched,
      ...(next ? { cursor: next } : { phase: 'finalize', cursor: null }),
    });
  }

  // finalize: sin petición a Instagram.
  await finalizeProfile(db, profile.id, { now, scanStartedAt: startedAt, fullScan: job.since === null, unmatchedReels: job.unmatchedReels });
  return { ...job, status: 'done', cursor: null, message: null, updatedAt: now, finishedAt: now };
}

/** El paso siguiente pide algo a Instagram (finalize no). */
export const needsRequest = (job: ScanJobRow) => job.phase !== 'finalize';
