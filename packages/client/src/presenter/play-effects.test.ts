/** P1 · vista privada y efecto pendiente se aplican al REPRODUCIRSE, no al llegar. */
import { describe, expect, it } from 'vitest';
import type { EffectKind, GameEvent, PlayerView } from '@totem/core';
import {
  expireReveal,
  onEnded,
  onPlayed,
  revealsToReplay,
  type PlaySink,
  type RevealState,
} from './play-effects.js';

type Sink = PlaySink & { pending?: EffectKind };

function sink(playerId = 'A'): Sink {
  const s: Sink = {
    playerId,
    setReveal: (r: RevealState | undefined) => {
      s.reveal = r;
    },
    setPendingEffect: (k?: EffectKind) => {
      s.pending = k;
    },
  };
  return s;
}
const reveal: GameEvent = {
  e: 'PRIVATE_REVEAL',
  to: 'A',
  player: 'B',
  slot: 2,
  value: 9,
  ttlMs: 3000,
};

describe('play-effects', () => {
  it('la vista privada dura ttlMs desde que se reproduce', () => {
    const s = sink();
    onPlayed(reveal, s, 10_000);
    expect(s.reveal).toEqual({ player: 'B', slot: 2, value: 9, until: 13_000 });
    expect(onEnded(reveal, s, 13_000)).toBe(0);
    expect(s.reveal).toBeUndefined();
  });

  it('un beat recortado (D-042) no acorta la vista privada: pide apagarla al llegar a until', () => {
    const s = sink();
    onPlayed(reveal, s, 10_000);
    const r = s.reveal;
    expect(onEnded(reveal, s, 10_400)).toBe(2_600);
    expect(s.reveal).toBe(r);
    expireReveal(s, r);
    expect(s.reveal).toBeUndefined();
  });

  it('expireReveal no apaga una vista más nueva', () => {
    const s = sink();
    onPlayed(reveal, s, 0);
    const old = s.reveal;
    onPlayed({ ...reveal, slot: 3 } as GameEvent, s, 100);
    expireReveal(s, old);
    expect(s.reveal?.slot).toBe(3);
  });

  it('tras un colapso no se re-muestran vistas de casillas que cambiaron después', () => {
    const swapped: GameEvent = { e: 'SWAPPED_DRAWN', player: 'B', slot: 2, discardedValue: 5 };
    const other: GameEvent = { ...reveal, slot: 1 } as GameEvent;
    expect(revealsToReplay([reveal, other, swapped], 3)).toEqual([other]);
    expect(revealsToReplay([swapped, reveal], 3)).toEqual([reveal]);
  });

  it('no enseña vistas privadas ajenas', () => {
    const s = sink('Z');
    onPlayed(reveal, s, 0);
    expect(s.reveal).toBeUndefined();
  });

  it('end() de otra vista no apaga la que se está viendo (Ojo Compartido)', () => {
    const s = sink();
    const own: GameEvent = {
      e: 'PRIVATE_REVEAL',
      to: 'A',
      player: 'A',
      slot: 0,
      value: 4,
      ttlMs: 3000,
    };
    onPlayed(own, s, 0);
    onEnded(reveal, s, 0);
    expect(s.reveal?.slot).toBe(0);
  });

  it('efecto pendiente propio: se arma al reproducirse y se desarma al resolverse', () => {
    const s = sink();
    onPlayed({ e: 'EFFECT_PENDING', player: 'A', effect: 'SPY', deadlineTick: 1 }, s, 0);
    expect(s.pending).toBe('SPY');
    onPlayed({ e: 'EFFECT_RESOLVED', player: 'A', effect: 'SPY', publicInfo: { slots: [] } }, s, 0);
    expect(s.pending).toBeUndefined();
  });

  it('no se arma si la vista ya no permite elegir objetivo (lag)', () => {
    const s = sink();
    s.view = { legal: ['DRAW_DECK'] } as unknown as PlayerView;
    onPlayed({ e: 'EFFECT_PENDING', player: 'A', effect: 'SPY', deadlineTick: 1 }, s, 0);
    expect(s.pending).toBeUndefined();
  });
});
