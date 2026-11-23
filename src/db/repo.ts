// Operaciones sobre la base: guardar lo leído de Instagram, recalcular métricas y borrar en cascada.
import Dexie from 'dexie';
import type { IgPost, IgProfile, IgReelStats } from '../ig/types';
import { analyzeProfile, viralScores } from '../metrics';
import { deleteByIndex, rowsByIndex } from './lookup';
import type { MetricRow, PostRow, ProfileRow, RadarDB, SnapshotRow } from './schema';

/** Guarda el perfil sin perder los datos de escaneo que ya tenía. */
export async function saveProfile(db: RadarDB, ig: IgProfile): Promise<ProfileRow> {
  return db.transaction('rw', db.profiles, async () => {
    const existing = await db.profiles.get(ig.id);
    // El nombre de usuario es único: si otra cuenta lo tenía (lo cambió o lo liberó), se le aparta.
    const clash = await db.profiles.where('username').equals(ig.username).first();
    if (clash && clash.id !== ig.id) await db.profiles.update(clash.id, { username: `${clash.username}~${clash.id}` });
    const row: ProfileRow = {
      scannedFrom: null,
      scannedTo: null,
      complete: false,
      lastScanAt: null,
      unmatchedReels: 0,
      ...existing,
      ...ig,
    };
    await db.profiles.put(row);
    return row;
  });
}

export function getProfileByUsername(db: RadarDB, username: string): Promise<ProfileRow | undefined> {
  return db.profiles.where('username').equals(username.replace(/^@/, '').toLowerCase()).first();
}

/**
 * Guarda posts del timeline. El timeline no trae reproducciones: se conservan las que ya
 * estaban guardadas (llegan de la pestaña Reels).
 */
export async function savePosts(db: RadarDB, posts: readonly IgPost[], now: number): Promise<number> {
  if (posts.length === 0) return 0;
  return db.transaction('rw', db.posts, async () => {
    const existing = await db.posts.bulkGet(posts.map((p) => p.id));
    const rows: PostRow[] = posts.map((p, i) => {
      const old = existing[i];
      return {
        ...p,
        views: p.views ?? old?.views ?? null,
        durationSec: p.durationSec ?? old?.durationSec ?? null,
        coverUrl: p.coverUrl ?? old?.coverUrl ?? null,
        updatedAt: now,
      };
    });
    await db.posts.bulkPut(rows);
    return rows.length;
  });
}

export interface ReelStatsResult {
  /** Fecha de cada reel encontrado en la base, en el mismo orden de entrada (`undefined` = sin pareja). */
  takenAt: (number | undefined)[];
  matched: number;
  unmatched: number;
}

/** Aplica las reproducciones de la pestaña Reels a los posts ya guardados (unidos por código). */
export async function applyReelStats(db: RadarDB, stats: readonly IgReelStats[], now: number): Promise<ReelStatsResult> {
  return db.transaction('rw', db.posts, async () => {
    const found = await rowsByIndex(db.posts, 'code', stats.map((s) => s.code));
    const byCode = new Map(found.map((p) => [p.code, p]));
    const updated: PostRow[] = [];
    const takenAt = stats.map((s) => {
      const post = byCode.get(s.code);
      if (!post) return undefined;
      updated.push({
        ...post,
        views: s.views ?? post.views,
        likes: post.likes ?? s.likes,
        comments: post.comments ?? s.comments,
        durationSec: s.durationSec ?? post.durationSec,
        updatedAt: now,
      });
      return post.takenAt;
    });
    await db.posts.bulkPut(updated);
    return { takenAt, matched: updated.length, unmatched: stats.length - updated.length };
  });
}

export function profilePosts(db: RadarDB, profileId: string): Promise<PostRow[]> {
  return db.posts.where('[profileId+takenAt]').between([profileId, Dexie.minKey], [profileId, Dexie.maxKey]).toArray();
}

export interface FinalizeOptions {
  now: number;
  /** Inicio del escaneo: los posts tocados desde entonces reciben snapshot si cambiaron sus cifras. */
  scanStartedAt: number;
  /** El escaneo recorrió todo el perfil (no fue incremental). */
  fullScan: boolean;
  unmatchedReels: number;
}

/** Al cerrar un escaneo: snapshots, métricas del perfil completo y datos de cobertura. */
export async function finalizeProfile(db: RadarDB, profileId: string, opts: FinalizeOptions): Promise<{ posts: number; snapshots: number }> {
  return db.transaction('rw', [db.profiles, db.posts, db.metrics, db.snapshots], async () => {
    const profile = await db.profiles.get(profileId);
    const posts = await profilePosts(db, profileId);

    // Snapshots: uno por post tocado en este escaneo, solo si cambió respecto del último.
    const touched = posts.filter((p) => p.updatedAt >= opts.scanStartedAt);
    const previous = await rowsByIndex(db.snapshots, 'postId', touched.map((p) => p.id));
    const last = new Map<string, SnapshotRow>();
    for (const s of previous) if ((last.get(s.postId)?.at ?? -Infinity) <= s.at) last.set(s.postId, s);
    const snaps: SnapshotRow[] = touched
      .filter((p) => {
        const s = last.get(p.id);
        return !s || s.views !== p.views || s.likes !== p.likes || s.comments !== p.comments;
      })
      .map((p) => ({ postId: p.id, at: opts.now, views: p.views, likes: p.likes, comments: p.comments }));
    await db.snapshots.bulkAdd(snaps);

    // Métricas de todo el perfil (el multiplicador de un post depende de los anteriores).
    const followers = profile?.followers ?? null;
    const metrics = analyzeProfile(posts, { now: opts.now, followers });
    const scores = new Map<string, number | null>();
    for (const group of ['reel', 'post'] as const) {
      const ofGroup = metrics.filter((m) => m.group === group).map((m) => ({ id: m.postId, multiplier: m.multiplier, reach: m.reach, er: m.er }));
      for (const [id, score] of viralScores(ofGroup)) scores.set(id, score);
    }
    const rows: MetricRow[] = metrics.map((m) => ({ ...m, profileId, viralScore: scores.get(m.postId) ?? null, computedAt: opts.now }));
    await db.metrics.bulkPut(rows);

    if (profile) {
      const dates = posts.map((p) => p.takenAt);
      await db.profiles.put({
        ...profile,
        scannedFrom: dates.length ? Math.min(...dates) : null,
        scannedTo: dates.length ? Math.max(...dates) : null,
        complete: profile.complete || opts.fullScan,
        lastScanAt: opts.now,
        unmatchedReels: opts.fullScan ? opts.unmatchedReels : profile.unmatchedReels,
      });
    }
    return { posts: posts.length, snapshots: snaps.length };
  });
}

/** Borra un perfil con sus posts, métricas, snapshots, transcripciones y vínculos (architecture.md §5.1). */
export async function deleteProfile(db: RadarDB, profileId: string): Promise<void> {
  await db.transaction('rw', [db.profiles, db.posts, db.metrics, db.snapshots, db.transcripts, db.clientProfiles, db.collectionPosts] as Dexie.Table[], async () => {
    const ids = (await db.posts.where('profileId').equals(profileId).primaryKeys()) as string[];
    await deleteByIndex(db.snapshots, 'postId', ids);
    await db.transcripts.bulkDelete(ids);
    await deleteByIndex(db.collectionPosts, 'postId', ids);
    await db.metrics.where('profileId').equals(profileId).delete();
    await db.posts.bulkDelete(ids);
    await db.clientProfiles.where('profileId').equals(profileId).delete();
    await db.profiles.delete(profileId);
  });
}
