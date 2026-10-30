/** #4 — Reglas de sala opcionales: Kamikaze (E40) y Salvaje (E41, E14). */
import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import { viewFor, applyEventToView } from './view.js';
import {
  forceDiscardTop,
  forceSlot,
  newGame,
  player,
  run,
  skipPeek,
  totalCards,
} from './test-helpers.js';
import type { GameState } from './types.js';

/** Fin de ronda con puntuaciones forzadas: A anota `roundA` y los demás nada. */
function scoreWith(s: GameState, prevTotal: number, roundA: number) {
  player(s, 'A').totalScore = prevTotal;
  for (const p of s.players) {
    for (let i = 0; i < p.slots.length; i++) p.slots[i] = null;
  }
  // A conserva tótems por valor `roundA` repartidos en el slot 0 (≤ 13) y 1
  const a = player(s, 'A');
  const rest = roundA > 13 ? roundA - 13 : 0;
  forceSlot(s, 'A', 0, (roundA - rest) as 0);
  if (rest) forceSlot(s, 'A', 1, rest as 0);
  s.phase = 'ROUND_REVEAL';
  s.timers = [{ kind: 'reveal', deadlineTick: s.tick }];
  void a;
  return run(s, { t: 'TIMER_FIRED', timer: 'reveal' });
}

describe('E40 · Kamikaze: total exactamente 100 → 50', () => {
  it('vuelve a 50 y la partida sigue', () => {
    const s = skipPeek(newGame({ kamikazeRule: true }));
    const r = scoreWith(s, 90, 10);
    expect(r.events.find((e) => e.e === 'ROUND_SCORED')).toMatchObject({
      kamikaze: ['A'],
      scores: { A: { round: 10, total: 50 } },
    });
    expect(player(r.state, 'A').totalScore).toBe(50);
    expect(r.state.phase).toBe('ROUND_END');
  });

  it('sin la regla, 100 termina la partida', () => {
    const s = skipPeek(newGame());
    const r = scoreWith(s, 90, 10);
    expect(r.state.phase).toBe('GAME_END');
  });

  it('pasarse de 100 no se perdona', () => {
    const s = skipPeek(newGame({ kamikazeRule: true }));
    const r = scoreWith(s, 95, 10);
    expect(r.state.phase).toBe('GAME_END');
  });

  it('en Ronda rápida no aplica', () => {
    const s = skipPeek(newGame({ kamikazeRule: true, mode: 'quick' }));
    const r = scoreWith(s, 90, 10);
    expect(r.events.find((e) => e.e === 'ROUND_SCORED')).not.toHaveProperty('kamikaze');
    expect(r.state.phase).toBe('GAME_END');
  });

  it('respeta un umbral distinto (gameEndScore) y un reset configurable', () => {
    const s = skipPeek(newGame({ kamikazeRule: true, gameEndScore: 60, kamikazeResetScore: 20 }));
    const r = scoreWith(s, 50, 10);
    expect(player(r.state, 'A').totalScore).toBe(20);
  });
});

const wild = () => skipPeek(newGame({ wildModeEnabled: true }));

