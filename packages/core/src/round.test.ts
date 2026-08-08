import { describe, expect, it } from 'vitest';
import { apply, setController } from './engine.js';
import { legalActions } from './legal.js';
import { score } from './score.js';
import { activeId, forceSlot, newGame, player, run, skipPeek, totalCards } from './test-helpers.js';
import type { GameState } from './types.js';

const start = (ids?: string[], overrides = {}) => skipPeek(newGame(overrides, ids));

/** Avanza turnos por timeout hasta llegar a la órbita indicada. */
function toOrbit(s: GameState, orbit: number): GameState {
  let cur = s;
  let guard = 0;
  while (cur.orbit < orbit && guard++ < 100) {
    cur = run(cur, { t: 'TIMER_FIRED', timer: 'turn' }).state;
  }
  return cur;
}

describe('E19 · cantar ÚLTIMA en la órbita 1 es ilegal', () => {
  it('el servidor lo rechaza y no aparece entre las acciones legales', () => {
    const s = start();
    expect(s.orbit).toBe(1);
    const me = activeId(s);
    expect(apply(s, { t: 'CALL_ULTIMA', p: me })).toMatchObject({
      ok: false,
      error: { code: 'ULTIMA_TOO_EARLY' },
    });
    expect(legalActions(s, me).map((a) => a.t)).not.toContain('CALL_ULTIMA');
  });

  it('en la órbita 2 sí es legal', () => {
    const s = toOrbit(start(), 2);
    const me = activeId(s);
    expect(legalActions(s, me).map((a) => a.t)).toContain('CALL_ULTIMA');
  });
});

describe('ÚLTIMA (docs/01 §7.1)', () => {
  it('sella al cantor, da exactamente 1 turno a cada rival y luego revela', () => {
    let s = toOrbit(start(), 2);
    const caller = activeId(s);
    const r = run(s, { t: 'CALL_ULTIMA', p: caller });
    s = r.state;
    expect(r.events.some((e) => e.e === 'ULTIMA_CALLED' && e.player === caller)).toBe(true);
    expect(player(s, caller).sealed).toBe(true);
    expect(s.ultimaCaller).toBe(caller);
    expect(s.turnsLeftAfterUltima).toBe(2);
    expect(activeId(s)).not.toBe(caller);

    s = run(s, { t: 'TIMER_FIRED', timer: 'turn' }).state;
    expect(s.phase).toBe('TURN_DRAW');
    expect(s.turnsLeftAfterUltima).toBe(1);
    const last = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(last.state.phase).toBe('ROUND_REVEAL');
    expect(last.events.some((e) => e.e === 'ROUND_REVEAL')).toBe(true);
  });

  it('el cantor no vuelve a jugar ni puede cantar dos veces', () => {
    let s = toOrbit(start(), 2);
    const caller = activeId(s);
    s = run(s, { t: 'CALL_ULTIMA', p: caller }).state;
    expect(apply(s, { t: 'DRAW_DECK', p: caller })).toMatchObject({
      error: { code: 'NOT_YOUR_TURN' },
    });
    const other = activeId(s);
    expect(apply(s, { t: 'CALL_ULTIMA', p: other })).toMatchObject({
      error: { code: 'ULTIMA_ALREADY_CALLED' },
    });
    expect(legalActions(s, caller)).toEqual([]);
  });

  it('WRONG_PHASE si se canta fuera de TURN_DRAW', () => {
    let s = toOrbit(start(), 2);
    const me = activeId(s);
    s = run(s, { t: 'DRAW_DECK', p: me }).state;
    expect(apply(s, { t: 'CALL_ULTIMA', p: me })).toMatchObject({ error: { code: 'WRONG_PHASE' } });
  });
});

describe('E17 · con 2 jugadores todas las reglas aplican sin cambios', () => {
  it('ÚLTIMA da 1 turno al rival y la ronda termina', () => {
    let s = toOrbit(start(['A', 'B']), 2);
    const caller = activeId(s);
    s = run(s, { t: 'CALL_ULTIMA', p: caller }).state;
    expect(s.turnsLeftAfterUltima).toBe(1);
    const r = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(r.state.phase).toBe('ROUND_REVEAL');
  });
});

