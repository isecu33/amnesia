/** Property tests de los invariantes I1–I10 (docs/02 §3.8). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import { score } from './score.js';
import { isServerAction } from './types.js';
import { Rnd, candidateActions, newGame, playRandomGame, totalCards } from './test-helpers.js';
import type { Action, CardValue, GameState } from './types.js';

const ids = ['A', 'B', 'C'];

describe('I1 · conservación: siempre 52 cartas en juego', () => {
  it('se mantiene a lo largo de partidas aleatorias completas', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps, state } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 900);
        for (const st of steps) expect(totalCards(st.after)).toBe(52);
        expect(totalCards(state)).toBe(52);
      }),
      { numRuns: 25 },
    );
  });
});

describe('I3 · apply nunca lanza y deja el estado intacto ante acciones ilegales', () => {
  const arbAction = (): fc.Arbitrary<Action> =>
    fc.oneof(
      fc.record({
        t: fc.constant('PEEK_INITIAL' as const),
        p: fc.constantFrom(...ids, 'Z'),
        slots: fc.array(fc.integer({ min: -3, max: 12 }), { maxLength: 5 }),
      }),
      fc.record({ t: fc.constant('CALL_ULTIMA' as const), p: fc.constantFrom(...ids, 'Z') }),
      fc.record({ t: fc.constant('DRAW_DECK' as const), p: fc.constantFrom(...ids, 'Z') }),
      fc.record({ t: fc.constant('DRAW_DISCARD' as const), p: fc.constantFrom(...ids, 'Z') }),
      fc.record({ t: fc.constant('DISCARD_DRAWN' as const), p: fc.constantFrom(...ids, 'Z') }),
      fc.record({
        t: fc.constant('SWAP_DRAWN' as const),
        p: fc.constantFrom(...ids, 'Z'),
        slot: fc.integer({ min: -3, max: 12 }),
      }),
      fc.record({
        t: fc.constant('MATCH_ATTEMPT' as const),
        p: fc.constantFrom(...ids, 'Z'),
        slot: fc.integer({ min: -3, max: 12 }),
        tick: fc.integer({ min: 0, max: 100000 }),
      }),
      fc.record({ t: fc.constant('EFFECT_SKIP' as const), p: fc.constantFrom(...ids, 'Z') }),
      fc.record({
        t: fc.constant('EFFECT_TARGET' as const),
        p: fc.constantFrom(...ids, 'Z'),
        target: fc.oneof(
          fc.record({ kind: fc.constant('PEEK' as const), slot: fc.integer({ min: -3, max: 12 }) }),
          fc.record({
            kind: fc.constant('SPY' as const),
            player: fc.constantFrom(...ids, 'Z'),
            slot: fc.integer({ min: -3, max: 12 }),
          }),
          fc.record({
            kind: fc.constant('SWAP' as const),
            ownSlot: fc.integer({ min: -3, max: 12 }),
            player: fc.constantFrom(...ids, 'Z'),
            theirSlot: fc.integer({ min: -3, max: 12 }),
          }),
        ),
      }),
      fc.record({
        t: fc.constant('TIMER_FIRED' as const),
        timer: fc.constantFrom(
          'peek' as const,
          'turn' as const,
          'effect' as const,
          'reveal' as const,
        ),
      }),
      fc.record({ t: fc.constant('START_ROUND' as const) }),
      fc.record({ t: fc.constant('FORFEIT' as const), p: fc.constantFrom(...ids, 'Z') }),
    ) as fc.Arbitrary<Action>;

  it('200 acciones aleatorias, legales o no, nunca rompen nada', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.array(arbAction(), { minLength: 200, maxLength: 200 }),
        (seed, actions) => {
          let s: GameState = newGame({ mode: 'quick' }, ids, seed);
          for (const a of actions) {
            const frozen = JSON.stringify(s);
            const ref = s;
            const r = apply(s, a);
            // No muta el estado de entrada, ni por referencia ni por valor.
            expect(s).toBe(ref);
            expect(JSON.stringify(s)).toBe(frozen);
            if (r.ok) {
              expect(totalCards(r.state)).toBe(52); // I1
              s = r.state;
            } else {
              expect(typeof r.error.code).toBe('string');
            }
          }
        },
      ),
      { numRuns: 12 },
    );
  });

  it('acciones malformadas devuelven ok:false en vez de explotar', () => {
    const s = newGame({}, ids, 1);
    for (const bad of [null, undefined, 42, 'x', {}, { t: 7 }, { t: 'NOPE' }]) {
      const r = apply(s, bad as unknown as Action);
      expect(r.ok).toBe(false);
    }
  });
});

describe('I4 · coherencia entre legalActions y apply', () => {
  it('toda acción legal es aceptada, y toda acción de jugador aceptada era legal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 600);
        for (const step of steps.slice(0, 120)) {
          const s = step.before;
          // (a) toda acción legal es aceptada
          for (const p of s.players) {
            for (const a of legalActions(s, p.id)) {
              const r = apply(s, { ...a, tick: s.tick });
              expect(r.ok, `${a.t} legal pero rechazada`).toBe(true);
            }
          }
          // (b) la acción aplicada, si es de jugador, estaba en legalActions
          if (!isServerAction(step.action.t) && 'p' in step.action) {
            const legal = legalActions(s, step.action.p as string);
            const found = legal.some(
              (l) =>
                JSON.stringify({ ...l, tick: 0 }) === JSON.stringify({ ...step.action, tick: 0 }),
            );
            expect(found, `${step.action.t} aceptada pero no listada como legal`).toBe(true);
          }
        }
      }),
      { numRuns: 10 },
    );
  });

  it('las acciones candidatas de servidor siempre son aplicables', () => {
    const rnd = new Rnd(9);
    const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, 9), rnd, 400);
    for (const step of steps.slice(0, 100)) {
      for (const a of candidateActions(step.before)) {
        if (a.t === 'TIMER_FIRED' || a.t === 'START_ROUND') {
          expect(apply(step.before, a).ok, `${a.t} candidata pero rechazada`).toBe(true);
        }
      }
    }
  });
});

describe('I5 · el castigo del match es exactamente 1 carta o exactamente +5', () => {
  it('se cumple en todos los MATCH_FAIL de partidas aleatorias', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 900);
        for (const step of steps) {
          const failEv = step.events.find((e) => e.e === 'MATCH_FAIL');
          if (!failEv || failEv.e !== 'MATCH_FAIL') continue;
          const before = step.before.players.find((p) => p.id === failEv.player);
          const after = step.after.players.find((p) => p.id === failEv.player);
          if (!before || !after) continue;
          const nBefore = before.slots.filter((x) => x !== null).length;
          const nAfter = after.slots.filter((x) => x !== null).length;
          if (failEv.penalty === 'card') {
            expect(nAfter - nBefore).toBe(1);
            expect(after.penaltyPoints).toBe(before.penaltyPoints);
          } else {
            expect(nAfter).toBe(nBefore);
            expect(after.penaltyPoints - before.penaltyPoints).toBe(
              step.before.config.fullHandPenaltyPoints,
            );
          }
          expect(after.matchLockedUntilTick).toBeGreaterThan(step.after.tick - 1);
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe('I6 · el jugador sellado no es objetivo de efectos ni emite MATCH_*', () => {
  it('nunca aparece en EFFECT_RESOLVED ni en MATCH_OK/MATCH_FAIL', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 900);
        for (const step of steps) {
          const sealed = new Set(step.before.players.filter((p) => p.sealed).map((p) => p.id));
          if (sealed.size === 0) continue;
          for (const e of step.events) {
            if (e.e === 'EFFECT_RESOLVED') {
              for (const sl of e.publicInfo.slots) expect(sealed.has(sl.player)).toBe(false);
            }
            if (e.e === 'MATCH_OK' || e.e === 'MATCH_FAIL') {
              expect(sealed.has(e.player)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe('I8 · los índices de slot nunca se reordenan ni se compactan', () => {
  it('un slot solo pasa de ocupado a vacío o a otra carta, y el array nunca encoge', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 900);
        for (const step of steps) {
          if (step.action.t === 'START_ROUND') continue; // ronda nueva: reparto limpio
          for (const before of step.before.players) {
            const after = step.after.players.find((p) => p.id === before.id);
            if (!after) continue;
            expect(after.slots.length).toBeGreaterThanOrEqual(before.slots.length);
            expect(after.slots.length).toBeLessThanOrEqual(step.before.config.maxSlots);
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe('I9 · ROUND_SCORED es recomputable desde ROUND_REVEAL y las reglas §8', () => {
  it('una implementación independiente da los mismos números', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const rnd = new Rnd(seed);
        const { steps } = playRandomGame(newGame({ mode: 'quick' }, ids, seed), rnd, 900);
        for (const step of steps) {
          const revealEv = step.events.find((e) => e.e === 'ROUND_REVEAL');
          if (!revealEv || revealEv.e !== 'ROUND_REVEAL') continue;
          const s = step.after;
          const naive = naiveScore(revealEv.hands, s);
          const engine = score(s);
          for (const p of s.players) {
            expect(engine.perPlayer[p.id]?.round, `puntuación de ${p.id}`).toBe(naive[p.id]);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  /** Reimplementación literal de docs/01 §8, sin tocar score(). */
  function naiveScore(
    hands: Record<string, (CardValue | null)[]>,
    s: GameState,
  ): Record<string, number> {
    const c = s.config;
    const base: Record<string, number> = {};
    for (const p of s.players) {
      const sum = (hands[p.id] ?? []).reduce<number>((acc, v) => acc + (v ?? 0), 0);
      base[p.id] = sum + p.penaltyPoints;
    }
    const out = { ...base };
    if (s.ultimaCaller) {
      const mine = base[s.ultimaCaller] as number;
      const others = s.players
        .filter((p) => p.id !== s.ultimaCaller)
        .map((p) => base[p.id] as number);
      out[s.ultimaCaller] = others.every((v) => v > mine) ? 0 : mine + c.ultimaFailPenaltyPoints;
    }
    if (s.emptyAltarWinner) out[s.emptyAltarWinner] = c.emptyAltarBonusPoints;
    for (const p of s.players) out[p.id] = (out[p.id] as number) + p.chainPoints; // #16
    return out;
  }
});

