import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ScanQueue, DEFAULT_PACING, type QueueDeps } from '../../src/scan/queue';
import { applyFailure, newJob, RATE_LIMIT_PAUSE_MS, ERROR_RETRY_MS, RECENT_REFRESH_MS } from '../../src/scan/step';
import { profilePosts } from '../../src/db/repo';
import type { RadarDB } from '../../src/db/schema';
import { DAY, FakeInstagram, NOW, freshDb, loggedOut, makePosts, makeProfile, offline, rateLimited } from './fakeIg';

/** Reloj simulado: las esperas avanzan el reloj sin tiempo real. */
function harness(db: RadarDB, ig: FakeInstagram, extra: Partial<QueueDeps> = {}) {
  const clock = { t: NOW, slept: [] as number[], wakes: [] as (number | null)[], busy: [] as boolean[] };
  const queue = new ScanQueue({
    db,
    fetcher: ig,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.slept.push(ms);
      clock.t += ms;
    },
    random: () => 0.5,
    scheduleWake: (at) => clock.wakes.push(at),
    setBusy: (b) => clock.busy.push(b),
    ...extra,
  });
  return { queue, clock };
}

function setup(count = 100, extraReels: string[] = []) {
  const db = freshDb();
  const ig = new FakeInstagram();
  const profile = makeProfile('marca');
  const posts = makePosts(profile, count);
  ig.add(profile, posts, extraReels);
  return { db, ig, profile, posts };
}

describe('escaneo completo', () => {
  it('guarda perfil, todos los posts, reproducciones, métricas y snapshots', async () => {
    const { db, ig, profile, posts } = setup(100, ['suelto1', 'suelto2']);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('@Marca');
    await queue.ensureRunning();

    const job = (await db.scanJobs.toArray())[0]!;
    expect(job).toMatchObject({ status: 'done', read: 100, unmatchedReels: 2, since: null });
    const stored = await profilePosts(db, profile.id);
    expect(stored).toHaveLength(100);
    const reels = stored.filter((p) => p.type === 'reel');
    expect(reels.every((r) => r.views === ig.views(r.code))).toBe(true);
    expect(job.reelsRead).toBe(reels.length);
    expect(await db.metrics.count()).toBe(100);
    expect(await db.snapshots.count()).toBe(100);
    expect(await db.profiles.get(profile.id)).toMatchObject({ complete: true, unmatchedReels: 2, scannedTo: posts[0]!.takenAt, lastScanAt: clock.t });

    // 1 perfil + 9 páginas de timeline + 6 de reels (69 reels: 67 + 2 sueltos).
    expect(ig.calls.map((c) => c.kind)).toEqual(['profile', ...Array(9).fill('timeline'), ...Array(6).fill('reels')]);
    expect(job.pages).toBe(16);
    // Ritmo: espera de 3 s (punto medio de 2–4 s) antes de cada petición salvo la primera.
    expect(clock.slept).toEqual(Array(15).fill(3000));
    expect(clock.busy.at(-1)).toBe(false);
    expect(clock.wakes.at(-1)).toBeNull();
  });

  it('20–40 s entre perfiles y una petición a la vez', async () => {
    const { db, ig } = setup(5);
    const other = makeProfile('otra');
    ig.add(other, makePosts(other, 5, NOW - DAY, 'o'));
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.enqueue('otra');
    await queue.enqueue('marca'); // repetido: no se duplica
    expect(await db.scanJobs.count()).toBe(2);
    await queue.ensureRunning();
    expect(clock.slept).toEqual([3000, 3000, 30_000, 3000, 3000]);
    expect((await db.scanJobs.toArray()).map((j) => j.status)).toEqual(['done', 'done']);
  });

  it('ensureRunning dos veces no arranca dos corridas', async () => {
    const { db, ig } = setup(30);
    const { queue } = harness(db, ig);
    await queue.enqueue('marca');
    const a = queue.ensureRunning();
    expect(queue.running).toBe(true);
    expect(queue.ensureRunning()).toBe(a);
    await a;
    expect(ig.calls.filter((c) => c.kind === 'profile')).toHaveLength(1);
  });

  it('perfil privado o inexistente termina en error con mensaje', async () => {
    const db = freshDb();
    const ig = new FakeInstagram();
    ig.add({ ...makeProfile('priv'), isPrivate: true }, []);
    const { queue } = harness(db, ig);
    await queue.enqueue('priv');
    await queue.enqueue('nadie');
    await queue.ensureRunning();
    const jobs = await db.scanJobs.toArray();
    expect(jobs.map((j) => [j.status, j.message])).toEqual([
      ['error', '@priv es privado'],
      ['error', 'No existe el perfil @nadie'],
    ]);
  });
});

