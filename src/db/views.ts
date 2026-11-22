// Vista de un perfil para pintar sobre Instagram (etiquetas, chip y contador del icono).
// Se arma en el service worker y viaja al content script por mensajes.
import { median } from '../metrics/stats';
import { VIRAL_TIERS } from '../metrics/tiers';
import type { Confidence, Maturity, MetricGroup, PostType, Tier } from '../metrics/types';
import { getProfileByUsername, profilePosts } from './repo';
import type { MetricRow, PostRow, ProfileRow, RadarDB, ScanJobRow } from './schema';

/** Lo que necesita una etiqueta: cifras del post y su métrica. */
export interface BadgePost {
  code: string;
  type: PostType;
  takenAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  likesHidden: boolean;
  collab: boolean;
  group: MetricGroup | null;
  multiplier: number | null;
  baseline: number | null;
  sampleSize: number;
  tier: Tier | null;
  maturity: Maturity | null;
  confidence: Confidence | null;
  er: number | null;
  hiddenGem: boolean;
}

export interface ProfileSummary {
  username: string;
  followers: number | null;
  posts: number;
  reels: number;
  /** Mediana de vistas de los últimos 30 reels con dato. */
  medianReelViews: number | null;
  medianSample: number;
  virals: number;
  hiddenGems: number;
  complete: boolean;
  lastScanAt: number | null;
  scannedFrom: number | null;
}

export interface ProfileView {
  username: string;
  summary: ProfileSummary | null;
  /** Trabajo activo (o el último) de este perfil. */
  job: ScanJobRow | null;
  posts: Record<string, BadgePost>;
}

const RECENT_REELS = 30;

/** Cifras de un post más su métrica (si la tiene). */
export function toBadgePost(p: PostRow, m?: MetricRow): BadgePost {
  return {
    code: p.code,
      type: p.type,
    takenAt: p.takenAt,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    likesHidden: p.likesHidden,
    collab: p.collab,
    group: m?.group ?? null,
    multiplier: m?.multiplier ?? null,
    baseline: m?.baseline ?? null,
    sampleSize: m?.sampleSize ?? 0,
    tier: m?.tier ?? null,
    maturity: m?.maturity ?? null,
    confidence: m?.confidence ?? null,
    er: m?.er ?? null,
    hiddenGem: m?.hiddenGem ?? false,
  };
}

export function buildProfileView(username: string, profile: ProfileRow | null, posts: PostRow[], metrics: MetricRow[], job: ScanJobRow | null): ProfileView {
  if (!profile) return { username, summary: null, job, posts: {} };
  const byPost = new Map(metrics.map((m) => [m.postId, m]));
  const out: Record<string, BadgePost> = {};
  for (const p of posts) out[p.code] = toBadgePost(p, byPost.get(p.id));
  const recentViews = posts
    .filter((p) => p.type === 'reel' && p.views !== null)
    .sort((a, b) => b.takenAt - a.takenAt)
    .slice(0, RECENT_REELS)
    .map((p) => p.views!);
  return {
    username: profile.username,
    job,
    posts: out,
    summary: {
      username: profile.username,
      followers: profile.followers,
      posts: posts.length,
      reels: posts.filter((p) => p.type === 'reel').length,
      medianReelViews: median(recentViews),
      medianSample: recentViews.length,
      virals: metrics.filter((m) => m.tier !== null && VIRAL_TIERS.includes(m.tier)).length,
      hiddenGems: metrics.filter((m) => m.hiddenGem).length,
      complete: profile.complete,
      lastScanAt: profile.lastScanAt,
      scannedFrom: profile.scannedFrom,
    },
  };
}

const clean = (u: string) => u.replace(/^@/, '').trim().toLowerCase();

/** Trabajo activo de ese usuario o, si no hay, el más reciente. */
export async function jobFor(db: RadarDB, username: string): Promise<ScanJobRow | null> {
  const jobs = await db.scanJobs.where('username').equals(clean(username)).toArray();
  const active = jobs.filter((j) => ['queued', 'running', 'paused'].includes(j.status));
  const pool = active.length ? active : jobs;
  return pool.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0] ?? null;
}

export async function loadProfileView(db: RadarDB, username: string): Promise<ProfileView> {
  const profile = (await getProfileByUsername(db, username)) ?? null;
  const job = await jobFor(db, username);
  if (!profile) return buildProfileView(clean(username), null, [], [], job);
  const [posts, metrics] = await Promise.all([profilePosts(db, profile.id), db.metrics.where('profileId').equals(profile.id).toArray()]);
  return buildProfileView(profile.username, profile, posts, metrics, job);
}

/** Post completo para el panel lateral: cifras, texto y métrica. */
export interface PanelPost extends BadgePost {
  id: string;
  caption: string | null;
  hashtags: string[];
  durationSec: number | null;
  coverUrl: string | null;
  reach: number | null;
  viralScore: number | null;
}

export interface PanelData {
  profile: ProfileRow | null;
  posts: PanelPost[];
}

export function buildPanelPosts(posts: PostRow[], metrics: MetricRow[]): PanelPost[] {
  const byPost = new Map(metrics.map((m) => [m.postId, m]));
  return posts.map((p) => {
    const m = byPost.get(p.id);
    return {
      ...toBadgePost(p, m),
      id: p.id,
      caption: p.caption,
      hashtags: p.hashtags,
      durationSec: p.durationSec,
      coverUrl: p.coverUrl,
      reach: m?.reach ?? null,
      viralScore: m?.viralScore ?? null,
    };
  });
}

export async function loadPanelData(db: RadarDB, username: string): Promise<PanelData> {
  const profile = (await getProfileByUsername(db, username)) ?? null;
  if (!profile) return { profile, posts: [] };
  const [posts, metrics] = await Promise.all([profilePosts(db, profile.id), db.metrics.where('profileId').equals(profile.id).toArray()]);
  return { profile, posts: buildPanelPosts(posts, metrics) };
}
