import { describe, expect, it } from 'vitest';
import {
  analyzeProfile,
  engagementRate,
  groupOf,
  maturityOf,
  performanceValue,
  type PostInput,
  type PostMetrics,
} from '../../src/metrics';
import { DAY_MS, HOUR_MS, NOW, history, reel } from './helpers';

const analyze = (posts: PostInput[], followers: number | null = 10_000, extra = {}) =>
  analyzeProfile(posts, { now: NOW, followers, ...extra });
const byId = (metrics: PostMetrics[], id: string) => metrics.find((m) => m.postId === id)!;

describe('niveles (cada borde exacto)', () => {
  // 10 reels de referencia con 1.000 vistas → línea base 1.000.
  const cases: [number, number, string][] = [
    [10_000, 10, 'mega_viral'],
    [9_999, 9.999, 'viral'],
    [5_000, 5, 'viral'],
    [4_999, 4.999, 'despego'],
    [2_000, 2, 'despego'],
    [1_999, 1.999, 'arriba'],
    [1_250, 1.25, 'arriba'],
    [1_249, 1.249, 'normal'],
    [800, 0.8, 'normal'],
    [799, 0.799, 'bajo'],
    [0, 0, 'bajo'],
  ];
  it.each(cases)('%i vistas → %f× → %s', (views, multiplier, tier) => {
    const m = byId(analyze([...history(10), reel('t', views, 10 * DAY_MS)]), 't');
    expect(m.baseline).toBe(1000);
    expect(m.multiplier).toBeCloseTo(multiplier, 10);
    expect(m.tier).toBe(tier);
    expect(m.confidence).toBe('ok');
  });

  it('acepta umbrales personalizados', () => {
    const posts = [...history(10), reel('t', 3_000, 10 * DAY_MS)];
    expect(byId(analyze(posts, 1, { thresholds: { viral: 3 } }), 't').tier).toBe('viral');
  });
});

describe('línea base móvil', () => {
  it('no cuenta el propio post', () => {
    const m = byId(analyze([...history(10), reel('t', 1_000_000, 10 * DAY_MS)]), 't');
    expect(m.baseline).toBe(1000);
    expect(m.sampleSize).toBe(10);
  });

  it('usa solo los 30 anteriores', () => {
    const views = [...Array(10).fill(100), ...Array(30).fill(1000)];
    const m = byId(analyze([...history(40, views), reel('t', 2000, 10 * DAY_MS)]), 't');
    expect(m.sampleSize).toBe(30);
    expect(m.baseline).toBe(1000);
  });

  it('respeta una ventana personalizada', () => {
    const views = [...Array(10).fill(100), ...Array(5).fill(1000)];
    const m = byId(analyze([...history(15, views), reel('t', 2000, 10 * DAY_MS)], 1, { window: 5 }), 't');
    expect(m.sampleSize).toBe(5);
    expect(m.baseline).toBe(1000);
  });

  it('un reel viejo se compara con su época, no con la cuenta ya crecida', () => {
    // 10 reels a 100 vistas, un reel viejo de 500, luego la cuenta crece a 10.000.
    const posts = [...history(10, 100), reel('viejo', 500, 150 * DAY_MS), ...history(10, 10_000).map((p, i) => ({ ...p, id: `n${i}`, takenAt: NOW - (140 - i) * DAY_MS }))];
    expect(byId(analyze(posts), 'viejo').multiplier).toBe(5);
    expect(byId(analyze(posts), 'viejo').tier).toBe('viral');
  });

  it('calcula igual que una hoja de cálculo (meta M9)', () => {
    // Mediana de [1200, 800, 1500, 900, 1100, 1000, 700, 1300] = (1000 + 1100) / 2 = 1050 → 3150 / 1050 = 3×.
    const posts = [...history(8, [1200, 800, 1500, 900, 1100, 1000, 700, 1300]), reel('t', 3150, 10 * DAY_MS)];
    const m = byId(analyze(posts), 't');
    expect(m.baseline).toBe(1050);
    expect(m.multiplier).toBe(3);
    expect(m.tier).toBe('despego');
  });

  it('devuelve los resultados en el orden de entrada y desempata por id', () => {
    const posts = [reel('b', 1000, 20 * DAY_MS), reel('a', 3000, 20 * DAY_MS), reel('c', 2000, 30 * DAY_MS)];
    const metrics = analyze(posts);
    expect(metrics.map((m) => m.postId)).toEqual(['b', 'a', 'c']);
    // Orden cronológico: c, a, b → la base de b es la mediana de [2000, 3000].
    expect(byId(metrics, 'b').baseline).toBe(2500);
    expect(byId(metrics, 'a').baseline).toBe(2000);
  });
});

