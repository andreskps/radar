import { DAY_MS, HOUR_MS, type PostInput } from '../../src/metrics';

export const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
export { DAY_MS, HOUR_MS };

export function reel(id: string, views: number | null | undefined, ageMs: number, extra: Partial<PostInput> = {}): PostInput {
  return { id, type: 'reel', takenAt: NOW - ageMs, views, likes: 100, comments: 10, ...extra };
}

/** `n` reels viejos (100 días atrás en adelante, uno por día), todos con las mismas vistas salvo que se pase una lista. */
export function history(n: number, views: number | number[] = 1000, extra: Partial<PostInput> = {}): PostInput[] {
  return Array.from({ length: n }, (_, i) =>
    reel(`h${String(i).padStart(3, '0')}`, Array.isArray(views) ? views[i] : views, (200 - i) * DAY_MS, extra),
  );
}
