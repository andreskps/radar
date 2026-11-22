import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyFilters, bucketOf, heatmap, monthlyCounts, queryContent, summarize, timeSeries, words, DEFAULT_QUERY } from '../../src/ui/panel/analytics';
import { loadPanelData, type PanelPost } from '../../src/db/views';
import { applyReelStats, finalizeProfile, savePosts, saveProfile } from '../../src/db/repo';
import { DAY, NOW, freshDb, makePosts, makeProfile } from '../scan/fakeIg';

function post(over: Partial<PanelPost>): PanelPost {
  return {
    id: over.code ?? 'x', code: 'x', type: 'reel', takenAt: NOW - 10 * DAY, views: 1000, likes: 100, comments: 10, likesHidden: false, collab: false,
    group: 'reel', multiplier: 1, baseline: 1000, sampleSize: 30, tier: 'normal', maturity: 'final', confidence: 'ok', er: 0.11, hiddenGem: false,
    caption: null, hashtags: [], durationSec: 30, coverUrl: null, reach: 0.1, viralScore: 50, ...over,
  };
}

describe('filtros', () => {
  const posts = [post({ code: 'a', takenAt: NOW - 5 * DAY }), post({ code: 'b', type: 'carousel', takenAt: NOW - 60 * DAY }), post({ code: 'c', type: 'post', takenAt: NOW - 400 * DAY })];
  it('por rango y tipo ("posts" incluye carruseles)', () => {
    expect(applyFilters(posts, { range: '30d', type: 'all', now: NOW }).map((p) => p.code)).toEqual(['a']);
    expect(applyFilters(posts, { range: '90d', type: 'all', now: NOW }).map((p) => p.code)).toEqual(['a', 'b']);
    expect(applyFilters(posts, { range: 'all', type: 'post', now: NOW }).map((p) => p.code)).toEqual(['b', 'c']);
    expect(applyFilters(posts, { range: '1y', type: 'reel', now: NOW }).map((p) => p.code)).toEqual(['a']);
  });
});

describe('resumen', () => {
  it('cada estadística con su tamaño de muestra y aviso de pocos datos', () => {
    const posts = [
      post({ code: 'v1', tier: 'viral', multiplier: 6, views: 6000 }),
      post({ code: 'n1', views: 1000 }),
      post({ code: 'n2', views: 2000 }),
      post({ code: 'e', maturity: 'en_curso', tier: null, views: 500 }),
      post({ code: 'p', type: 'post', views: null, er: null, tier: null, confidence: 'pocos_datos', multiplier: 3 }),
    ];
    const s = summarize(posts, { range: '30d', now: NOW });
    expect(s.count).toBe(5);
    expect(s.medianViews).toEqual({ value: 1500, n: 4, low: true });
    expect(s.viralPct).toEqual({ value: 1 / 3, n: 3, low: true });
    expect(s.medianEr.n).toBe(4);
    expect(s.perWeek.value).toBeCloseTo(5 / (30 / 7));
    expect(s.tiers).toMatchObject({ viral: 1, normal: 2, en_curso: 1, sin_datos: 1, mega_viral: 0 });
    // Top: solo con nivel, por multiplicador.
    expect(s.top.map((p) => p.code)).toEqual(['v1', 'n1', 'n2']);
  });
  it('vacío no falla', () => {
    const s = summarize([], { range: 'all', now: NOW });
    expect(s).toMatchObject({ count: 0, medianViews: { value: null, n: 0, low: true }, perWeek: { value: null } });
  });
  it('en "Todo", las semanas van del primer post a hoy', () => {
    const s = summarize([post({ takenAt: NOW - 70 * DAY }), post({ takenAt: NOW - DAY })], { range: 'all', now: NOW });
    expect(s.perWeek.value).toBeCloseTo(2 / 10);
  });
});

describe('contenido', () => {
  const posts = [
    post({ code: 'a', caption: 'Perfume de VAINILLA para él', hashtags: ['#perfume'], multiplier: 3, tier: 'despego', takenAt: NOW - 3 * DAY, collab: true }),
    post({ code: 'b', caption: 'Notas cítricas', multiplier: 0.5, tier: 'bajo', takenAt: NOW - 2 * DAY, views: null }),
    post({ code: 'c', caption: 'Vainilla y ámbar', multiplier: null, tier: null, confidence: 'sin_datos', takenAt: NOW - 1 * DAY }),
  ];
  it('búsqueda sin tildes ni mayúsculas, en texto y hashtags', () => {
    expect(queryContent(posts, { ...DEFAULT_QUERY, search: 'vainilla' }).map((p) => p.code)).toEqual(['c', 'a']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, search: 'citricas' }).map((p) => p.code)).toEqual(['b']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, search: '#perfume vainilla' }).map((p) => p.code)).toEqual(['a']);
  });
  it('filtros de nivel y collab', () => {
    expect(queryContent(posts, { ...DEFAULT_QUERY, tier: 'virales' }).map((p) => p.code)).toEqual(['a']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, tier: 'sin_datos' }).map((p) => p.code)).toEqual(['c']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, collab: 'no' }).map((p) => p.code)).toEqual(['c', 'b']);
  });
  it('orden con los que no tienen dato al final en ambas direcciones', () => {
    expect(queryContent(posts, { ...DEFAULT_QUERY, sort: 'multiplier' }).map((p) => p.code)).toEqual(['a', 'b', 'c']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, sort: 'multiplier', desc: false }).map((p) => p.code)).toEqual(['b', 'a', 'c']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, sort: 'views' }).map((p) => p.code)).toEqual(['a', 'c', 'b']);
    expect(queryContent(posts, { ...DEFAULT_QUERY, sort: 'date', desc: false }).map((p) => p.code)).toEqual(['a', 'b', 'c']);
    expect(queryContent([post({ code: 'h', likesHidden: true }), post({ code: 'k', likes: 5 })], { ...DEFAULT_QUERY, sort: 'likes' }).map((p) => p.code)).toEqual(['k', 'h']);
  });
});

