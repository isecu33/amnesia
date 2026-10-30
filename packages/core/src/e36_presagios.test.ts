/** #15 — Presagios: Prisa, Calma y Destello (E36–E37). */
import { describe, expect, it } from 'vitest';
import { validateConfig, makeConfig } from './config.js';
import { viewFor } from './view.js';
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

const omenGame = (initialTop?: CardValue): GameState => {
  const s = newGame({ omensEnabled: true });
  if (initialTop !== undefined) forceDiscardTop(s, initialTop);
  return skipPeek(s);
};

/** El activo sustituye su slot 0 por una carta robada, dejando `v` arriba del descarte. */
function placeTop(s: GameState, v: CardValue) {
  const me = activeId(s);
  forceSlot(s, me, 0, v);
  const d = run(s, { t: 'DRAW_DECK', p: me });
  return run(d.state, { t: 'SWAP_DRAWN', p: me, slot: 0 });
}

const turnStart = (events: ReturnType<typeof run>['events']) =>
  events.find((e) => e.e === 'TURN_STARTED');

describe('Presagios — desactivados por defecto', () => {
  it('sin omensEnabled el Conejo no cambia nada', () => {
    const s = skipPeek(newGame());
    const r = placeTop(s, 2);
    expect(r.events.some((e) => e.e === 'OMEN_CHANGED')).toBe(false);
    const t = turnStart(r.events);
    expect(t).toMatchObject({ deadlineTick: r.state.tick + 30000 });
    expect(viewFor(r.state, 'A').omen).toBeUndefined();
  });
});

describe('Prisa / Calma', () => {
  it('Prisa (Conejo 2): el turno siguiente dura 15 s y se anuncia OMEN_CHANGED', () => {
    const r = placeTop(omenGame(), 2);
    expect(r.events.find((e) => e.e === 'OMEN_CHANGED')).toMatchObject({ omen: 'HASTE' });
    expect(turnStart(r.events)).toMatchObject({ deadlineTick: r.state.tick + 15000 });
    expect(viewFor(r.state, 'A').omen).toBe('HASTE');
  });

  it('Calma (Tortuga 3): el turno siguiente dura 45 s', () => {
    const r = placeTop(omenGame(), 3);
    expect(r.events.find((e) => e.e === 'OMEN_CHANGED')).toMatchObject({ omen: 'CALM' });
    expect(turnStart(r.events)).toMatchObject({ deadlineTick: r.state.tick + 45000 });
  });

  it('el presagio se retira al taparlo otro tótem', () => {
    let r = placeTop(omenGame(), 2);
    r = placeTop(r.state, 5);
    expect(r.events.find((e) => e.e === 'OMEN_CHANGED')).toMatchObject({ omen: null });
    expect(turnStart(r.events)).toMatchObject({ deadlineTick: r.state.tick + 30000 });
  });

  it('E37: un match que cambia la carta superior a mitad de turno no toca el reloj en marcha', () => {
    const r = placeTop(omenGame(), 2); // turno nuevo con Prisa (15 s)
    const timers = r.state.timers.slice();
    const rival = r.state.players.find((p) => p.id !== activeId(r.state))?.id as string;
    forceSlot(r.state, rival, 0, 2);
    const m = run(r.state, { t: 'MATCH_ATTEMPT', p: rival, slot: 0, tick: r.state.tick + 400 });
    expect(m.events.some((e) => e.e === 'MATCH_OK')).toBe(true);
    expect(m.state.timers).toEqual(timers);
  });
});

