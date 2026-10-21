import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@totem/core';
import { FAST_FORWARD_THRESHOLD, MIN_SHOWN_MS, Presenter } from './queue.js';
import { DURATIONS, beatFor } from './timelines.js';

const drew = (player = 'A'): GameEvent => ({ e: 'DREW', player, source: 'deck' });
const matchOk = (): GameEvent => ({ e: 'MATCH_OK', player: 'A', slot: 0, value: 3 });

function harness() {
  const played: GameEvent[] = [];
  const advanced: GameEvent[] = [];
  const ff = vi.fn();
  const p = new Presenter({
    play: (e) => played.push(e),
    advance: (e) => advanced.push(e),
    fastForward: ff,
  });
  return { p, played, advanced, ff };
}

describe('cola de animación (docs/02 §5.2)', () => {
  it('reproduce los eventos de uno en uno respetando la duración', () => {
    const { p, played, advanced } = harness();
    p.enqueue(drew());
    p.enqueue(matchOk());

    p.tick(0);
    expect(played).toHaveLength(1);
    expect(advanced).toHaveLength(1); // la vista avanza al EMPEZAR

    p.tick(100); // aún dentro de los 600 ms del robo
    expect(played).toHaveLength(1);
    expect(p.isPlaying).toBe(true);

    p.tick(DURATIONS.draw);
    expect(played).toHaveLength(2);
    expect(played[1]?.e).toBe('MATCH_OK');
  });

  it('los eventos de duración 0 no bloquean la cola', () => {
    const { p, played } = harness();
    p.enqueue({ e: 'DREW_VALUE', to: 'A', value: 5 });
    p.enqueue({ e: 'EFFECT_RESOLVED', player: 'A', effect: 'PEEK', publicInfo: { slots: [] } });
    p.enqueue(drew());
    p.tick(0);
    expect(played).toHaveLength(3);
    expect(p.pending).toBe(0);
  });

  it('el drama se ve entero aunque el servidor vaya por delante', () => {
    const { p, played } = harness();
    for (let i = 0; i < 4; i++) p.enqueue(matchOk());
    p.tick(0);
    expect(played).toHaveLength(1);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      t += DURATIONS.matchOk;
      p.tick(t);
    }
    expect(played).toHaveLength(4);
  });

  it(`por encima de ${FAST_FORWARD_THRESHOLD} eventos colapsa a fast-forward`, () => {
    const { p, played, advanced, ff } = harness();
    for (let i = 0; i < FAST_FORWARD_THRESHOLD + 1; i++) p.enqueue(matchOk());
    p.tick(0);
    expect(ff).toHaveBeenCalledTimes(1);
    expect(played).toHaveLength(0);
    expect(advanced).toHaveLength(FAST_FORWARD_THRESHOLD + 1); // el estado no se pierde
    expect(p.pending).toBe(0);
  });

  it('clear vacía la cola sin animar', () => {
    const { p, played } = harness();
    p.enqueue(matchOk());
    p.clear();
    p.tick(0);
    expect(played).toHaveLength(0);
  });
});

describe('tabla de feedback (docs/01 §11)', () => {
  it('cada acción de la tabla tiene animación y sonido con su duración', () => {
    const cases: [GameEvent, number, string][] = [
      [{ e: 'DREW', player: 'A', source: 'deck' }, 600, 'draw'],
      [{ e: 'DISCARDED_DRAWN', player: 'A', value: 3 }, 500, 'discard'],
      [{ e: 'SWAPPED_DRAWN', player: 'A', slot: 0, discardedValue: 3 }, 800, 'swap'],
      [{ e: 'PRIVATE_REVEAL', to: 'A', player: 'A', slot: 0, value: 3, ttlMs: 3000 }, 3000, 'peek'],
      [{ e: 'PRIVATE_REVEAL', to: 'A', player: 'B', slot: 0, value: 3, ttlMs: 3000 }, 3000, 'spy'],
      [
        { e: 'EFFECT_RESOLVED', player: 'A', effect: 'SWAP', publicInfo: { slots: [] } },
        1200,
        'blindSwap',
      ],
      [{ e: 'MATCH_OK', player: 'A', slot: 0, value: 3 }, 700, 'matchOk'],
      [{ e: 'MATCH_FAIL', player: 'A', slot: 0, value: 3, penalty: 'card' }, 3000, 'matchFail'],
      [{ e: 'ULTIMA_CALLED', player: 'A' }, 1500, 'ultima'],
      [{ e: 'ROUND_REVEAL', hands: {} }, 4000, 'reveal'],
    ];
    for (const [e, ms, sfx] of cases) {
      const b = beatFor(e);
      expect(b.durationMs, e.e).toBe(ms);
      expect(b.sfx, e.e).toBe(sfx);
      expect(b.vfx, e.e).toBeTruthy();
    }
  });

  it('el vislumbre dura exactamente el ttl que manda el servidor', () => {
    const b = beatFor({
      e: 'PRIVATE_REVEAL',
      to: 'A',
      player: 'A',
      slot: 1,
      value: 7,
      ttlMs: 4500,
    });
    expect(b.durationMs).toBe(4500);
  });
});

describe('D-042 · las animaciones largas nunca retrasan el Descarte Rápido', () => {
  const reveal = (): GameEvent => ({
    e: 'PRIVATE_REVEAL',
    to: 'A',
    player: 'A',
    slot: 0,
    value: 4,
    ttlMs: 3000,
  });
  const discarded = (): GameEvent => ({ e: 'DISCARDED_DRAWN', player: 'B', value: 4 });

  it('un descarte en cola recorta la vista privada en cuanto se ha visto un poco', () => {
    const { p, played } = harness();
    p.enqueue(reveal());
    p.tick(0);
    p.enqueue(discarded());
    p.tick(100);
    expect(played).toHaveLength(1); // aún se ve la vista privada
    p.tick(MIN_SHOWN_MS);
    expect(played).toHaveLength(2);
    expect(played[1]?.e).toBe('DISCARDED_DRAWN');
  });

  it('los beats cortos no se recortan', () => {
    const { p, played } = harness();
    p.enqueue(drew());
    p.tick(0);
    p.enqueue(discarded());
    p.tick(MIN_SHOWN_MS);
    expect(played).toHaveLength(1);
  });
});