describe('pausa ante 429 y reanudación', () => {
  it('pausa 15 min, conserva el cursor y lo leído; si se repite, 60 min; luego termina sin duplicar', async () => {
    const { db, ig, profile } = setup(100);
    // Fallan la 5.ª petición (timeline, cursor 36) y su primer reintento.
    ig.fail = (n) => (n === 5 || n === 6 ? rateLimited : null);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();

    let job = (await db.scanJobs.toArray())[0]!;
    expect(job).toMatchObject({ status: 'paused', pauseReason: 'rate_limit', rateLimitHits: 1, cursor: '36', read: 36, resumeAt: clock.t + RATE_LIMIT_PAUSE_MS[0] });
    expect(clock.wakes.at(-1)).toBe(job.resumeAt);
    expect(await db.posts.count()).toBe(36);

    // Antes de tiempo no hace nada.
    await queue.ensureRunning();
    expect(ig.calls).toHaveLength(5);

    clock.t = job.resumeAt!;
    await queue.ensureRunning();
    job = (await db.scanJobs.toArray())[0]!;
    expect(job).toMatchObject({ status: 'paused', rateLimitHits: 2, resumeAt: clock.t + RATE_LIMIT_PAUSE_MS[1] });

    clock.t = job.resumeAt!;
    await queue.ensureRunning();
    job = (await db.scanJobs.toArray())[0]!;
    expect(job).toMatchObject({ status: 'done', rateLimitHits: 0, read: 100 });
    expect(ig.calls.filter((c) => c.kind === 'timeline').map((c) => c.cursor)).toEqual([null, '12', '24', '36', '36', '36', '48', '60', '72', '84', '96']);
    expect(await profilePosts(db, profile.id)).toHaveLength(100);
  });

  it('una pausa de Instagram frena toda la cola, no solo ese perfil', async () => {
    const { db, ig } = setup(20);
    const other = makeProfile('otra');
    ig.add(other, makePosts(other, 5, NOW - DAY, 'o'));
    ig.fail = (n) => (n === 2 ? rateLimited : null);
    const { queue } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.enqueue('otra');
    await queue.ensureRunning();
    expect(ig.calls.every((c) => c.username === 'marca')).toBe(true);
    expect((await db.scanJobs.toArray()).map((j) => j.status)).toEqual(['paused', 'queued']);
  });
});

describe('reanudar tras cerrar Chrome', () => {
  it('una cola nueva (otro service worker) retoma un trabajo "running" desde su cursor', async () => {
    const { db, ig, profile } = setup(100);
    // El service worker "muere" después de la 4.ª petición: la corrida se corta.
    class Killed extends Error {}
    const first = harness(db, ig, {
      fetcher: {
        profile: (u) => ig.profile(u),
        reels: (p, c) => ig.reels(p, c),
        timeline: (p, c) => {
          if (ig.calls.length >= 4) throw new Killed();
          return ig.timeline(p, c);
        },
      },
    });
    await first.queue.enqueue('marca');
    await expect(first.queue.ensureRunning()).rejects.toBeInstanceOf(Killed);
    const mid = (await db.scanJobs.toArray())[0]!;
    expect(mid).toMatchObject({ status: 'running', phase: 'timeline', cursor: '36', read: 36 });

    // Chrome se vuelve a abrir: el service worker arranca y llama a ensureRunning.
    const second = harness(db, ig);
    await second.queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'done', read: 100 });
    expect(ig.calls.filter((c) => c.kind === 'profile')).toHaveLength(1);
    expect(ig.calls.filter((c) => c.kind === 'timeline')[3]!.cursor).toBe('36');
    expect(await profilePosts(db, profile.id)).toHaveLength(100);
  });
});