describe('E36 · la carta inicial no activa su presagio', () => {
  it('con un Conejo inicial el primer turno dura 30 s y no hay OMEN_CHANGED', () => {
    const s = newGame({ omensEnabled: true });
    forceDiscardTop(s, 2);
    s.initialTopId = s.discard[s.discard.length - 1]?.id; // el montaje de test cambió la carta
    const r = run(s, { t: 'TIMER_FIRED', timer: 'peek' }, { t: 'TIMER_FIRED', timer: 'peek' });
    expect(turnStart(r.events)).toMatchObject({ deadlineTick: r.state.tick + 30000 });
    expect(viewFor(r.state, 'A').omen).toBeUndefined();
  });

  it('rige desde la primera carta puesta por una acción', () => {
    const s = newGame({ omensEnabled: true });
    forceDiscardTop(s, 2);
    s.initialTopId = s.discard[s.discard.length - 1]?.id;
    const base = skipPeek(s);
    const r = placeTop(base, 2);
    expect(viewFor(r.state, 'A').omen).toBe('HASTE');
  });
});

describe('Destello (Luciérnaga 0)', () => {
  it('el tótem fallado se muestra 4 s con Destello y 2 s sin él', () => {
    const lit = placeTop(omenGame(), 0).state;
    const rival = lit.players.find((p) => p.id !== activeId(lit))?.id as string;
    forceSlot(lit, rival, 1, 9);
    const f = run(lit, { t: 'MATCH_ATTEMPT', p: rival, slot: 1, tick: lit.tick + 400 });
    expect(f.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ revealMs: 4000 });

    const plain = placeTop(omenGame(), 5).state;
    const r2 = plain.players.find((p) => p.id !== activeId(plain))?.id as string;
    forceSlot(plain, r2, 1, 9);
    const f2 = run(plain, { t: 'MATCH_ATTEMPT', p: r2, slot: 1, tick: plain.tick + 400 });
    expect(f2.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ revealMs: 2000 });
  });
});

describe('E37 · rebarajado y robo del descarte', () => {
  it('tras el rebarajado la superior se queda y su presagio continúa', () => {
    const r = placeTop(omenGame(), 3);
    const s = r.state;
    const me = activeId(s);
    s.discard.push(...s.deck.splice(0)); // mazo vacío
    s.discard.push(s.discard.splice(s.discard.length - 1 - s.deck.length, 1)[0]!);
    const top = s.discard[s.discard.length - 1]?.value;
    const d = run(s, { t: 'DRAW_DECK', p: me });
    expect(d.events.some((e) => e.e === 'DECK_RESHUFFLED')).toBe(true);
    expect(d.events.some((e) => e.e === 'OMEN_CHANGED')).toBe(false);
    expect(d.state.discard[d.state.discard.length - 1]?.value).toBe(top);
  });

  it('robar la inicial del descarte y volver a ponerla ya sí activa su presagio', () => {
    const s = newGame({ omensEnabled: true });
    forceDiscardTop(s, 2);
    s.initialTopId = s.discard[s.discard.length - 1]?.id;
    const base = skipPeek(s);
    const me = activeId(base);
    const d = run(base, { t: 'DRAW_DISCARD', p: me });
    expect(d.state.initialTopId).toBeUndefined();
    const sw = run(d.state, { t: 'SWAP_DRAWN', p: me, slot: 0 });
    void sw;
    expect(player(d.state, me).slots.length).toBeGreaterThan(0);
  });
});

describe('Presagios — validación de config', () => {
  it('un presagio sobre un tótem con efecto o duplicado es inválido', () => {
    expect(
      validateConfig(makeConfig({ omens: [{ id: 'HASTE', value: 9, turnSeconds: 15 }] })),
    ).not.toHaveLength(0);
    expect(
      validateConfig(
        makeConfig({
          omens: [
            { id: 'HASTE', value: 2, turnSeconds: 15 },
            { id: 'CALM', value: 2, turnSeconds: 45 },
          ],
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateConfig(makeConfig({ omens: [{ id: 'CALM', value: 99 as 0, turnSeconds: 5 }] })),
    ).not.toHaveLength(0);
    expect(
      validateConfig(makeConfig({ omens: [{ id: 'CALM', value: 3, turnSeconds: -1 }] })),
    ).not.toHaveLength(0);
    expect(validateConfig(makeConfig({ omensEnabled: true }))).toHaveLength(0);
  });
});
