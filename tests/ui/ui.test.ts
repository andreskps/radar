import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { codeFromHref, profileFromPath } from '../../src/ui/route';
import { actionBadgeText, agoText, badgeModel, compact, jobText, multiplierText, percent } from '../../src/ui/format';
import { buildProfileView, loadProfileView, type BadgePost } from '../../src/db/views';
import { finalizeProfile, savePosts, saveProfile, applyReelStats } from '../../src/db/repo';
import { newJob } from '../../src/scan/step';
import { DAY, NOW, freshDb, makePosts, makeProfile } from '../scan/fakeIg';

describe('rutas de Instagram', () => {
  it.each([
    ['/attoperfumes/', 'attoperfumes'],
    ['/AttoPerfumes/reels/', 'attoperfumes'],
    ['/attoperfumes/reel/DHUdgjLRgim/', 'attoperfumes'],
    ['/foto.perfumes_2/tagged/', 'foto.perfumes_2'],
    ['/', null],
    ['/explore/', null],
    ['/reels/abc/', null],
    ['/p/DHUdgjLRgim/', null],
    ['/direct/inbox/', null],
    ['/stories/attoperfumes/123/', null],
    ['/accounts/edit/', null],
    ['/con espacio/', null],
  ])('%s → %s', (path, user) => expect(profileFromPath(path)).toBe(user));

  it.each([
    ['/attoperfumes/reel/DHUdgjLRgim/', 'DHUdgjLRgim'],
    ['/p/Df-LQ9RBouT/?img_index=1', 'Df-LQ9RBouT'],
    ['/reel/Df8S_FuhCl2/', 'Df8S_FuhCl2'],
    ['/attoperfumes/', null],
  ])('código de %s', (href, code) => expect(codeFromHref(href)).toBe(code));
});

describe('formatos', () => {
  it('números compactos', () => {
    expect([compact(null), compact(950), compact(9240), compact(123_400), compact(999_600), compact(1_340_000), compact(25_000_000)]).toEqual(['—', '950', '9.2K', '123K', '1M', '1.3M', '25M']);
  });
  it('multiplicador y porcentaje', () => {
    expect([multiplierText(null), multiplierText(6.24), multiplierText(12.6), percent(null), percent(0.0412), percent(0.234)]).toEqual(['—', '6.2×', '13×', '—', '4.1%', '23%']);
  });
  it('hace cuánto', () => {
    expect([agoText(null, NOW), agoText(NOW, NOW), agoText(NOW - 5 * 60_000, NOW), agoText(NOW - 3 * 3_600_000, NOW), agoText(NOW - 5 * DAY, NOW)]).toEqual(['nunca', 'ahora', 'hace 5 min', 'hace 3 h', 'hace 5 días']);
  });
});

const base: BadgePost = {
  code: 'x', type: 'reel', takenAt: NOW - 20 * DAY, views: 62_000, likes: 3000, comments: 100, likesHidden: false, collab: false,
  group: 'reel', multiplier: 6.2, baseline: 10_000, sampleSize: 30, tier: 'viral', maturity: 'final', confidence: 'ok', er: 0.05, hiddenGem: false,
};

describe('modelo de la etiqueta', () => {
  it('viral: icono, color sólido, ER y detalle', () => {
    const m = badgeModel(base);
    expect(m).toMatchObject({ kind: 'tier', main: '🔥 6.2×', color: '#F97316', solid: true, chips: ['ER 5.0%'] });
    expect(m.details[0]).toBe('Viral (6.2×)');
    expect(m.details).toContain('Vistas: 62K');
    expect(m.details).toContain('Comparado con 30 reels anteriores (mediana 10K)');
  });
  it('tenue para niveles no virales; joya oculta y collab como etiquetas', () => {
    const m = badgeModel({ ...base, multiplier: 0.6, tier: 'bajo', hiddenGem: true, collab: true });
    expect(m).toMatchObject({ main: '↘ 0.6×', solid: false, chips: ['ER 5.0%', '💎 Joya oculta', 'Collab'] });
  });
  it('provisional lo avisa en el detalle', () => {
    expect(badgeModel({ ...base, maturity: 'provisional' }).details.at(-1)).toBe('Provisional: tiene menos de 7 días');
  });
  it('en curso, pocos datos y sin datos', () => {
    expect(badgeModel({ ...base, maturity: 'en_curso', tier: null }).main).toBe('⏳ En curso');
    expect(badgeModel({ ...base, confidence: 'pocos_datos', tier: null, multiplier: 2.4, sampleSize: 3 })).toMatchObject({ kind: 'pocos_datos', main: '2.4× · pocos datos', solid: false });
    const none = badgeModel({ ...base, views: null, multiplier: null, tier: null, confidence: 'sin_datos', er: null, sampleSize: 0 });
    expect(none).toMatchObject({ kind: 'sin_datos', main: 'Sin datos', chips: [] });
    expect(none.details).toContain('Vistas: sin dato');
    expect(none.details).toContain('Sin reels anteriores para comparar');
  });
  it('post con likes ocultos no muestra vistas', () => {
    const m = badgeModel({ ...base, type: 'post', group: 'post', likesHidden: true });
    expect(m.details.some((d) => d.startsWith('Vistas'))).toBe(false);
    expect(m.details).toContain('Likes: ocultos');
    expect(m.details).toContain('Comparado con 30 posts anteriores (mediana 10K)');
  });
});

