/** #16 — Cadena con premio y carreras (E38–E39). */
import { describe, expect, it } from 'vitest';
import { score } from './score.js';
import {
  activeId,
  forceDiscardTop,
  forceSlot,
  newGame,
  player,
  run,
  skipPeek,
} from './test-helpers.js';
import type { CardValue, GameState } from './types.js';

const start = (ids = ['A', 'B', 'C']): GameState => skipPeek(newGame({}, ids));

/** El activo roba del mazo y sustituye su slot 0 (que vale `v`): `v` queda arriba, carrera nueva. */
function coverWith(s: GameState, v: CardValue): GameState {
  const me = activeId(s);
  forceSlot(s, me, 0, v);
  const d = run(s, { t: 'DRAW_DECK', p: me });
  return run(d.state, { t: 'SWAP_DRAWN', p: me, slot: 0 }).state;
}

const links = (events: ReturnType<typeof run>['events']) =>
  events.filter((e) => e.e === 'CHAIN_LINK');

describe('E38 · carreras y Cadena', () => {
  it('la carta inicial abre carrera: el acierto es eslabón 1, sin premio', () => {
    const s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(links(r.events)).toEqual([{ e: 'CHAIN_LINK', player: 'B', link: 1, bonus: 0 }]);
    expect(r.state.chain).toBe(1);
    expect(player(r.state, 'B').chainPoints).toBe(0);
  });

  it('acierto en la carrera siguiente = eslabón 2 con −1 al que acierta (por uno o varios)', () => {
    let s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    s = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    s = coverWith(s, 4);
    forceSlot(s, 'C', 1, 4);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'C', slot: 1, tick: s.tick + 600 });
    expect(links(r.events)).toEqual([{ e: 'CHAIN_LINK', player: 'C', link: 2, bonus: -1 }]);
    expect(player(r.state, 'C').chainPoints).toBe(-1);
    expect(r.state.chain).toBe(2);
  });

  it('una carrera sin acierto rompe la cadena al abrirse la siguiente', () => {
    let s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    s = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    s = coverWith(s, 4); // carrera 2: nadie acierta
    expect(s.chain).toBe(1);
    const cover = activeId(s);
    forceSlot(s, cover, 0, 5);
    const d = run(s, { t: 'DRAW_DECK', p: cover });
    const r = run(d.state, { t: 'SWAP_DRAWN', p: cover, slot: 0 });
    expect(r.events.find((e) => e.e === 'CHAIN_BROKEN')).toMatchObject({ links: 1 });
    expect(r.state.chain).toBe(0);
  });

  it('los fallos no rompen ni alargan la cadena', () => {
    let s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    s = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    s = coverWith(s, 4);
    forceSlot(s, 'C', 2, 9);
    const f = run(s, { t: 'MATCH_ATTEMPT', p: 'C', slot: 2, tick: s.tick + 600 });
    expect(f.events.some((e) => e.e === 'MATCH_FAIL')).toBe(true);
    expect(f.state.chain).toBe(1);
    expect(f.state.race.open).toBe(true);
    forceSlot(f.state, 'A', 3, 4);
    const ok = run(f.state, { t: 'MATCH_ATTEMPT', p: 'A', slot: 3, tick: f.state.tick + 700 });
    expect(links(ok.events)[0]).toMatchObject({ link: 2, bonus: -1 });
  });

  it('un rebarajado no abre carrera', () => {
    let s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    s = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    const me = activeId(s);
    s.discard.push(...s.deck.splice(0)); // mazo vacío → rebarajado al robar
    const d = run(s, { t: 'DRAW_DECK', p: me });
    expect(d.events.some((e) => e.e === 'DECK_RESHUFFLED')).toBe(true);
    expect(d.state.race).toEqual({ open: false, hit: true });
    expect(d.state.chain).toBe(1);
  });

  it('robar del descarte no abre carrera (la expuesta no es casable)', () => {
    const s = start();
    const me = activeId(s);
    forceDiscardTop(s, 6);
    forceSlot(s, 'B', 0, 6);
    const under = s.deck.pop();
    if (under) s.discard.unshift(under); // una carta bajo la superior
    const d = run(s, { t: 'DRAW_DISCARD', p: me });
    expect(d.state.race.open).toBe(false);
    const r = run(d.state, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: d.state.tick + 600 });
    expect(r.events[0]).toMatchObject({ e: 'MATCH_REJECTED', reason: 'tooLate' });
  });
});

describe('Cadena — puntuación', () => {
  it('el ajuste va aparte: no cuenta para el cantor de ÚLTIMA y no tiene suelo', () => {
    const s = start();
    player(s, 'B').chainPoints = -3;
    const sc = score(s);
    const sum = player(s, 'B').slots.reduce((a, x) => a + (x?.value ?? 0), 0);
    expect(sc.perPlayer['B']?.round).toBe(sum - 3);
    // cantor: la comparación usa base (sin cadena), el ajuste se suma después
    s.ultimaCaller = 'A';
    player(s, 'A').chainPoints = -2;
    const sc2 = score(s);
    const aSum = player(s, 'A').slots.reduce((a, x) => a + (x?.value ?? 0), 0);
    const aBase = aSum;
    const bBase = sum;
    const others = [bBase, player(s, 'C').slots.reduce((a, x) => a + (x?.value ?? 0), 0)];
    const win = others.every((v) => v > aBase);
    expect(sc2.perPlayer['A']?.round).toBe((win ? 0 : aBase + 10) - 2);
  });

  it('E39 · el acierto que vacía el altar en eslabón ≥2 acumula con el −5', () => {
    let s = start();
    forceSlot(s, 'B', 0, 6);
    forceDiscardTop(s, 6);
    s = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    s = coverWith(s, 4);
    const c = player(s, 'C');
    for (let i = 1; i < c.slots.length; i++) c.slots[i] = null;
    forceSlot(s, 'C', 0, 4);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'C', slot: 0, tick: s.tick + 600 });
    expect(r.state.emptyAltarWinner).toBe('C');
    expect(r.state.phase).toBe('ROUND_REVEAL');
    expect(score(r.state).perPlayer['C']?.round).toBe(-5 + -1);
  });
});
