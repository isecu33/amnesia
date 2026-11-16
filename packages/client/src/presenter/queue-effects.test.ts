/** P1 · ritmo de los efectos en la cola: urgencias, fin de beat y colapso. */
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@totem/core';
import {
  FAST_FORWARD_THRESHOLD,
  MAX_COLLAPSE_CUES,
  MIN_SHOWN_MS,
  Presenter,
  URGENT_EVENTS,
  collapseCues,
  type Hooks,
} from './queue.js';
import { beatFor } from './timelines.js';

const matchOk = (): GameEvent => ({ e: 'MATCH_OK', player: 'A', slot: 0, value: 3 });
const fail = (): GameEvent => ({
  e: 'MATCH_FAIL',
  player: 'B',
  slot: 0,
  value: 3,
  penalty: 'card',
});
const steal = (): GameEvent => ({
  e: 'STEAL_WINDOW_OPENED',
  owner: 'A',
  effect: 'SPY',
  deadlineTick: 1,
});
const reveal = (ttlMs = 3000): GameEvent => ({
  e: 'PRIVATE_REVEAL',
  to: 'A',
  player: 'A',
  slot: 0,
  value: 4,
  ttlMs,
});

function harness(extra: Partial<Hooks> = {}) {
  const played: GameEvent[] = [];
  const advanced: GameEvent[] = [];
  const p = new Presenter({
    play: (e) => played.push(e),
    advance: (e) => advanced.push(e),
    fastForward: vi.fn(),
    ...extra,
  });
  return { p, played, advanced };
}

describe('P1 · ritmo de los efectos en la cola', () => {
  it.each<GameEvent['e']>([
    'STEAL_WINDOW_OPENED',
    'EFFECT_STOLEN',
    'CHAIN_LINK',
    'DOUBLE_DRAW_REJECTED',
  ])('%s es urgente', (k) => expect(URGENT_EVENTS).toContain(k));

  it('la ventana de robo no espera tras un fallo de 3 s', () => {
    const { p, played } = harness();
    p.enqueue(fail());
    p.tick(0);
    p.enqueue(steal());
    p.tick(MIN_SHOWN_MS);
    expect(played.map((e) => e.e)).toEqual(['MATCH_FAIL', 'STEAL_WINDOW_OPENED']);
  });

  it('end() llega cuando se recorta la vista privada (store.reveal en sincronía)', () => {
    const ended: [string, number][] = [];
    let now = 0;
    const { p } = harness({ end: (e) => ended.push([e.e, now]) });
    p.enqueue(reveal());
    p.tick(now);
    now = 100;
    p.enqueue({ e: 'DISCARDED_DRAWN', player: 'B', value: 4 });
    p.tick(now);
    expect(ended).toEqual([]);
    now = MIN_SHOWN_MS;
    p.tick(now);
    expect(ended[0]).toEqual(['PRIVATE_REVEAL', MIN_SHOWN_MS]);
  });

  it('end() de una vista privada sin recortar llega a los ttlMs exactos', () => {
    const ended: number[] = [];
    let now = 0;
    const { p } = harness({ end: () => ended.push(now) });
    p.enqueue(reveal(3000));
    p.tick(now);
    now = 2999;
    p.tick(now);
    expect(ended).toEqual([]);
    now = 3000;
    p.tick(now);
    expect(ended).toEqual([3000]);
  });

  it('clear() también cierra el beat en curso', () => {
    const end = vi.fn();
    const { p } = harness({ end });
    p.enqueue(reveal());
    p.tick(0);
    p.clear();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('al colapsar se conserva el sonido de los efectos (uno por sonido)', () => {
    const cues: GameEvent[] = [];
    const { p } = harness({ cue: (e) => cues.push(e) });
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
      { e: 'DREW', player: 'A', source: 'deck' },
    ];
    const out = collapseCues(evs);
    expect(out).toHaveLength(MAX_COLLAPSE_CUES);
    expect(out.map((c) => c.e.e)).toEqual(['EFFECT_SKIPPED', 'OMEN_CHANGED', 'CHAIN_BROKEN']);
  });

  it('una vista privada colapsada se vuelve a mostrar sin re-avanzar la vista', () => {
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
    const played: string[] = [];
    const p = new Presenter(
      {
        play: (_e, b) => played.push(b.sfx ?? '-'),
        advance: () => undefined,
        fastForward: () => undefined,
      },
      { selfId: 'A' },
    );
    p.enqueue(peek);
    p.tick(0);
    expect(played).toEqual(['-']);
  });
});