describe('E3 · agotamiento del mazo', () => {
  it('la 1ª vez rebaraja el descarte salvo la superior', () => {
    const s = start();
    const mut = structuredClone(s);
    const me = activeId(mut);
    // Todo el mazo al descarte.
    mut.discard.push(...mut.deck.splice(0, mut.deck.length));
    const discardBefore = mut.discard.length;
    const r = run(mut, { t: 'DRAW_DECK', p: me });
    const resh = r.events.find((e) => e.e === 'DECK_RESHUFFLED');
    expect(resh).toBeDefined();
    if (resh?.e === 'DECK_RESHUFFLED') expect(resh.deckCount).toBe(discardBefore - 1);
    expect(r.state.reshuffles).toBe(1);
    expect(r.state.discard).toHaveLength(1);
    expect(totalCards(r.state)).toBe(52);
  });

  it('la 2ª vez la ronda termina automáticamente', () => {
    const s = start();
    const mut = structuredClone(s);
    const me = activeId(mut);
    mut.discard.push(...mut.deck.splice(0, mut.deck.length));
    mut.reshuffles = 1;
    const r = run(mut, { t: 'DRAW_DECK', p: me });
    expect(r.state.phase).toBe('ROUND_REVEAL');
  });

  it('con mazo vacío y descarte de 1 carta, robar del mazo es ilegal', () => {
    const s = start();
    const mut = structuredClone(s);
    const me = activeId(mut);
    const extra = mut.deck.splice(0, mut.deck.length);
    mut.discard.push(...extra.slice(0, 0)); // el descarte se queda con 1 sola carta
    mut.deck = [];
    expect(mut.discard).toHaveLength(1);
    expect(apply(mut, { t: 'DRAW_DECK', p: me })).toMatchObject({ error: { code: 'DECK_EMPTY' } });
    // pero robar del descarte sigue siendo legal
    expect(legalActions(mut, me).map((a) => a.t)).toContain('DRAW_DISCARD');
  });

  it('si el jugador activo no tiene ninguna acción posible, la ronda termina', () => {
    const s = start();
    const mut = structuredClone(s);
    const me = activeId(mut);
    mut.deck = [];
    mut.discard = [];
    expect(me).toBeTruthy();
    // Forzamos el recálculo entrando en un turno nuevo: sin mazo ni descarte y en
    // órbita 1 nadie puede robar ni cantar.
    const r = run(mut, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(['ROUND_REVEAL', 'ROUND_END']).toContain(r.state.phase);
  });
});

describe('puntuación (docs/01 §8)', () => {
  function revealWith(setup: (s: GameState) => void, overrides = {}) {
    let s = toOrbit(start(['A', 'B', 'C'], overrides), 2);
    const mut = structuredClone(s);
    setup(mut);
    s = mut;
    return s;
  }

  it('cada jugador suma el valor de sus tótems restantes', () => {
    const s = revealWith((st) => {
      forceSlot(st, 'A', 0, 1);
      forceSlot(st, 'A', 1, 2);
      forceSlot(st, 'A', 2, 3);
      forceSlot(st, 'A', 3, 4);
    });
    expect(score(s).perPlayer['A']?.totemSum).toBe(10);
  });

  it('el cantor con la suma estrictamente más baja anota 0', () => {
    const s = revealWith((st) => {
      st.ultimaCaller = 'A';
      player(st, 'A').sealed = true;
      for (let i = 0; i < 4; i++) forceSlot(st, 'A', i, 0);
      for (let i = 0; i < 4; i++) forceSlot(st, 'B', i, 5);
      for (let i = 0; i < 4; i++) forceSlot(st, 'C', i, 5);
    });
    const r = score(s);
    expect(r.ultimaSuccess).toBe(true);
    expect(r.perPlayer['A']?.round).toBe(0);
    expect(r.perPlayer['B']?.round).toBe(20);
  });

  it('el cantor que empata o pierde anota su suma +10', () => {
    const s = revealWith((st) => {
      st.ultimaCaller = 'A';
      for (let i = 0; i < 4; i++) forceSlot(st, 'A', i, 1);
      for (let i = 0; i < 4; i++) forceSlot(st, 'B', i, 1);
      for (let i = 0; i < 4; i++) forceSlot(st, 'C', i, 9);
    });
    const r = score(s);
    expect(r.ultimaSuccess).toBe(false);
    expect(r.perPlayer['A']?.round).toBe(4 + 10);
  });

  it('los puntos de castigo (E13) cuentan en la puntuación de ronda', () => {
    const s = revealWith((st) => {
      for (let i = 0; i < 4; i++) forceSlot(st, 'B', i, 1);
      player(st, 'B').penaltyPoints = 5;
    });
    expect(score(s).perPlayer['B']?.round).toBe(9);
  });

  it('el ganador por altar vacío anota el bonus (−5)', () => {
    const s = revealWith((st) => {
      st.emptyAltarWinner = 'C';
      const c = player(st, 'C');
      c.slots = c.slots.map(() => null);
    });
    expect(score(s).perPlayer['C']?.round).toBe(-5);
  });
});

describe('fin de ronda y de partida (docs/01 §8)', () => {
  it('modo rápido: una ronda y GAME_ENDED con el total más bajo', () => {
    let s = toOrbit(start(['A', 'B'], { mode: 'quick' }), 2);
    const mut = structuredClone(s);
    for (let i = 0; i < 4; i++) forceSlot(mut, 'A', i, 0);
    for (let i = 0; i < 4; i++) forceSlot(mut, 'B', i, 9);
    s = run(mut, { t: 'CALL_ULTIMA', p: activeId(mut) }).state;
    let guard = 0;
    while (s.phase !== 'ROUND_REVEAL' && guard++ < 10) {
      s = run(s, { t: 'TIMER_FIRED', timer: 'turn' }).state;
    }
    const r = run(s, { t: 'TIMER_FIRED', timer: 'reveal' });
    expect(r.state.phase).toBe('GAME_END');
    const ended = r.events.find((e) => e.e === 'GAME_ENDED');
    expect(ended).toMatchObject({ winner: 'A' });
  });

  it('modo clásico: si nadie llega a gameEndScore se pasa a ROUND_END y START_ROUND reparte de nuevo', () => {
    let s = toOrbit(start(['A', 'B', 'C']), 2);
    s = run(s, { t: 'CALL_ULTIMA', p: activeId(s) }).state;
    let guard = 0;
    while (s.phase !== 'ROUND_REVEAL' && guard++ < 10) {
      s = run(s, { t: 'TIMER_FIRED', timer: 'turn' }).state;
    }
    const scored = run(s, { t: 'TIMER_FIRED', timer: 'reveal' });
    expect(scored.state.phase).toBe('ROUND_END');
    expect(scored.events.some((e) => e.e === 'ROUND_SCORED')).toBe(true);

    const next = run(scored.state, { t: 'START_ROUND' });
    expect(next.state.phase).toBe('INITIAL_PEEK');
    expect(next.state.round).toBe(2);
    expect(next.state.orbit).toBe(1);
    expect(next.events.some((e) => e.e === 'ROUND_STARTED')).toBe(true);
    expect(totalCards(next.state)).toBe(52);
    // Empieza quien menos puntuó en la ronda anterior.
    const min = Math.min(...scored.state.players.map((p) => p.roundScore));
    const tied = scored.state.players.filter((p) => p.roundScore === min).map((p) => p.id);
    expect(tied).toContain(next.state.roundStarter);
  });

  it('la partida termina cuando alguien supera gameEndScore', () => {
    const s = toOrbit(start(['A', 'B'], { gameEndScore: 50 }), 2);
    const mut = structuredClone(s);
    player(mut, 'B').totalScore = 49;
    for (let i = 0; i < 4; i++) forceSlot(mut, 'B', i, 9);
    for (let i = 0; i < 4; i++) forceSlot(mut, 'A', i, 0);
    mut.phase = 'ROUND_REVEAL';
    const r = run(mut, { t: 'TIMER_FIRED', timer: 'reveal' });
    expect(r.state.phase).toBe('GAME_END');
    expect(r.state.winner).toBe('A');
  });

  it('I7 · GAME_END es absorbente: ninguna acción lo modifica', () => {
    const s = start();
    const ended = structuredClone(s);
    ended.phase = 'GAME_END';
    for (const a of [
      { t: 'DRAW_DECK', p: 'A' },
      { t: 'START_ROUND' },
      { t: 'TIMER_FIRED', timer: 'turn' },
      { t: 'MATCH_ATTEMPT', p: 'A', slot: 0, tick: 1 },
    ] as const) {
      expect(apply(ended, a)).toMatchObject({ ok: false, error: { code: 'GAME_OVER' } });
    }
    expect(legalActions(ended, 'A')).toEqual([]);
  });

  it('START_ROUND fuera de ROUND_END es ilegal', () => {
    expect(apply(start(), { t: 'START_ROUND' })).toMatchObject({ error: { code: 'WRONG_PHASE' } });
  });

  it('el timer de revelación solo vale en ROUND_REVEAL', () => {
    expect(apply(start(), { t: 'TIMER_FIRED', timer: 'reveal' })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
  });
});

describe('E16/E18 · abandono y reconexión de asientos', () => {
  it('FORFEIT pone un bot en el asiento y emite PLAYER_SEAT', () => {
    const s = start();
    const r = run(s, { t: 'FORFEIT', p: 'B' });
    expect(player(r.state, 'B').controller).toBe('bot');
    expect(r.events).toContainEqual({ e: 'PLAYER_SEAT', player: 'B', controller: 'bot' });
    expect(apply(r.state, { t: 'FORFEIT', p: 'B' })).toMatchObject({
      error: { code: 'ALREADY_BOT' },
    });
    expect(apply(s, { t: 'FORFEIT', p: 'Z' })).toMatchObject({ error: { code: 'NO_SUCH_PLAYER' } });
  });

  it('setController devuelve el asiento al humano al reconectar', () => {
    const s = run(start(), { t: 'FORFEIT', p: 'B' }).state;
    const back = setController(s, 'B', 'human');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(player(back.state, 'B').controller).toBe('human');
    expect(back.events).toContainEqual({ e: 'PLAYER_SEAT', player: 'B', controller: 'human' });
    expect(setController(s, 'Z', 'human')).toMatchObject({ ok: false });
  });
});