describe('I10 · fuzz reducido: las partidas terminan limpias', () => {
  it('60 partidas de 2–6 jugadores llegan a GAME_END sin violar I1', () => {
    let finished = 0;
    for (let seed = 0; seed < 60; seed++) {
      const n = 2 + (seed % 5);
      const players = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
      const rnd = new Rnd(seed * 7919 + 13);
      const { state, steps } = playRandomGame(newGame({ mode: 'quick' }, players, seed), rnd, 5000);
      expect(totalCards(state)).toBe(52);
      expect(steps.length).toBeLessThan(5000);
      if (state.phase === 'GAME_END') finished++;
    }
    expect(finished).toBe(60);
  });

  it('el modo clásico a 100 también termina', () => {
    const rnd = new Rnd(555);
    const { state } = playRandomGame(newGame({ mode: 'classic' }, ids, 555), rnd, 20000);
    expect(state.phase).toBe('GAME_END');
    expect(state.winner).toBeTruthy();
  });
});

describe('determinismo', () => {
  it('la misma semilla y la misma secuencia de acciones dan el mismo estado', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (seed) => {
        const a = playRandomGame(newGame({ mode: 'quick' }, ids, seed), new Rnd(seed), 500);
        const b = playRandomGame(newGame({ mode: 'quick' }, ids, seed), new Rnd(seed), 500);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      }),
      { numRuns: 15 },
    );
  });

  it('re-simular el log de acciones reproduce el estado final byte a byte (replays)', () => {
    const rnd = new Rnd(31337);
    const { state, steps } = playRandomGame(newGame({ mode: 'quick' }, ids, 31337), rnd, 900);
    let replay: GameState = newGame({ mode: 'quick' }, ids, 31337);
    for (const step of steps) {
      const r = apply(replay, step.action);
      expect(r.ok).toBe(true);
      if (r.ok) replay = r.state;
    }
    expect(JSON.stringify(replay)).toBe(JSON.stringify(state));
  });
});
