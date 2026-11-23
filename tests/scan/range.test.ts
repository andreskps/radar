import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ScanQueue } from '../../src/scan/queue';
import { normalizeRange } from '../../src/scan/step';
import { profilePosts } from '../../src/db/repo';
import type { RadarDB, ScanRange } from '../../src/db/schema';
import { dayMs, formRange, rangeText, type RangeForm } from '../../src/ui/range';
import { DAY, FakeInstagram, NOW, freshDb, makePosts, makeProfile } from './fakeIg';

function run(db: RadarDB, ig: FakeInstagram) {
  return new ScanQueue({ db, fetcher: ig, now: () => NOW, sleep: async () => {}, random: () => 0.5 });
}

/** 100 posts, uno por día, el más nuevo hace 1 día (NOW - DAY) y el más viejo hace 100. */
function setup() {
  const db = freshDb();
  const ig = new FakeInstagram();
  const profile = makeProfile('marca');
  const posts = makePosts(profile, 100);
  ig.add(profile, posts);
  return { db, ig, profile, posts };
}

async function scan(range: ScanRange | null) {
  const s = setup();
  const queue = run(s.db, s.ig);
  await queue.enqueue('marca', 'auto', range);
  await queue.ensureRunning();
  const job = (await s.db.scanJobs.toArray())[0]!;
  const stored = await profilePosts(s.db, s.profile.id);
  return { ...s, job, stored };
}

describe('rango del escaneo', () => {
  it('últimos N días: guarda solo esos posts y deja de pedir páginas al pasarlos', async () => {
    const { job, stored, ig, db, profile } = await scan({ kind: 'days', days: 20 });
    expect(job).toMatchObject({ status: 'done', since: NOW - 20 * DAY, range: { kind: 'days', days: 20 } });
    expect(stored).toHaveLength(20);
    expect(stored.every((p) => p.takenAt >= NOW - 20 * DAY)).toBe(true);
    expect(job.read).toBe(20);
    // 12 posts por página: con 20 días bastan 2 páginas de timeline (no las 9 del perfil completo).
    expect(ig.calls.filter((c) => c.kind === 'timeline')).toHaveLength(2);
    // Un escaneo parcial no marca el perfil como completo.
    expect((await db.profiles.get(profile.id))!.complete).toBe(false);
  });

  it('entre fechas: guarda solo lo de ese tramo, con "hasta" incluido', async () => {
    const from = NOW - 40 * DAY;
    const to = NOW - 30 * DAY;
    const { job, stored } = await scan({ kind: 'dates', from, to });
    expect(job.status).toBe('done');
    expect(stored.map((p) => p.takenAt).sort((a, b) => b - a)).toEqual(Array.from({ length: 11 }, (_, i) => to - i * DAY));
    expect(job.read).toBe(11);
  });

  it('todo: recorre el perfil entero y lo marca completo', async () => {
    const { job, stored, db, profile } = await scan({ kind: 'all' });
    expect(job).toMatchObject({ status: 'done', since: null });
    expect(stored).toHaveLength(100);
    expect((await db.profiles.get(profile.id))!.complete).toBe(true);
  });

  it('"todo" en un perfil ya escaneado vuelve a recorrerlo entero (no incremental)', async () => {
    const { db, ig } = setup();
    const queue = run(db, ig);
    await queue.enqueue('marca');
    await queue.ensureRunning();
    ig.calls.length = 0;
    await queue.enqueue('marca', 'auto', { kind: 'all' });
    await queue.ensureRunning();
    expect(ig.calls.filter((c) => c.kind === 'timeline')).toHaveLength(9);
  });

  it('normaliza rangos raros', () => {
    expect(normalizeRange({ kind: 'days', days: 0 })).toBeNull();
    expect(normalizeRange({ kind: 'days', days: 7.4 })).toEqual({ kind: 'days', days: 7 });
    expect(normalizeRange({ kind: 'dates', from: 5, to: 2 })).toEqual({ kind: 'dates', from: 2, to: 5 });
    expect(normalizeRange({ kind: 'dates', from: NaN, to: 2 })).toBeNull();
    expect(normalizeRange(undefined)).toBeNull();
  });
});

describe('formulario de rango (chip)', () => {
  const base: RangeForm = { choice: 'new', days: '30', from: '2026-10-01', to: '2026-10-31' };

  it('lo nuevo no lleva rango y todo sí', () => {
    expect(formRange(base, NOW)).toEqual({ ok: true, range: null });
    expect(formRange({ ...base, choice: 'all' }, NOW)).toEqual({ ok: true, range: { kind: 'all' } });
  });

  it('días: entero entre 1 y 3650', () => {
    expect(formRange({ ...base, choice: 'days' }, NOW)).toEqual({ ok: true, range: { kind: 'days', days: 30 } });
    for (const days of ['0', '-3', '2.5', '', 'abc', '4000']) expect(formRange({ ...base, choice: 'days', days }, NOW).ok).toBe(false);
  });

  it('fechas: día completo en hora local, en orden y no futuras', () => {
    const res = formRange({ ...base, choice: 'dates' }, NOW);
    expect(res).toEqual({ ok: true, range: { kind: 'dates', from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 9, 31, 23, 59, 59, 999).getTime() } });
    expect(formRange({ ...base, choice: 'dates', from: '2026-11-01', to: '2026-10-01' }, NOW).ok).toBe(false);
    expect(formRange({ ...base, choice: 'dates', from: '2027-01-01', to: '2027-02-01' }, NOW).ok).toBe(false);
    expect(formRange({ ...base, choice: 'dates', to: '' }, NOW).ok).toBe(false);
    expect(dayMs('2026-02-30', false)).toBeNull();
  });

  it('texto del rango', () => {
    expect(rangeText(null)).toBeNull();
    expect(rangeText({ kind: 'all' })).toBe('todo');
    expect(rangeText({ kind: 'days', days: 7 })).toBe('últimos 7 días');
    expect(rangeText({ kind: 'dates', from: new Date(2026, 0, 1).getTime(), to: new Date(2026, 0, 31).getTime() })).toMatch(/2026.*–.*2026/);
  });
});