describe('re-escaneo incremental', () => {
  it('trae solo lo nuevo y lo de los últimos 30 días; no repite todo el perfil', async () => {
    const { db, ig, profile, posts } = setup(300);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    const fullCalls = ig.calls.length;

    // Una semana después: 5 posts nuevos y un fijado viejo arriba.
    clock.t += 7 * DAY;
    const fresh = makePosts(profile, 5, clock.t - DAY / 2, 'n');
    const pinned = posts[250]!;
    ig.add(profile, [pinned, ...fresh, ...posts.filter((p) => p !== pinned)]);
    ig.calls = [];
    const rescanAt = clock.t;
    await queue.enqueue('marca');
    await queue.ensureRunning();

    const job = (await db.scanJobs.toArray())[1]!;
    expect(job.since).toBe(rescanAt - RECENT_REFRESH_MS);
    expect(job.status).toBe('done');
    expect(await profilePosts(db, profile.id)).toHaveLength(305);
    // ~36 posts en los últimos 30 días + el fijado → 4 páginas de timeline, no 26.
    const timelinePages = ig.calls.filter((c) => c.kind === 'timeline').length;
    const reelPages = ig.calls.filter((c) => c.kind === 'reels').length;
    expect(timelinePages).toBeLessThanOrEqual(4);
    expect(reelPages).toBeLessThanOrEqual(3);
    expect(ig.calls.length).toBeLessThan(fullCalls / 4);
    expect((await db.posts.get(fresh[0]!.id))?.views).toBe(ig.views(fresh[0]!.code));
  });

  it('si el último escaneo es viejo, el corte es el post más reciente guardado', async () => {
    const { db, ig, profile, posts } = setup(200);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    clock.t += 90 * DAY;
    const fresh = makePosts(profile, 60, clock.t - DAY, 'n');
    ig.add(profile, [...fresh, ...posts]);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    const job = (await db.scanJobs.toArray())[1]!;
    expect(job.since).toBe(posts[0]!.takenAt);
    expect(await profilePosts(db, profile.id)).toHaveLength(260);
  });

  it('"actualizar todo" recorre el perfil completo', async () => {
    const { db, ig } = setup(50);
    const { queue } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    const first = ig.calls.length;
    ig.calls = [];
    await queue.enqueue('marca', 'full');
    await queue.ensureRunning();
    expect(ig.calls.length).toBe(first);
    expect((await db.scanJobs.toArray())[1]!).toMatchObject({ mode: 'full', since: null });
  });
});

