import { describe, expect, it } from 'vitest';
import { analyzeProfile, viralScores, type PostInput } from '../../src/metrics';
import { DAY_MS, NOW } from './helpers';

describe('rendimiento', () => {
  it('analiza un perfil de 5.000 posts en menos de 500 ms', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const posts: PostInput[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `p${i}`,
      type: i % 3 === 0 ? 'post' : 'reel',
      takenAt: NOW - (5000 - i) * (DAY_MS / 4),
      views: Math.round(1000 * Math.exp(rand() * 4)),
      likes: Math.round(100 * rand()),
      comments: Math.round(10 * rand()),
    }));

    const start = performance.now();
    const metrics = analyzeProfile(posts, { now: NOW, followers: 20_000 });
    viralScores(metrics.filter((m) => m.group === 'reel').map((m) => ({ id: m.postId, multiplier: m.multiplier, reach: m.reach, er: m.er })));
    const ms = performance.now() - start;

    expect(metrics).toHaveLength(5000);
    expect(ms).toBeLessThan(500);
  });
});
