import { describe, expect, it } from 'vitest';
import { mediaType, mergeReelStats, normalizeMedia, normalizeProfile, normalizeReelStats, type IgPost } from '../../src/ig';
import { fixtures } from './fake';

const nodes = fixtures.timeline.data.xdt_api__v1__feed__user_timeline_graphql_connection.edges.map((e) => e.node);
const reelMedia = fixtures.reels.data.fetch__XDTUserDict.clips_connection.edges.map((e) => e.node.media);

describe('normalizeProfile (fixture real)', () => {
  it('lee seguidores exactos y datos del perfil', () => {
    expect(normalizeProfile(fixtures.profile.data.user)).toEqual({
      id: '4333002697',
      username: 'attoperfumes',
      fullName: 'ATTO | PERFUMES ORIGINALES®',
      followers: 501074,
      following: 34,
      mediaCount: 3360,
      isVerified: false,
      isPrivate: false,
      profilePicUrl: 'https://example.invalid/img.jpg',
      biography: expect.stringContaining('perfumes'),
    });
  });

  it('acepta el formato viejo (edge_followed_by) y rechaza lo vacío', () => {
    const p = normalizeProfile({ id: '1', username: 'x', edge_followed_by: { count: 10 }, edge_follow: { count: 2 }, edge_owner_to_timeline_media: { count: 3 }, profile_pic_url: 'u' });
    expect(p).toMatchObject({ followers: 10, following: 2, mediaCount: 3, profilePicUrl: 'u', fullName: '', biography: null });
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile({ username: 'sin-id' })).toBeNull();
  });
});

describe('normalizeMedia (timeline real)', () => {
  const posts = nodes.map((n) => normalizeMedia(n, '4333002697')!);

  it('tipo, fecha en ms y cifras', () => {
    expect(posts.map((p) => p.type)).toEqual(['reel', 'reel', 'carousel', 'reel']);
    expect(posts[1]).toMatchObject({ id: '4035427166090484857', code: 'DgAt6B_yNx5', takenAt: 1795280479000, likes: 449, comments: 0, views: null, likesHidden: false });
  });

  it('likes ocultos → likes null', () => {
    expect(posts[3]).toMatchObject({ likesHidden: true, likes: null, comments: 3 });
  });

  it('collab, menciones y hashtags', () => {
    expect(posts[0]!.collab).toBe(true);
    expect(posts[0]!.mentions).toEqual(['attoperfumesco']);
    expect(posts[3]!.mentions).toEqual(['officialmykonos']);
    expect(posts[1]!.collab).toBe(false);
    expect(normalizeMedia({ ...nodes[1], caption: { text: 'Hola #Perfume #perfume' } }, '1')!.hashtags).toEqual(['#perfume']);
  });

  it('portada (también del primer elemento del carrusel)', () => {
    expect(posts[2]!.coverUrl).toBe('https://example.invalid/img.jpg');
    expect(normalizeMedia({ ...nodes[2], image_versions2: null }, '1')!.coverUrl).toBe('https://example.invalid/img.jpg');
    expect(normalizeMedia({ ...nodes[1], image_versions2: null, display_uri: 'd' }, '1')!.coverUrl).toBe('d');
    expect(normalizeMedia({ ...nodes[1], image_versions2: null }, '1')!.coverUrl).toBeNull();
  });

  it('sin id, código o fecha → null', () => {
    expect(normalizeMedia({ ...nodes[1], code: undefined }, '1')).toBeNull();
    expect(normalizeMedia({ ...nodes[1], taken_at: null }, '1')).toBeNull();
    expect(normalizeMedia({ code: 'x', taken_at: 1 }, '1')).toBeNull();
    expect(normalizeMedia(null as never, '1')).toBeNull();
  });

  it('usa el id compuesto si no hay pk, y campos opcionales', () => {
    const p = normalizeMedia({ id: '55_9', code: 'c', taken_at: 1, video_duration: 12.5, invited_coauthor_producers: [{ username: 'y' }], play_count: 7 }, '9')!;
    expect(p).toMatchObject({ id: '55', durationSec: 12.5, collab: true, views: 7, caption: null, likes: null, comments: null, mentions: [] });
  });

  it('mediaType', () => {
    expect(mediaType({ product_type: 'clips', media_type: 2 })).toBe('reel');
    expect(mediaType({ media_type: 8 })).toBe('carousel');
    expect(mediaType({ media_type: 1, carousel_media: [{}] })).toBe('carousel');
    expect(mediaType({ media_type: 2, product_type: 'feed' })).toBe('post');
    expect(mediaType({ media_type: 1, carousel_media: [] })).toBe('post');
  });
});

describe('Reels: reproducciones y unión con el timeline', () => {
  const stats = reelMedia.map((m) => normalizeReelStats(m)!);

  it('lee play_count (sin fecha)', () => {
    expect(stats.map((s) => [s.code, s.views])).toEqual([
      ['DHUdgjLRgim', 119469],
      ['DgAt6B_yNx5', 38936],
      ['Df3LO5lslIB', 8800],
    ]);
    expect(stats[2]!.likes).toBeNull(); // likes ocultos
    expect(normalizeReelStats({})).toBeNull();
    expect(normalizeReelStats({ code: 'x', ig_play_count: 5 })!.views).toBe(5);
  });

  it('une por código y reporta los que no están en el timeline', () => {
    const posts = nodes.map((n) => normalizeMedia(n, '4333002697')!);
    const extra = { code: 'NOPE', views: 1, likes: 1, comments: 1, durationSec: null };
    const { posts: merged, unmatched } = mergeReelStats(posts, [...stats, extra]);
    expect(merged.map((p) => p.views)).toEqual([119469, 38936, null, 8800]);
    expect(merged[3]!.likes).toBeNull();
    expect(unmatched).toEqual(['NOPE']);
  });

  it('conserva lo del timeline si la pestaña Reels no trae el dato', () => {
    const post: IgPost = { ...normalizeMedia(nodes[1]!, '1')!, views: 5, durationSec: 9 };
    const { posts } = mergeReelStats([post], [{ code: post.code, views: null, likes: null, comments: null, durationSec: null }]);
    expect(posts[0]).toMatchObject({ views: 5, likes: 449, comments: 0, durationSec: 9, type: 'reel' });
  });
});
