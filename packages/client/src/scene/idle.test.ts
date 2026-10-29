/** D-045 · reposo: parpadeo con RNG inyectado y mirada al jugador activo o al mazo. */
import { describe, expect, it } from 'vitest';
import {
  BLINK_CLOSE_MS,
  BLINK_MAX_MS,
  BLINK_MIN_MS,
  BlinkTimer,
  gazeFor,
  gazeSubject,
  nextBlinkDelay,
} from './idle.js';

/** RNG que devuelve la secuencia dada en bucle. */
const seq = (...v: number[]) => {
  let i = 0;
  return (): number => v[i++ % v.length]!;
};

/** Avanza en pasos de 16 ms y devuelve el instante (ms) del primer cierre > 0. */
function firstBlinkAt(t: BlinkTimer, limitMs = 10_000): number {
  for (let ms = 0; ms < limitMs; ms += 16) if (t.step(16) > 0) return ms;
  return Infinity;
}

describe('parpadeo', () => {
  it('el retardo cae siempre entre 3 y 6 s', () => {
    expect(nextBlinkDelay(() => 0)).toBe(BLINK_MIN_MS);
    expect(nextBlinkDelay(() => 1)).toBe(BLINK_MAX_MS);
    expect(nextBlinkDelay(() => 0.5)).toBe(4500);
  });

  it('no parpadea antes del retardo y parpadea justo después', () => {
    const t = new BlinkTimer(() => 0); // 3000 ms
    expect(t.step(2990)).toBe(0);
    expect(t.step(20)).toBeGreaterThan(0);
  });

  it('cada personaje tiene su propio tiempo (RNG distinto → instante distinto)', () => {
    const a = firstBlinkAt(new BlinkTimer(() => 0.1));
    const b = firstBlinkAt(new BlinkTimer(() => 0.9));
    expect(a).toBeLessThan(b);
    expect(a).toBeGreaterThanOrEqual(BLINK_MIN_MS);
    expect(b).toBeLessThanOrEqual(BLINK_MAX_MS + 16);
  });

  it('el párpado baja y sube en ~120 ms y vuelve a abrirse del todo', () => {
    const t = new BlinkTimer(() => 0);
    t.step(BLINK_MIN_MS); // dispara
    const samples: number[] = [];
    for (let ms = 0; ms < BLINK_CLOSE_MS + 40; ms += 10) samples.push(t.step(10));
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(samples.every((v) => v >= 0)).toBe(true);
    expect(samples[samples.length - 1]).toBe(0);
    const closedMs = samples.filter((v) => v > 0).length * 10;
    expect(closedMs).toBeLessThanOrEqual(BLINK_CLOSE_MS + 10);
  });

  it('tras parpadear espera otro retardo aleatorio', () => {
    const t = new BlinkTimer(seq(0, 1)); // 3000 ms y luego 6000 ms
    t.step(BLINK_MIN_MS);
    for (let i = 0; i < 20; i++) t.step(10); // termina el parpadeo y sortea 6000
    expect(t.step(5900)).toBe(0);
    expect(t.step(200)).toBeGreaterThan(0);
  });

  it('con «reducir movimiento» nunca cierra el párpado', () => {
    const t = new BlinkTimer(() => 0);
    for (let ms = 0; ms < 20_000; ms += 16) expect(t.step(16, false)).toBe(0);
  });
});

describe('mirada', () => {
  const seatOf = new Map([
    ['me', 0],
    ['ana', 1],
    ['bea', 2],
  ]);

  it('durante un turno miran al jugador activo; si eres tú, a la cámara', () => {
    expect(gazeSubject({ phase: 'TURN_DRAW', activePlayer: 'ana', seatOf })).toEqual({
      kind: 'seat',
      seat: 1,
    });
    expect(gazeSubject({ phase: 'TURN_RESOLVE', activePlayer: 'me', seatOf })).toEqual({
      kind: 'camera',
    });
  });

  it('fuera de un turno, o con un activo desconocido, miran al mazo', () => {
    expect(gazeSubject({ phase: 'ROUND_REVEAL', activePlayer: 'ana', seatOf })).toEqual({
      kind: 'deck',
    });
    expect(gazeSubject({ phase: 'TURN_DRAW', activePlayer: 'zoe', seatOf })).toEqual({
      kind: 'deck',
    });
    expect(gazeSubject({ phase: 'TURN_DRAW', activePlayer: undefined, seatOf })).toEqual({
      kind: 'deck',
    });
  });

  it('el jugador activo no se mira a sí mismo: mira al mazo', () => {
    const s = gazeSubject({ phase: 'TURN_DRAW', activePlayer: 'ana', seatOf });
    expect(gazeFor(s, 1)).toEqual({ kind: 'deck' });
    expect(gazeFor(s, 2)).toEqual(s);
    expect(gazeFor({ kind: 'camera' }, 1)).toEqual({ kind: 'camera' });
  });
});
