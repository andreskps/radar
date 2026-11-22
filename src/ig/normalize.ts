// Convierte las respuestas crudas de Instagram al modelo de Radar.
// Instagram cambia nombres de campos con el tiempo: todo se lee de forma defensiva.
import type { PostType } from '../metrics/types';
import { extractHashtags } from '../metrics/terms';
import type { IgPost, IgProfile, IgReelStats } from './types';

type Raw = Record<string, any>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const firstNum = (...values: unknown[]): number | null => {
  for (const v of values) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
};

/** `data.user` de PolarisProfilePageContentQuery → perfil. */
export function normalizeProfile(u: Raw | null | undefined): IgProfile | null {
  const id = str(u?.pk) ?? str(u?.id);
  if (!u || !id) return null;
  return {
    id,
    username: String(u.username ?? ''),
    fullName: String(u.full_name ?? ''),
    followers: firstNum(u.follower_count, u.edge_followed_by?.count),
    following: firstNum(u.following_count, u.edge_follow?.count),
    mediaCount: firstNum(u.media_count, u.edge_owner_to_timeline_media?.count),
    isVerified: u.is_verified === true,
    isPrivate: u.is_private === true,
    profilePicUrl: str(u.hd_profile_pic_url_info?.url) ?? str(u.profile_pic_url),
    biography: str(u.biography),
  };
}

export function mediaType(m: Raw): PostType {
  if (m.product_type === 'clips') return 'reel';
  if (m.media_type === 8 || (Array.isArray(m.carousel_media) && m.carousel_media.length > 0)) return 'carousel';
  return 'post';
}

function coverOf(m: Raw): string | null {
  return str(m.image_versions2?.candidates?.[0]?.url) ?? str(m.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url) ?? str(m.display_uri);
}

const MENTION_RE = /@([\p{L}\p{N}_.]+)/gu;

const mediaId = (m: Raw): string | null => str(m?.pk) ?? str(m?.id)?.split('_')[0] ?? null;

/** Nodo del timeline → post. `null` si le falta lo esencial (id, código o fecha). */
export function normalizeMedia(m: Raw, profileId: string): IgPost | null {
  const id = mediaId(m);
  const code = str(m?.code);
  const takenAt = num(m?.taken_at);
  if (!id || !code || takenAt === null) return null;

  const likesHidden = m.like_and_view_counts_disabled === true;
  const caption = str(m.caption?.text);
  const tagged = [...((m.usertags?.in ?? []) as Raw[]).map((t) => t?.user?.username), ...((m.coauthor_producers ?? []) as Raw[]).map((u) => u?.username)];
  const fromCaption = [...(caption?.matchAll(MENTION_RE) ?? [])].map((x) => x[1]!);
  const mentions = [...new Set([...fromCaption, ...tagged].filter((u): u is string => typeof u === 'string').map((u) => u.toLowerCase()))];

  return {
    id,
    code,
    profileId,
    type: mediaType(m),
    takenAt: takenAt * 1000,
    views: firstNum(m.play_count, m.ig_play_count, m.view_count),
    likes: likesHidden ? null : num(m.like_count),
    comments: num(m.comment_count),
    likesHidden,
    durationSec: num(m.video_duration),
    caption,
    hashtags: extractHashtags(caption),
    mentions,
    collab: (m.coauthor_producers?.length ?? 0) > 0 || (m.invited_coauthor_producers?.length ?? 0) > 0,
    coverUrl: coverOf(m),
  };
}

/** Media de la pestaña Reels → cifras del reel (sin fecha). */
export function normalizeReelStats(m: Raw): IgReelStats | null {
  const code = str(m?.code);
  if (!code) return null;
  const hidden = m.like_and_view_counts_disabled === true;
  return {
    code,
    // play_count es la cifra de "reproducciones" que muestra Instagram en la pestaña Reels.
    views: firstNum(m.play_count, m.ig_play_count, m.view_count),
    likes: hidden ? null : num(m.like_count),
    comments: num(m.comment_count),
    durationSec: num(m.video_duration),
  };
}

/** Agrega las reproducciones de la pestaña Reels a los posts del timeline (por código). */
export function mergeReelStats(posts: IgPost[], stats: IgReelStats[]): { posts: IgPost[]; unmatched: string[] } {
  const byCode = new Map(stats.map((s) => [s.code, s]));
  const seen = new Set<string>();
  const merged = posts.map((p) => {
    const s = byCode.get(p.code);
    if (!s) return p;
    seen.add(p.code);
    return {
      ...p,
      type: 'reel' as const,
      views: s.views ?? p.views,
      likes: p.likesHidden ? null : (s.likes ?? p.likes),
      comments: s.comments ?? p.comments,
      durationSec: s.durationSec ?? p.durationSec,
    };
  });
  return { posts: merged, unmatched: stats.filter((s) => !seen.has(s.code)).map((s) => s.code) };
}