describe('confianza (mínimo 8 de referencia)', () => {
  it('7 de referencia → pocos datos, sin nivel, con multiplicador informativo', () => {
    const m = byId(analyze([...history(7), reel('t', 5000, 10 * DAY_MS)]), 't');
    expect(m.sampleSize).toBe(7);
    expect(m.confidence).toBe('pocos_datos');
    expect(m.tier).toBeNull();
    expect(m.multiplier).toBe(5);
  });

  it('8 de referencia → ok', () => {
    const m = byId(analyze([...history(8), reel('t', 5000, 10 * DAY_MS)]), 't');
    expect(m.confidence).toBe('ok');
    expect(m.tier).toBe('viral');
  });

  it('el primer post no tiene base', () => {
    const m = analyze([reel('t', 5000, 10 * DAY_MS)])[0];
    expect(m).toMatchObject({ baseline: null, multiplier: null, sampleSize: 0, confidence: 'pocos_datos', tier: null });
  });

  it('mínimo personalizado', () => {
    const m = byId(analyze([...history(3), reel('t', 5000, 10 * DAY_MS)], 1, { minSample: 3 }), 't');
    expect(m.confidence).toBe('ok');
  });

  it('línea base 0 → sin datos', () => {
    const m = byId(analyze([...history(10, 0), reel('t', 500, 10 * DAY_MS)]), 't');
    expect(m.multiplier).toBeNull();
    expect(m.confidence).toBe('sin_datos');
    expect(m.tier).toBeNull();
  });
});

describe('madurez', () => {
  it.each([
    [71 * HOUR_MS, 'en_curso'],
    [72 * HOUR_MS - 1, 'en_curso'],
    [72 * HOUR_MS, 'provisional'],
    [73 * HOUR_MS, 'provisional'],
    [7 * DAY_MS - 1, 'provisional'],
    [7 * DAY_MS, 'final'],
  ])('edad %i ms → %s', (age, maturity) => {
    expect(maturityOf(NOW - age, NOW)).toBe(maturity);
  });

  it('71 h: en curso, sin nivel; 73 h: provisional, con nivel', () => {
    const metrics = analyze([...history(10), reel('71h', 5000, 71 * HOUR_MS), reel('73h', 5000, 73 * HOUR_MS)]);
    expect(byId(metrics, '71h')).toMatchObject({ maturity: 'en_curso', tier: null, multiplier: 5 });
    expect(byId(metrics, '73h')).toMatchObject({ maturity: 'provisional', tier: 'viral' });
  });

  it('un reel en curso no entra en ninguna mediana', () => {
    const metrics = analyze([...history(10), reel('nuevo', 1_000_000, 70 * HOUR_MS), reel('ultimo', 1000, 1 * HOUR_MS)]);
    expect(byId(metrics, 'ultimo').sampleSize).toBe(10);
    expect(byId(metrics, 'ultimo').baseline).toBe(1000);
  });
});

describe('datos faltantes y likes ocultos', () => {
  it.each([null, undefined])('reel sin vistas (%s) → sin datos, nunca 0', (views) => {
    const metrics = analyze([...history(10), reel('sin', views, 20 * DAY_MS), reel('t', 1000, 10 * DAY_MS)]);
    expect(byId(metrics, 'sin')).toMatchObject({ value: null, multiplier: null, confidence: 'sin_datos', tier: null, reach: null });
    expect(byId(metrics, 't').sampleSize).toBe(10);
  });

  it('post con likes ocultos no entra en la mediana de likes', () => {
    const posts: PostInput[] = [
      ...Array.from({ length: 10 }, (_, i): PostInput => ({ id: `p${i}`, type: 'post', takenAt: NOW - (100 - i) * DAY_MS, likes: 90, comments: 10 })),
      { id: 'oculto', type: 'post', takenAt: NOW - 50 * DAY_MS, likes: 0, comments: 5, likesHidden: true },
      { id: 't', type: 'carousel', takenAt: NOW - 10 * DAY_MS, likes: 300, comments: null },
    ];
    const metrics = analyze(posts);
    expect(byId(metrics, 'oculto')).toMatchObject({ value: null, er: null, confidence: 'sin_datos' });
    expect(byId(metrics, 't')).toMatchObject({ group: 'post', value: 300, baseline: 100, sampleSize: 10, multiplier: 3 });
  });

  it('reel con likes ocultos conserva sus vistas pero no tiene ER', () => {
    const m = byId(analyze([...history(10), reel('t', 2000, 10 * DAY_MS, { likesHidden: true })]), 't');
    expect(m.multiplier).toBe(2);
    expect(m.er).toBeNull();
  });

  it('reels y posts se comparan por separado', () => {
    const posts: PostInput[] = [...history(10, 1000), { id: 'p', type: 'post', takenAt: NOW - 10 * DAY_MS, likes: 50 }];
    expect(byId(analyze(posts), 'p')).toMatchObject({ group: 'post', sampleSize: 0, baseline: null });
  });

  it('valores negativos o no numéricos cuentan como faltantes', () => {
    expect(performanceValue({ id: 'x', type: 'reel', takenAt: 0, views: -1 })).toBeNull();
    expect(performanceValue({ id: 'x', type: 'reel', takenAt: 0, views: Number.NaN })).toBeNull();
    expect(performanceValue({ id: 'x', type: 'post', takenAt: 0 })).toBeNull();
  });
});