describe('sesión cerrada, red y usuario', () => {
  it('sesión cerrada detiene todo hasta que el usuario reanuda', async () => {
    const { db, ig } = setup(30);
    ig.fail = (n) => (n === 2 ? loggedOut : null);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'paused', pauseReason: 'login_required', resumeAt: null, message: 'Inicia sesión en Instagram' });
    expect(clock.wakes.at(-1)).toBeNull();
    clock.t += 10 * DAY;
    await queue.ensureRunning();
    expect(ig.calls).toHaveLength(2);

    await queue.resume();
    await queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!.status).toBe('done');
  });

  it('sin conexión reintenta 3 veces con 1 min de espera y luego marca error', async () => {
    const { db, ig } = setup(30);
    ig.fail = (n) => (n >= 2 ? offline : null);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    for (let i = 0; i < 3; i++) {
      await queue.ensureRunning();
      const j = (await db.scanJobs.toArray())[0]!;
      expect(j).toMatchObject({ status: 'paused', pauseReason: 'network', errorRetries: i + 1 });
      clock.t = j.resumeAt!;
    }
    await queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'error', message: 'Sin conexión con Instagram' });
  });

  it('un fallo de red pasajero se recupera solo', async () => {
    const { db, ig } = setup(30);
    ig.fail = (n) => (n === 3 ? offline : null);
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    clock.t += ERROR_RETRY_MS;
    await queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'done', errorRetries: 0 });
  });

  it('pausa del usuario durante una petición: guarda el avance pero no sigue', async () => {
    const { db, ig } = setup(60);
    let queueRef: ScanQueue | null = null;
    const h = harness(db, ig, {
      fetcher: {
        profile: (u) => ig.profile(u),
        reels: (p, c) => ig.reels(p, c),
        timeline: async (p, c) => {
          if (c === '12') await queueRef!.pause();
          return ig.timeline(p, c);
        },
      },
    });
    queueRef = h.queue;
    await h.queue.enqueue('marca');
    await h.queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'paused', pauseReason: 'user', cursor: '24', read: 24 });
    // La pausa del usuario no frena otros perfiles ni programa alarmas.
    expect(h.clock.wakes.at(-1)).toBeNull();
    await h.queue.resume();
    await h.queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!).toMatchObject({ status: 'done', read: 60 });
  });

  it('cancelar durante la espera entre páginas detiene el trabajo', async () => {
    const { db, ig } = setup(60);
    let queueRef: ScanQueue | null = null;
    let sleeps = 0;
    const h = harness(db, ig, {
      sleep: async () => {
        if (++sleeps === 2) await queueRef!.cancel();
      },
    });
    queueRef = h.queue;
    await h.queue.enqueue('marca');
    await h.queue.ensureRunning();
    expect((await db.scanJobs.toArray())[0]!.status).toBe('cancelled');
    expect(ig.calls).toHaveLength(2);
  });
});

describe('applyFailure', () => {
  const job = newJob('x', 'auto', NOW);
  it('verificación y bloqueo necesitan al usuario', () => {
    for (const reason of ['checkpoint', 'action_blocked'] as const) {
      expect(applyFailure(job, { ok: false, status: 'paused', reason, httpStatus: 400, message: 'm' }, NOW)).toMatchObject({ status: 'paused', pauseReason: reason, resumeAt: null });
    }
  });
  it('un error de formato (cambió la consulta) no se reintenta', () => {
    expect(applyFailure(job, { ok: false, status: 'error', httpStatus: 200, message: 'Instagram cambió la consulta' }, NOW)).toMatchObject({ status: 'error', finishedAt: NOW });
  });
  it('5xx se reintenta', () => {
    expect(applyFailure(job, { ok: false, status: 'error', httpStatus: 503, message: 'm' }, NOW)).toMatchObject({ status: 'paused', pauseReason: 'network' });
  });
});

describe('rendimiento (meta M1)', () => {
  it('1.000 reels: la base no es el cuello de botella y se estima el tiempo real', async () => {
    const { db, ig, profile } = setup(1500); // 1.000 reels + 500 fotos
    const { queue, clock } = harness(db, ig);
    await queue.enqueue('marca');
    const t0 = performance.now();
    await queue.ensureRunning();
    const dbMs = performance.now() - t0;
    expect(await profilePosts(db, profile.id)).toHaveLength(1500);
    expect(dbMs).toBeLessThan(20_000);
    const pages = ig.calls.length;
    const waitMs = clock.slept.reduce((a, b) => a + b, 0);
    // Medido en la Fase 2: ~1,5 s por petición real además de la espera.
    const estimateMin = (waitMs + pages * 1500) / 60_000;
    console.info(`[M1] ${pages} peticiones, espera ${Math.round(waitMs / 1000)} s, base ${Math.round(dbMs)} ms, estimado real ≈ ${estimateMin.toFixed(1)} min con ${DEFAULT_PACING.pageMinMs / 1000}–${DEFAULT_PACING.pageMaxMs / 1000} s`);
  }, 60_000);
});