describe('E41 · Modo Salvaje: Descarte Rápido sobre el tótem de otro', () => {
  it('desactivado: se rechaza el intento sobre un rival y no se ofrece', () => {
    const s = skipPeek(newGame());
    expect(apply(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 0, tick: 500, owner: 'B' })).toMatchObject({
      error: { code: 'WILD_DISABLED' },
    });
    expect(legalActions(s, 'A').some((a) => a.t === 'MATCH_ATTEMPT' && a.owner !== undefined)).toBe(
      false,
    );
  });

  it('acierto: el tótem del rival va al descarte y se le regala uno propio a ciegas', () => {
    const s = wild();
    forceSlot(s, 'B', 1, 6);
    forceSlot(s, 'A', 2, 9);
    forceDiscardTop(s, 6);
    const mine = player(s, 'A').slots[2]?.value;
    const r = run(s, {
      t: 'MATCH_ATTEMPT',
      p: 'A',
      slot: 1,
      tick: 500,
      owner: 'B',
      giveSlot: 2,
    });
    expect(r.events.find((e) => e.e === 'MATCH_OK')).toMatchObject({
      player: 'A',
      owner: 'B',
      slot: 1,
      value: 6,
    });
    expect(r.events.find((e) => e.e === 'WILD_GIFT')).toMatchObject({
      from: 'A',
      fromSlot: 2,
      to: 'B',
      toSlot: 1,
    });
    expect(player(r.state, 'A').slots[2]).toBeNull();
    expect(player(r.state, 'B').slots[1]?.value).toBe(mine);
    expect(totalCards(r.state)).toBe(52);
    // la vista plegada coincide con la real
    const folded = r.events.reduce((v, e) => applyEventToView(v, e), viewFor(s, 'A'));
    expect(folded.you.slots[2]).toBe('empty');
    expect(folded.others.find((o) => o.id === 'B')?.slots[1]).toBe('hidden');
  });

  it('regalo por defecto: el primer slot propio ocupado', () => {
    const s = wild();
    forceSlot(s, 'B', 1, 6);
    forceDiscardTop(s, 6);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B' });
    expect(r.events.find((e) => e.e === 'WILD_GIFT')).toMatchObject({ fromSlot: 0 });
  });

  it('fallo: castigo doble al intentador y todos ven el tótem del rival', () => {
    const s = wild();
    forceSlot(s, 'B', 1, 9);
    forceDiscardTop(s, 6);
    const before = player(s, 'A').slots.filter(Boolean).length;
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B' });
    expect(r.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({
      player: 'A',
      owner: 'B',
      value: 9,
      penalty: 'card',
    });
    expect(r.events.filter((e) => e.e === 'PENALTY_CARD')).toHaveLength(2);
    expect(player(r.state, 'A').slots.filter(Boolean)).toHaveLength(before + 2);
    expect(player(r.state, 'B').slots[1]?.value).toBe(9); // vuelve boca abajo
  });

  it('E14 · fallo con mano llena: +10 puntos', () => {
    const s = wild();
    forceSlot(s, 'B', 1, 9);
    forceDiscardTop(s, 6);
    const a = player(s, 'A');
    while (a.slots.length < 8) a.slots.push(s.deck.pop() ?? null);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B' });
    expect(r.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ penalty: 'points' });
    expect(player(r.state, 'A').penaltyPoints).toBe(10);
  });

  it('un rival sellado no se puede atacar; un slot vacío o de regalo inválido, tampoco', () => {
    const s = wild();
    forceDiscardTop(s, 6);
    forceSlot(s, 'B', 1, 6);
    const sealed = structuredClone(s);
    player(sealed, 'B').sealed = true;
    expect(
      apply(sealed, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B' }),
    ).toMatchObject({ error: { code: 'TARGET_SEALED' } });
    expect(
      apply(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B', giveSlot: 99 }),
    ).toMatchObject({ error: { code: 'BAD_GIVE_SLOT' } });
    expect(apply(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'Z' })).toMatchObject({
      error: { code: 'NO_SUCH_PLAYER' },
    });
  });

  it('regalar el último tótem propio vacía el altar y gana la ronda (E6)', () => {
    const s = wild();
    forceSlot(s, 'B', 1, 6);
    forceDiscardTop(s, 6);
    const a = player(s, 'A');
    for (let i = 1; i < a.slots.length; i++) a.slots[i] = null;
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'A', slot: 1, tick: 500, owner: 'B' });
    expect(r.state.emptyAltarWinner).toBe('A');
    expect(r.state.phase).toBe('ROUND_REVEAL');
  });

  it('se ofrece en legalActions con owner', () => {
    const s = wild();
    expect(legalActions(s, 'A').some((a) => a.t === 'MATCH_ATTEMPT' && a.owner === 'B')).toBe(true);
  });
});
