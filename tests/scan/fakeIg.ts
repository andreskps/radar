// Instagram simulado para la cola: un perfil con N publicaciones, páginas de 12 como el real.
import type { IgFailure, IgPost, IgProfile, IgReelStats, IgResult, Page } from '../../src/ig/types';
import type { Fetcher } from '../../src/scan/step';
import { openDb } from '../../src/db/schema';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const NOW = Date.UTC(2026, 10, 22, 12);
const PAGE = 12;

let dbCounter = 0;
export const freshDb = () => openDb(`radar-test-${++dbCounter}`);

export function makeProfile(username: string, id = `id-${username}`): IgProfile {
  return { id, username, fullName: username, followers: 10_000, following: 10, mediaCount: null, isVerified: false, isPrivate: false, profilePicUrl: null, biography: null };
}

/** Publicaciones de más nueva a más vieja, una por día; cada 3.ª es foto, el resto reels. */
export function makePosts(profile: IgProfile, count: number, newest = NOW - DAY, prefix = 'p'): IgPost[] {
  return Array.from({ length: count }, (_, i) => {
    const reel = i % 3 !== 2;
    return {
      id: `${prefix}${i}-${profile.id}`,
      code: `${prefix}${i}${profile.username}`,
      profileId: profile.id,
      type: reel ? 'reel' : 'post',
      takenAt: newest - i * DAY,
      views: null,
      likes: 100 + i,
      comments: 5,
      likesHidden: false,
      durationSec: reel ? 30 : null,
      caption: `post ${i} #tag`,
      hashtags: ['tag'],
      mentions: [],
      collab: false,
      coverUrl: null,
    } satisfies IgPost;
  });
}

type Kind = 'profile' | 'timeline' | 'reels';
export interface Call {
  kind: Kind;
  username: string;
  cursor: string | null;
}

/**
 * Instagram falso. `fail(n)` decide si la n-ésima petición (desde 1) falla.
 * `views(code)` da las reproducciones de cada reel; `extraReels` son reels sin pareja en el timeline.
 */
export class FakeInstagram implements Fetcher {
  calls: Call[] = [];
  profiles = new Map<string, { profile: IgProfile; posts: IgPost[]; extraReels: string[] }>();
  fail: (n: number, call: Call) => IgFailure | null = () => null;
  views = (code: string) => 1000 + code.length;

  add(profile: IgProfile, posts: IgPost[], extraReels: string[] = []) {
    this.profiles.set(profile.username, { profile, posts, extraReels });
  }

  private hit<T>(call: Call, produce: () => IgResult<T>): Promise<IgResult<T>> {
    this.calls.push(call);
    const failure = this.fail(this.calls.length, call);
    return Promise.resolve(failure ?? produce());
  }

  private pageOf<T>(items: T[], cursor: string | null): Page<T> {
    const start = cursor ? Number(cursor) : 0;
    const end = start + PAGE;
    return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
  }

  profile(username: string) {
    return this.hit({ kind: 'profile', username, cursor: null }, () => {
      const p = this.profiles.get(username);
      return p ? { ok: true as const, data: p.profile } : { ok: false as const, status: 'error' as const, httpStatus: 404, message: `No existe el perfil @${username}` };
    });
  }

  timeline(profile: IgProfile, cursor: string | null) {
    return this.hit({ kind: 'timeline', username: profile.username, cursor }, () => ({
      ok: true as const,
      data: this.pageOf(this.profiles.get(profile.username)!.posts, cursor),
    }));
  }

  reels(profile: IgProfile, cursor: string | null) {
    return this.hit({ kind: 'reels', username: profile.username, cursor }, () => {
      const p = this.profiles.get(profile.username)!;
      const codes = [...p.posts.filter((x) => x.type === 'reel').map((x) => x.code)];
      // Los reels sin pareja aparecen al final de la pestaña.
      codes.push(...p.extraReels);
      const stats: IgReelStats[] = codes.map((code) => ({ code, views: this.views(code), likes: null, comments: null, durationSec: 30 }));
      return { ok: true as const, data: this.pageOf(stats, cursor) };
    });
  }
}

export const rateLimited: IgFailure = { ok: false, status: 'paused', reason: 'rate_limit', httpStatus: 429, message: 'Instagram pidió esperar' };
export const loggedOut: IgFailure = { ok: false, status: 'paused', reason: 'login_required', httpStatus: 302, message: 'Inicia sesión en Instagram' };
export const offline: IgFailure = { ok: false, status: 'error', httpStatus: 0, message: 'Sin conexión con Instagram' };
