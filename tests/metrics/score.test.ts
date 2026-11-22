import { describe, expect, it } from 'vitest';
import { viralScores } from '../../src/metrics';

describe('Puntaje Viral', () => {
  it('el mejor en todo = 100, el peor = 0', () => {
    const scores = viralScores([
      { id: 'a', multiplier: 10, reach: 2, er: 0.1 },
      { id: 'b', multiplier: 1, reach: 0.5, er: 0.05 },
      { id: 'c', multiplier: 0.5, reach: 0.1, er: 0.01 },
    ]);
    expect(scores.get('a')).toBe(100);
    expect(scores.get('b')).toBe(50);
    expect(scores.get('c')).toBe(0);
  });

  it('pondera 50 / 30 / 20', () => {
    // a es el mejor en multiplicador (1) y el peor en alcance y ER (0) → 50.
    const scores = viralScores([
      { id: 'a', multiplier: 10, reach: 0.1, er: 0.01 },
      { id: 'b', multiplier: 1, reach: 2, er: 0.1 },
    ]);
    expect(scores.get('a')).toBe(50);
    expect(scores.get('b')).toBe(50);
  });

  it('una cuenta gigante no domina: el multiplicador pesa más que el alcance', () => {
    const scores = viralScores([
      { id: 'chica', multiplier: 20, reach: 0.5, er: 0.08 },
      { id: 'gigante', multiplier: 1, reach: 5, er: 0.08 },
    ]);
    expect(scores.get('chica')!).toBeGreaterThan(scores.get('gigante')!);
  });

  it('sin multiplicador no hay puntaje', () => {
    expect(viralScores([{ id: 'a', multiplier: null, reach: 1, er: 0.1 }]).get('a')).toBeNull();
  });

  it('si falta ER o alcance, su peso se reparte', () => {
    const scores = viralScores([
      { id: 'a', multiplier: 10, reach: null, er: null },
      { id: 'b', multiplier: 1, reach: 1, er: 0.1 },
      { id: 'c', multiplier: 0.5, reach: 2, er: 0.2 },
    ]);
    expect(scores.get('a')).toBe(100);
    // b: multiplicador 0.5 (peso .5), alcance 0 (.3), ER 0 (.2) → 25.
    expect(scores.get('b')).toBe(25);
  });

  it('un solo post → 50', () => {
    expect(viralScores([{ id: 'a', multiplier: 3, reach: 1, er: 0.1 }]).get('a')).toBe(50);
  });

  it('pesos personalizados', () => {
    const scores = viralScores(
      [
        { id: 'a', multiplier: 10, reach: 0.1, er: 0.01 },
        { id: 'b', multiplier: 1, reach: 2, er: 0.1 },
      ],
      { multiplier: 1, reach: 0, er: 0 },
    );
    expect(scores.get('a')).toBe(100);
  });
});