describe('ER y alcance', () => {
  it('ER del reel = (likes + comentarios) ÷ vistas', () => {
    expect(engagementRate(reel('r', 1000, 0, { likes: 40, comments: 10 }), null)).toBe(0.05);
    expect(engagementRate(reel('r', 1000, 0, { likes: 40, comments: null }), null)).toBe(0.04);
  });

  it('ER del post = (likes + comentarios) ÷ seguidores', () => {
    const post: PostInput = { id: 'p', type: 'post', takenAt: 0, likes: 450, comments: 50 };
    expect(engagementRate(post, 10_000)).toBe(0.05);
    expect(engagementRate(post, null)).toBeNull();
    expect(engagementRate(post, 0)).toBeNull();
  });

  it('ER nulo si faltan likes o las vistas son 0', () => {
    expect(engagementRate(reel('r', 0, 0), null)).toBeNull();
    expect(engagementRate(reel('r', null, 0), null)).toBeNull();
    expect(engagementRate(reel('r', 1000, 0, { likes: null }), null)).toBeNull();
  });

  it('alcance = valor ÷ seguidores', () => {
    const m = byId(analyze([...history(10), reel('t', 5000, 10 * DAY_MS)], 10_000), 't');
    expect(m.reach).toBe(0.5);
    expect(byId(analyze([reel('t', 5000, 10 * DAY_MS)], 0), 't').reach).toBeNull();
    expect(byId(analyze([reel('t', 5000, 10 * DAY_MS)], null), 't').reach).toBeNull();
  });

  it('marca Collab', () => {
    const metrics = analyze([reel('a', 1, DAY_MS * 10, { collab: true }), reel('b', 1, DAY_MS * 9)]);
    expect(metrics.map((m) => m.collab)).toEqual([true, false]);
  });

  it('groupOf', () => {
    expect([groupOf('reel'), groupOf('post'), groupOf('carousel')]).toEqual(['reel', 'post', 'post']);
  });
});

describe('Joya oculta', () => {
  // Referencia: 10 reels con 1.000 vistas y ER 1 %.
  const base = () => history(10, 1000, { likes: 10, comments: 0 });

  it('ER alto y multiplicador < 1 → joya', () => {
    const metrics = analyze([...base(), reel('joya', 500, 10 * DAY_MS, { likes: 100, comments: 0 })]);
    expect(byId(metrics, 'joya')).toMatchObject({ multiplier: 0.5, hiddenGem: true });
  });

  it('ER alto pero multiplicador ≥ 1 → no es joya', () => {
    const metrics = analyze([...base(), reel('t', 3000, 10 * DAY_MS, { likes: 600, comments: 0 })]);
    expect(byId(metrics, 't').hiddenGem).toBe(false);
  });

  it('multiplicador < 1 con ER normal → no es joya', () => {
    const metrics = analyze([...base(), reel('t', 500, 10 * DAY_MS, { likes: 1, comments: 0 })]);
    expect(byId(metrics, 't').hiddenGem).toBe(false);
  });

  it('en curso o con pocos datos → no es joya', () => {
    const enCurso = analyze([...base(), reel('t', 500, 10 * HOUR_MS, { likes: 100, comments: 0 })]);
    expect(byId(enCurso, 't').hiddenGem).toBe(false);
    const pocos = analyze([...base().slice(0, 7), ...Array.from({ length: 3 }, (_, i) => reel(`x${i}`, null, (150 - i) * DAY_MS)), reel('t', 500, 10 * DAY_MS, { likes: 100, comments: 0 })]);
    expect(byId(pocos, 't').hiddenGem).toBe(false);
  });

  it('con menos de 8 ER disponibles no se marca ninguna', () => {
    // 10 reels de referencia válidos (vistas), pero con likes ocultos → sin ER.
    const metrics = analyze([...history(10, 1000, { likesHidden: true }), reel('t', 500, 10 * DAY_MS, { likes: 100, comments: 0 })]);
    expect(byId(metrics, 't').confidence).toBe('ok');
    expect(byId(metrics, 't').hiddenGem).toBe(false);
  });
});