describe('tiempo y palabras', () => {
  it('serie: vistas en reels, likes + comentarios en posts, sin los que no tienen dato', () => {
    const s = timeSeries([post({ code: 'r', takenAt: 2, views: 500 }), post({ code: 'p', type: 'post', takenAt: 1, likes: 40, comments: 2 }), post({ code: 'h', type: 'post', likesHidden: true }), post({ code: 'n', views: null })]);
    expect(s.map((p) => [p.code, p.y])).toEqual([['p', 42], ['r', 500]]);
    expect(bucketOf(post({ tier: 'viral' }))).toBe('viral');
  });
  it('meses con los vacíos incluidos y cuántos virales', () => {
    const m = monthlyCounts([post({ takenAt: Date.UTC(2026, 0, 10) }), post({ takenAt: Date.UTC(2026, 2, 10), tier: 'viral' }), post({ takenAt: Date.UTC(2026, 2, 20) })]);
    expect(m.map((x) => [x.key, x.count, x.virals])).toEqual([['2026-01', 1, 0], ['2026-02', 0, 0], ['2026-03', 2, 1]]);
    expect(monthlyCounts([])).toEqual([]);
    // Cruce de año.
    expect(monthlyCounts([post({ takenAt: Date.UTC(2025, 11, 10) }), post({ takenAt: Date.UTC(2026, 0, 10) })]).map((x) => x.key)).toEqual(['2025-12', '2026-01']);
  });
  it('mejor hora pide 30 posts con nivel', () => {
    expect(heatmap(Array.from({ length: 10 }, (_, i) => post({ code: `p${i}` }))).enough).toBe(false);
    expect(heatmap(Array.from({ length: 40 }, (_, i) => post({ code: `p${i}`, takenAt: NOW - i * DAY }))).enough).toBe(true);
  });
  it('palabras y hashtags por multiplicador mediano, solo con nivel', () => {
    const posts = [
      ...Array.from({ length: 3 }, (_, i) => post({ code: `a${i}`, caption: 'vainilla dulce #gourmand', hashtags: ['#gourmand'], multiplier: 4 })),
      ...Array.from({ length: 3 }, (_, i) => post({ code: `b${i}`, caption: 'cítrico fresco #fresh', hashtags: ['#fresh'], multiplier: 0.5 })),
      post({ code: 'x', caption: 'vainilla', multiplier: 9, confidence: 'pocos_datos' }),
    ];
    const w = words(posts);
    expect(w.sampleSize).toBe(6);
    expect(w.hashtags.map((t) => t.term)).toEqual(['#gourmand', '#fresh']);
    // "dulce" y "vainilla" empatan (3 usos, 4×): orden alfabético. El post con pocos datos no cuenta.
    expect(w.words.slice(0, 2)).toEqual([
      { term: 'dulce', count: 3, medianMultiplier: 4 },
      { term: 'vainilla', count: 3, medianMultiplier: 4 },
    ]);
  });
});

describe('datos del panel desde la base y tiempo con 1.000 posts', () => {
  it('trae todos los posts con texto y métrica, y los cálculos tardan poco', async () => {
    const db = freshDb();
    const p = makeProfile('marca');
    await saveProfile(db, p);
    const posts = makePosts(p, 1000, NOW - 4 * DAY);
    await savePosts(db, posts, NOW);
    await applyReelStats(db, posts.filter((x) => x.type === 'reel').map((x, i) => ({ code: x.code, views: 1000 + ((i * 7919) % 5000), likes: null, comments: null, durationSec: 30 })), NOW);
    await finalizeProfile(db, p.id, { now: NOW, scanStartedAt: NOW, fullScan: true, unmatchedReels: 0 });

    const t0 = performance.now();
    const data = await loadPanelData(db, 'marca');
    const tLoad = performance.now() - t0;
    expect(data.posts).toHaveLength(1000);
    expect(data.posts[0]).toMatchObject({ caption: expect.stringContaining('#tag'), hashtags: ['tag'] });
    expect(data.posts.filter((x) => x.multiplier !== null).length).toBeGreaterThan(900);

    const t1 = performance.now();
    const all = applyFilters(data.posts, { range: 'all', type: 'all', now: NOW });
    summarize(all, { range: 'all', now: NOW });
    queryContent(all, { ...DEFAULT_QUERY, search: 'post', sort: 'multiplier' });
    timeSeries(all);
    heatmap(all);
    monthlyCounts(all);
    words(all);
    const tCalc = performance.now() - t1;
    console.info(`[panel] 1.000 posts: base ${Math.round(tLoad)} ms, cálculos de las 4 pestañas ${Math.round(tCalc)} ms`);
    expect(tCalc).toBeLessThan(300);
    expect((await loadPanelData(db, 'nadie')).profile).toBeNull();
  });
});
