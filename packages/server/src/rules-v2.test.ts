/** Reglas v2 en la sala y en los bots (#4, #13–#16). */
import { describe, expect, it } from 'vitest';
import type { Action, GameEvent, PlayerView } from '@totem/core';
import { FakeClock } from './clock.js';
import { GreedyBot } from './bots.js';
import { replay } from './replay.js';
import { GameSession, type Sink } from './session.js';

function botRoom(seed: number, cfg: Parameters<GameSession['configure']>[0], bots = 3) {
  const events: GameEvent[] = [];
  const sink: Sink = {
    send: () => {},
    broadcast: (type, payload) => {
      if (type === 'ev') events.push((payload as { e: GameEvent }).e);
    },
  };
  const clock = new FakeClock();
  let n = seed;
  const rand = (): number => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
  const session = new GameSession({ code: 'ABCDE', clock, sink, seed, rand });
  for (let i = 0; i < bots; i++) session.addBot(i % 2 === 0 ? 'greedy' : 'random');
  session.configure(cfg);
  return { session, clock, events };
}

describe('opciones de sala v2', () => {
  it('la config llega a core: Salvaje, Kamikaze, presagios y ventana de robo', () => {
    const { session } = botRoom(1, {
      wildModeEnabled: true,
      kamikazeRule: true,
      omensEnabled: true,
      stealWindowMs: 2000,
    });
    expect(session.start()).toBeUndefined();
    const c = session.gameState?.config;
    expect(c).toMatchObject({
      wildModeEnabled: true,
      kamikazeRule: true,
      omensEnabled: true,
      stealWindowMs: 2000,
    });
    session.dispose();
  });

  it('timeScale ×1,5 escala la ventana de robo y los relojes de los presagios', () => {
    const { session } = botRoom(2, { timeScale: 1.5, omensEnabled: true });
    session.start();
    const c = session.gameState?.config;
    expect(c?.stealWindowMs).toBe(2250);
    expect(c?.omens.find((o) => o.id === 'HASTE')?.turnSeconds).toBe(22.5);
    session.dispose();
  });

  it('timeScale ×2 no saca la ventana de robo de su rango válido', () => {
    const { session } = botRoom(3, { timeScale: 1.6, stealWindowMs: 2200 });
    expect(session.start()).toBeUndefined();
    expect(session.gameState?.config.stealWindowMs).toBe(2500);
    session.dispose();
  });

  it('partidas de bots con todas las reglas v2 terminan, usan los efectos nuevos y se reproducen', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const { session, clock, events } = botRoom(500 + i, {
        mode: 'quick',
        wildModeEnabled: true,
        omensEnabled: true,
        kamikazeRule: true,
      });
      expect(session.start()).toBeUndefined();
      for (let step = 0; step < 600 && session.gameState?.phase !== 'GAME_END'; step++) {
        clock.advance(1000);
      }
      expect(session.gameState?.phase, `partida ${i}`).toBe('GAME_END');
      for (const e of events) {
        seen.add(e.e);
        if (e.e === 'EFFECT_RESOLVED') seen.add(`effect:${e.effect}`);
      }
      const r = replay(session.toReplay());
      expect(r.mismatch).toBeUndefined();
      session.dispose();
    }
    expect(seen.has('STEAL_WINDOW_OPENED')).toBe(true);
    expect(seen.has('CHAIN_LINK')).toBe(true);
    expect([...seen].some((k) => k.startsWith('effect:'))).toBe(true);
  });
});

