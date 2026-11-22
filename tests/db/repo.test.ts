import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyReelStats, deleteProfile, finalizeProfile, getProfileByUsername, profilePosts, savePosts, saveProfile } from '../../src/db/repo';
import { DAY, NOW, freshDb, makePosts, makeProfile } from '../scan/fakeIg';

describe('esquema', () => {
  it('abre con todas las tablas de architecture.md §5', async () => {
    const db = freshDb();
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['clientProfiles', 'clients', 'collectionPosts', 'collections', 'metrics', 'posts', 'profiles', 'scanJobs', 'snapshots', 'transcripts'].sort(),
    );
    db.close();
  });
});

describe('saveProfile', () => {
  it('conserva los datos de escaneo al actualizar el perfil', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    await saveProfile(db, p);
    await db.profiles.update(p.id, { complete: true, scannedTo: 123 });
    const row = await saveProfile(db, { ...p, followers: 99 });
    expect(row).toMatchObject({ followers: 99, complete: true, scannedTo: 123 });
    expect(await getProfileByUsername(db, '@MARCA')).toMatchObject({ id: p.id });
  });

  it('si otra cuenta tenía el mismo usuario, la aparta en vez de fallar', async () => {
    const db = freshDb();
    await saveProfile(db, makeProfile('marca', 'viejo'));
    await saveProfile(db, makeProfile('marca', 'nuevo'));
    expect((await getProfileByUsername(db, 'marca'))?.id).toBe('nuevo');
    expect((await db.profiles.get('viejo'))?.username).toBe('marca~viejo');
  });
});

describe('savePosts y applyReelStats', () => {
  it('el timeline no borra las reproducciones que ya trajo la pestaña Reels', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    const posts = makePosts(p, 3);
    await savePosts(db, posts, NOW);
    const res = await applyReelStats(db, [{ code: posts[0]!.code, views: 5000, likes: 1, comments: 1, durationSec: 15 }, { code: 'nadie', views: 1, likes: null, comments: null, durationSec: null }], NOW);
    expect(res).toEqual({ takenAt: [posts[0]!.takenAt, undefined], matched: 1, unmatched: 1 });
    await savePosts(db, [{ ...posts[0]!, likes: 999 }], NOW + 1);
    const row = await db.posts.get(posts[0]!.id);
    // Likes del timeline (999), reproducciones de la pestaña Reels (5000).
    expect(row).toMatchObject({ views: 5000, likes: 999, durationSec: 30 });
  });

  it('guardar dos veces el mismo post no lo duplica', async () => {
    const db = freshDb();
    const posts = makePosts(makeProfile('marca'), 5);
    await savePosts(db, posts, NOW);
    await savePosts(db, posts, NOW);
    expect(await db.posts.count()).toBe(5);
    expect(await savePosts(db, [], NOW)).toBe(0);
  });
});

describe('finalizeProfile', () => {
  it('calcula métricas, cobertura y snapshots solo cuando cambian las cifras', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    await saveProfile(db, p);
    const posts = makePosts(p, 40);
    await savePosts(db, posts, NOW);
    let r = await finalizeProfile(db, p.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 2 });
    expect(r).toEqual({ posts: 40, snapshots: 40 });
    expect(await db.metrics.where('profileId').equals(p.id).count()).toBe(40);
    const metric = await db.metrics.get(posts[0]!.id);
    expect(metric).toMatchObject({ profileId: p.id, group: 'reel', computedAt: NOW });
    expect(await db.profiles.get(p.id)).toMatchObject({ complete: true, lastScanAt: NOW, unmatchedReels: 2, scannedTo: posts[0]!.takenAt, scannedFrom: posts[39]!.takenAt });

    // Segundo escaneo: solo cambia un post → un snapshot nuevo.
    await savePosts(db, posts, NOW + DAY);
    await savePosts(db, [{ ...posts[1]!, likes: 5000 }], NOW + DAY);
    r = await finalizeProfile(db, p.id, { now: NOW + DAY, scanStartedAt: NOW + DAY, fullScan: false, unmatchedReels: 9 });
    expect(r.snapshots).toBe(1);
    const snaps = await db.snapshots.where('postId').equals(posts[1]!.id).sortBy('at');
    expect(snaps.map((s) => s.likes)).toEqual([posts[1]!.likes, 5000]);
    // Incremental: no cambia el conteo de reels sin pareja.
    expect((await db.profiles.get(p.id))?.unmatchedReels).toBe(2);
  });

  it('el Puntaje Viral se calcula por grupo y queda guardado con la métrica', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    await saveProfile(db, p);
    const posts = makePosts(p, 60, NOW - 10 * DAY);
    await savePosts(db, posts, NOW);
    await applyReelStats(db, posts.filter((x) => x.type === 'reel').map((x, i) => ({ code: x.code, views: 1000 + i * 37, likes: null, comments: null, durationSec: 30 })), NOW);
    await finalizeProfile(db, p.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });
    const scored = (await db.metrics.toArray()).filter((m) => m.viralScore !== null);
    expect(scored.length).toBeGreaterThan(0);
    for (const m of scored) expect(m.viralScore).toBeGreaterThanOrEqual(0);
  });

  it('perfil vacío o inexistente no falla', async () => {
    const db = freshDb();
    expect(await finalizeProfile(db, 'nadie', { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 })).toEqual({ posts: 0, snapshots: 0 });
    await saveProfile(db, makeProfile('vacio'));
    await finalizeProfile(db, 'id-vacio', { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });
    expect(await db.profiles.get('id-vacio')).toMatchObject({ scannedFrom: null, scannedTo: null, complete: true });
  });
});

describe('deleteProfile', () => {
  it('borra en cascada posts, métricas, snapshots, transcripciones y vínculos, sin tocar otros perfiles', async () => {
    const db = freshDb();
    const a = makeProfile('a');
    const b = makeProfile('b');
    for (const p of [a, b]) {
      await saveProfile(db, p);
      await savePosts(db, makePosts(p, 10), NOW);
      await finalizeProfile(db, p.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });
    }
    const aPost = (await profilePosts(db, a.id))[0]!;
    await db.transcripts.add({ postId: aPost.id, language: 'es', text: 'hola', segments: [], hook: null, device: 'wasm' });
    const clientId = await db.clients.add({ name: 'Cliente', color: '#000', note: '' });
    await db.clientProfiles.bulkAdd([{ clientId: clientId!, profileId: a.id, role: 'competidor' }, { clientId: clientId!, profileId: b.id, role: 'propia' }]);
    const colId = await db.collections.add({ clientId: clientId!, name: 'Ideas' });
    await db.collectionPosts.add({ collectionId: colId!, postId: aPost.id, note: '', at: NOW });

    await deleteProfile(db, a.id);

    expect(await db.profiles.get(a.id)).toBeUndefined();
    expect(await db.posts.where('profileId').equals(a.id).count()).toBe(0);
    expect(await db.metrics.where('profileId').equals(a.id).count()).toBe(0);
    expect(await db.snapshots.count()).toBe(10);
    expect(await db.transcripts.count()).toBe(0);
    expect(await db.collectionPosts.count()).toBe(0);
    expect(await db.clientProfiles.toArray()).toEqual([{ clientId, profileId: b.id, role: 'propia' }]);
    // El cliente no se borra.
    expect(await db.clients.count()).toBe(1);
    expect(await db.posts.where('profileId').equals(b.id).count()).toBe(10);
  });
});