describe('contador del icono y estado del chip', () => {
  const job = { ...newJob('marca', 'auto', NOW), id: 1 };
  it('según el escaneo o lo guardado', () => {
    expect(actionBadgeText(null, null)).toBe('');
    expect(actionBadgeText(3359, null)).toBe('3.4K');
    expect(actionBadgeText(3359, { ...job, status: 'done' })).toBe('3.4K');
    expect(actionBadgeText(null, job)).toBe('…');
    expect(actionBadgeText(null, { ...job, status: 'running', read: 624 })).toBe('624');
    expect(actionBadgeText(100, { ...job, status: 'paused' })).toBe('||');
  });
  it('textos del escaneo', () => {
    expect(jobText(job)).toBe('En cola…');
    expect(jobText({ ...job, status: 'running', read: 624 })).toBe('Escaneando · 624 posts');
    expect(jobText({ ...job, status: 'running', phase: 'reels', read: 3359, reelsRead: 300 })).toBe('Escaneando · 3.4K posts · vistas de 300 reels');
    expect(jobText({ ...job, status: 'paused', pauseReason: 'rate_limit', resumeAt: NOW + 14.2 * 60_000 }, NOW)).toBe('Instagram pidió esperar · sigue en 15 min');
    expect(jobText({ ...job, status: 'paused', pauseReason: 'login_required', resumeAt: null })).toBe('Inicia sesión en Instagram');
    expect(jobText({ ...job, status: 'error', message: 'x' })).toBe('Error: x');
    expect(jobText({ ...job, status: 'done' })).toBe('Escaneo completo');
    expect(jobText({ ...job, status: 'cancelled' })).toBe('Cancelado');
  });
});

describe('vista del perfil', () => {
  it('sin perfil guardado: vacía pero con el trabajo si lo hay', () => {
    const job = newJob('marca', 'auto', NOW);
    expect(buildProfileView('marca', null, [], [], job)).toEqual({ username: 'marca', summary: null, job, posts: {} });
  });

  it('desde la base: etiquetas por código y resumen (mediana de los últimos 30 reels, virales)', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    await saveProfile(db, p);
    const posts = makePosts(p, 90, NOW - 10 * DAY);
    await savePosts(db, posts, NOW);
    const reels = posts.filter((x) => x.type === 'reel');
    // Un reel viral (el más nuevo), el resto con 1.000 vistas.
    await applyReelStats(db, reels.map((r, i) => ({ code: r.code, views: i === 0 ? 50_000 : 1000, likes: null, comments: null, durationSec: 30 })), NOW);
    await finalizeProfile(db, p.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });
    await db.scanJobs.add({ ...newJob('marca', 'auto', NOW - DAY), status: 'done' });

    const view = await loadProfileView(db, '@Marca');
    expect(Object.keys(view.posts)).toHaveLength(90);
    expect(view.posts[reels[0]!.code]).toMatchObject({ tier: 'mega_viral', multiplier: 50, views: 50_000, confidence: 'ok' });
    expect(view.summary).toMatchObject({ username: 'marca', posts: 90, reels: 60, medianReelViews: 1000, medianSample: 30, complete: true, lastScanAt: NOW });
    expect(view.summary!.virals).toBeGreaterThanOrEqual(1);
    expect(view.job?.status).toBe('done');

    // Un trabajo activo tiene prioridad sobre el último terminado.
    await db.scanJobs.add({ ...newJob('marca', 'auto', NOW), status: 'running' });
    expect((await loadProfileView(db, 'marca')).job?.status).toBe('running');
    expect((await loadProfileView(db, 'otra')).summary).toBeNull();
  });
});
