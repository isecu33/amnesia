import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@totem/core';
import {
  FAST_FORWARD_THRESHOLD,
  MAX_COLLAPSE_CUES,
  MIN_SHOWN_MS,
  Presenter,
  URGENT_EVENTS,
  collapseCues,
} from './queue.js';
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

describe('P1 · ritmo de los efectos en la cola', () => {
  const fail = (): GameEvent => ({ e: 'MATCH_FAIL', player: 'B', slot: 0, value: 3, penalty: 'card' });
  const steal = (): GameEvent => ({ e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'SPY', deadlineTick: 1 });
  const reveal = (ttlMs = 3000): GameEvent => ({ e: 'PRIVATE_REVEAL', to: 'A', player: 'A', slot: 0, value: 4, ttlMs });

  it.each<GameEvent['e']>(['STEAL_WINDOW_OPENED', 'EFFECT_STOLEN', 'CHAIN_LINK', 'DOUBLE_DRAW_REJECTED'])(
    '%s es urgente',
    (k) => expect(URGENT_EVENTS).toContain(k),
  );

  it('la ventana de robo no espera tras un fallo de 3 s', () => {
    const { p, played } = harness();
    p.enqueue(fail());
    p.tick(0);
    p.enqueue(steal());
    p.tick(MIN_SHOWN_MS);
    expect(played.map((e) => e.e)).toEqual(['MATCH_FAIL', 'STEAL_WINDOW_OPENED']);
  });

  it('end() llega al acabar el beat, también cuando se recorta (vista privada en sincronía)', () => {
    const ended: { e: string; at: number }[] = [];
    let now = 0;
    const p = new Presenter({
      play: () => undefined,
      advance: () => undefined,
      fastForward: () => undefined,
      end: (e) => ended.push({ e: e.e, at: now }),
    });
    p.enqueue(reveal());
    p.tick(now);
    now = 100;
    p.enqueue({ e: 'DISCARDED_DRAWN', player: 'B', value: 4 });
    p.tick(now);
    expect(ended).toHaveLength(0);
    now = MIN_SHOWN_MS;
    p.tick(now);
    expect(ended[0]).toEqual({ e: 'PRIVATE_REVEAL', at: MIN_SHOWN_MS });
  });

  it('end() de una vista privada no recortada llega a los ttlMs exactos', () => {
    const ended: number[] = [];
    let now = 0;
    const p = new Presenter({
      play: () => undefined,
      advance: () => undefined,
      fastForward: () => undefined,
      end: () => ended.push(now),
    });
    p.enqueue(reveal(3000));
    p.tick(now);
    now = 2999;
    p.tick(now);
    expect(ended).toEqual([]);
    now = 3000;
    p.tick(now);
    expect(ended).toEqual([3000]);
  });

  it('al colapsar se conserva el sonido de los efectos (uno por sonido, máx. 3)', () => {
    const cues: GameEvent[] = [];
    const p = new Presenter({
      play: () => undefined,
      advance: () => undefined,
      fastForward: () => undefined,
      cue: (e) => cues.push(e),
    });
    for (let i = 0; i < FAST_FORWARD_THRESHOLD; i++) p.enqueue(matchOk());
    p.enqueue(steal());
    p.enqueue({ e: 'CHAIN_BROKEN', links: 2 });
    p.enqueue({ e: 'CHAIN_BROKEN', links: 1 });
    p.tick(0);
    expect(cues.map((e) => e.e)).toEqual(['STEAL_WINDOW_OPENED', 'CHAIN_BROKEN']);
  });

  it('collapseCues respeta el tope y el orden de llegada', () => {
    const evs: GameEvent[] = [
      steal(),
      { e: 'EFFECT_SKIPPED', player: 'A', reason: 'timeout' },
      { e: 'OMEN_CHANGED', omen: 'CALM' },
      { e: 'CHAIN_BROKEN', links: 2 },
      drew(),
    ];
    const out = collapseCues(evs);
    expect(out).toHaveLength(MAX_COLLAPSE_CUES);
    expect(out.map((c) => c.e.e)).toEqual(['EFFECT_SKIPPED', 'OMEN_CHANGED', 'CHAIN_BROKEN']);
  });

  it('una vista privada colapsada se vuelve a mostrar entera sin re-avanzar la vista', () => {
    const { p, played, advanced } = harness();
    for (let i = 0; i < FAST_FORWARD_THRESHOLD; i++) p.enqueue(matchOk());
    p.enqueue(reveal());
    p.tick(0);
    expect(played.map((e) => e.e)).toEqual(['PRIVATE_REVEAL']);
    expect(advanced).toHaveLength(FAST_FORWARD_THRESHOLD + 1);
  });

  it('con selfId, el actor no oye dos veces el sonido de su vista privada', () => {
    const peek: GameEvent = {
      e: 'EFFECT_RESOLVED',
      player: 'A',
      effect: 'PEEK',
      publicInfo: { slots: [{ player: 'A', slot: 0 }] },
    };
    expect(beatFor(peek, { selfId: 'A' }).sfx).toBeUndefined();
    expect(beatFor(peek, { selfId: 'B' }).sfx).toBe('peek');
    expect(beatFor(peek, { selfId: 'A' }).vfx).toBe('peekMark');
  });
});