/** Vista mínima para decidir. */
const view = (over: Partial<PlayerView>): PlayerView => ({
  you: { id: 'B', slots: ['hidden', 'hidden', 'hidden', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [],
  deckCount: 20,
  phase: 'TURN_DRAW',
  activePlayer: 'B',
  orbit: 1,
  timers: [],
  scores: {},
  legal: [],
  tick: 0,
  ...over,
});

describe('GreedyBot con reglas v2', () => {
  it('Doble Robo: se queda con la carta más baja', () => {
    const bot = new GreedyBot('B');
    const legal: Action[] = [
      { t: 'DOUBLE_DRAW_KEEP', p: 'B', index: 0 },
      { t: 'DOUBLE_DRAW_KEEP', p: 'B', index: 1 },
    ];
    const a = bot.decide(view({ phase: 'TURN_RESOLVE', drawnChoice: [9, 2] }), legal);
    expect(a).toMatchObject({ t: 'DOUBLE_DRAW_KEEP', index: 1 });
    const b = bot.decide(view({ phase: 'TURN_RESOLVE', drawnChoice: [1, 2] }), legal);
    expect(b).toMatchObject({ index: 0 });
  });

  it('resuelve un efecto robado aunque no sea el jugador activo', () => {
    const bot = new GreedyBot('B');
    const legal: Action[] = [
      { t: 'EFFECT_SKIP', p: 'B' },
      { t: 'EFFECT_TARGET', p: 'B', target: { kind: 'PEEK', slot: 1 } },
    ];
    const a = bot.decide(view({ phase: 'EFFECT_TARGETING', activePlayer: 'A' }), legal);
    expect(a).toMatchObject({ t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: 1 } });
  });

  it('Ojo Compartido y Trueque Vidente miran primero lo que no recuerda', () => {
    const bot = new GreedyBot('B');
    bot.observe({ e: 'INITIAL_PEEK_RESULT', to: 'B', cards: [{ slot: 0, value: 3 }] });
    const legal: Action[] = [
      { t: 'EFFECT_SKIP', p: 'B' },
      {
        t: 'EFFECT_TARGET',
        p: 'B',
        target: { kind: 'SHARED_EYE', ownSlot: 0, player: 'A', theirSlot: 0 },
      },
      {
        t: 'EFFECT_TARGET',
        p: 'B',
        target: { kind: 'SHARED_EYE', ownSlot: 2, player: 'A', theirSlot: 0 },
      },
    ];
    const a = bot.decide(view({ phase: 'EFFECT_TARGETING' }), legal);
    expect(a).toMatchObject({ target: { kind: 'SHARED_EYE', ownSlot: 2 } });
  });

  it('solo truequea para deshacerse de un tótem malo que recuerda; si no, pasa', () => {
    const bot = new GreedyBot('B');
    const swap = (own: number): Action => ({
      t: 'EFFECT_TARGET',
      p: 'B',
      target: { kind: 'SWAP', ownSlot: own, player: 'A', theirSlot: 0 },
    });
    const skip: Action = { t: 'EFFECT_SKIP', p: 'B' };
    expect(bot.decide(view({ phase: 'EFFECT_TARGETING' }), [skip, swap(0)])).toMatchObject({
      t: 'EFFECT_SKIP',
    });
    bot.observe({ e: 'INITIAL_PEEK_RESULT', to: 'B', cards: [{ slot: 1, value: 12 }] });
    expect(bot.decide(view({ phase: 'EFFECT_TARGETING' }), [skip, swap(0), swap(1)])).toMatchObject(
      { target: { ownSlot: 1 } },
    );
  });

  it('no insiste con un Descarte Rápido tras un acierto (el tótem no es casable)', () => {
    const bot = new GreedyBot('B');
    bot.observe({ e: 'INITIAL_PEEK_RESULT', to: 'B', cards: [{ slot: 0, value: 5 }] });
    const legal: Action[] = [{ t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 0 }];
    const v = view({ discardTop: 5, activePlayer: 'A' });
    expect(bot.decide(v, legal)).toMatchObject({ t: 'MATCH_ATTEMPT' });
    bot.observe({ e: 'MATCH_OK', player: 'A', slot: 2, value: 5 });
    expect(bot.decide(v, legal)).toBeNull();
    bot.observe({ e: 'DISCARDED_DRAWN', player: 'A', value: 5 });
    expect(bot.decide(v, legal)).toMatchObject({ t: 'MATCH_ATTEMPT' });
  });

  it('no usa el Descarte Rápido Salvaje sobre tótems ajenos', () => {
    const bot = new GreedyBot('B');
    bot.observe({ e: 'INITIAL_PEEK_RESULT', to: 'B', cards: [{ slot: 0, value: 5 }] });
    const legal: Action[] = [{ t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 0, owner: 'A' }];
    expect(bot.decide(view({ discardTop: 5, activePlayer: 'A' }), legal)).toBeNull();
  });

  it('un Vislumbre propio no se olvida al publicarse EFFECT_RESOLVED', () => {
    const bot = new GreedyBot('B');
    bot.observe({ e: 'PRIVATE_REVEAL', to: 'B', player: 'B', slot: 3, value: 11, ttlMs: 3000 });
    bot.observe({
      e: 'EFFECT_RESOLVED',
      player: 'B',
      effect: 'PEEK',
      publicInfo: { slots: [{ player: 'B', slot: 3 }] },
    });
    const swap: Action = {
      t: 'EFFECT_TARGET',
      p: 'B',
      target: { kind: 'SWAP', ownSlot: 3, player: 'A', theirSlot: 0 },
    };
    expect(
      bot.decide(view({ phase: 'EFFECT_TARGETING' }), [{ t: 'EFFECT_SKIP', p: 'B' }, swap]),
    ).toMatchObject({
      target: { ownSlot: 3 },
    });
  });
});
