import { describe, expect, it } from 'vitest';
import { bestTime, localDayHour } from '../../src/metrics';

// Lunes 23-11-2026 03:00 UTC = domingo 22-11-2026 22:00 en Bogotá (UTC-5).
const MON_03_UTC = Date.UTC(2026, 10, 23, 3, 0, 0);
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

describe('localDayHour', () => {
  it('convierte a la hora de Bogotá', () => {
    expect(localDayHour(MON_03_UTC, 'America/Bogota')).toEqual({ day: 6, hour: 22 });
  });
  it('otra zona horaria', () => {
    expect(localDayHour(MON_03_UTC, 'UTC')).toEqual({ day: 0, hour: 3 });
  });
});

describe('bestTime', () => {
  const entries = (n: number, at: number, multiplier: number | null) =>
    Array.from({ length: n }, (_, i) => ({ takenAt: at + i * WEEK, multiplier }));

  it('con 29 posts avisa que no alcanza y no recomienda franjas', () => {
    const r = bestTime(entries(29, MON_03_UTC, 1));
    expect(r).toMatchObject({ sampleSize: 29, enough: false, top: [] });
    expect(r.cells).toEqual([{ day: 6, hour: 22, count: 29, medianMultiplier: 1 }]);
  });

  it('con 30 posts recomienda las mejores franjas por multiplicador mediano', () => {
    const r = bestTime([
      ...entries(20, MON_03_UTC, 1), // dom 22 h
      ...entries(5, MON_03_UTC + 15 * HOUR, 4), // lun 13 h
      ...entries(4, MON_03_UTC + 39 * HOUR, 2), // mar 13 h
      ...entries(1, MON_03_UTC + 63 * HOUR, 50), // mié 13 h: una sola publicación, no se recomienda
      ...entries(3, MON_03_UTC, null), // sin multiplicador: no cuentan
    ]);
    expect(r.sampleSize).toBe(30);
    expect(r.enough).toBe(true);
    expect(r.top.map((c) => [c.day, c.hour, c.medianMultiplier])).toEqual([
      [0, 13, 4],
      [1, 13, 2],
      [6, 22, 1],
    ]);
    expect(r.cells.map((c) => c.day)).toEqual([0, 1, 2, 6]);
  });

  it('desempata por cantidad y respeta opciones', () => {
    const r = bestTime([...entries(3, MON_03_UTC, 2), ...entries(2, MON_03_UTC + HOUR, 2)], {
      minPosts: 5,
      top: 1,
      timeZone: 'UTC',
    });
    expect(r.top).toEqual([{ day: 0, hour: 3, count: 3, medianMultiplier: 2 }]);
  });
});
