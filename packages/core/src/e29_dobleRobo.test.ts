/** #13 — Doble Robo (8): efecto diferido (E29–E32). */
import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import { viewFor } from './view.js';
import {
  activeId,
  forceSlot,
  newGame,
  player,
  run,
  skipPeek,
  totalCards,
  withDrawnValue,
} from './test-helpers.js';
import type { GameState } from './types.js';

/** Turno del jugador activo con el Doble Robo ya pendiente. */
function armed(): { s: GameState; me: string } {
  const s = skipPeek(newGame());
  const me = activeId(s);
  player(s, me).doubleDrawPending = true;
  return { s, me };
}

describe('Doble Robo — creación (diferido)', () => {
  it('descartar un 8 no abre fase de efecto: deja el marcador y pasa el turno', () => {
    const { s, me } = withDrawnValue(8);
    const r = run(s, { t: 'DISCARD_DRAWN', p: me });
    expect(r.events.find((e) => e.e === 'DOUBLE_DRAW_PENDING')).toMatchObject({ player: me });
    expect(r.events.some((e) => e.e === 'EFFECT_PENDING')).toBe(false);
    expect(player(r.state, me).doubleDrawPending).toBe(true);
    expect(r.state.phase).toBe('TURN_DRAW');
    expect(activeId(r.state)).not.toBe(me);
    expect(viewFor(r.state, me).you.doubleDraw).toBe(true);
    expect(viewFor(r.state, 'B').others.find((o) => o.id === me)?.doubleDraw ?? true).toBe(true);
  });

  it('E30: no es acumulable — un segundo 8 con uno pendiente no da dos', () => {
    const { s, me } = withDrawnValue(8);
    player(s, me).doubleDrawPending = true;
    const r = run(s, { t: 'DISCARD_DRAWN', p: me });
    expect(r.events.some((e) => e.e === 'DOUBLE_DRAW_PENDING')).toBe(false);
    expect(player(r.state, me).doubleDrawPending).toBe(true);
  });
});

describe('Doble Robo — cobro en el siguiente turno', () => {
  it('roba 2, se queda 1 en secreto; la otra va al descarte sin activar efecto (E32)', () => {
    const { s, me } = armed();
    // top del mazo: un 9 (con efecto) y un 3
    const nine = s.deck.findIndex((c) => c.value === 9);
    const three = s.deck.findIndex((c) => c.value === 3 && c !== s.deck[nine]);
    const [c9] = s.deck.splice(nine, 1);
    const t = s.deck.findIndex((c) => c.value === 3);
    const [c3] = s.deck.splice(t, 1);
    void three;
    s.deck.push(c3!, c9!); // pop() => 9 primero, luego 3
    const r = run(s, { t: 'DRAW_DECK', p: me });
    expect(r.state.drawnChoice?.map((c) => c.value)).toEqual([9, 3]);
    expect(r.events.find((e) => e.e === 'DOUBLE_DREW_VALUES')).toMatchObject({
      to: me,
      values: [9, 3],
    });
    expect(r.events.find((e) => e.e === 'DOUBLE_DRAW_CLEARED')).toMatchObject({ reason: 'used' });
    expect(r.state.phase).toBe('TURN_RESOLVE');
    expect(totalCards(r.state)).toBe(52);
    expect(legalActions(r.state, me).map((a) => a.t)).toEqual(
      expect.arrayContaining(['DOUBLE_DRAW_KEEP']),
    );
    expect(legalActions(r.state, me).map((a) => a.t)).not.toContain('DISCARD_DRAWN');

    // se queda con el 3 y rechaza el 9 (que tiene efecto): no se activa
    const k = run(r.state, { t: 'DOUBLE_DRAW_KEEP', p: me, index: 1 });
    expect(k.state.drawn?.card.value).toBe(3);
    expect(k.state.discard[k.state.discard.length - 1]?.value).toBe(9);
    expect(k.state.phase).toBe('TURN_RESOLVE');
    expect(k.state.pendingEffect).toBeUndefined();
    expect(k.events.find((e) => e.e === 'DOUBLE_DRAW_REJECTED')).toMatchObject({ value: 9 });
    expect(k.events.find((e) => e.e === 'DREW_VALUE')).toMatchObject({ to: me, value: 3 });
    // con ella sigue el turno normal (C2)
    const done = run(k.state, { t: 'SWAP_DRAWN', p: me, slot: 0 });
    expect(done.state.phase).toBe('TURN_DRAW');
    expect(totalCards(done.state)).toBe(52);
  });

  it('solo el ladrón ve las dos cartas en la vista (I2)', () => {
    const { s, me } = armed();
    const r = run(s, { t: 'DRAW_DECK', p: me });
    expect(viewFor(r.state, me).drawnChoice).toHaveLength(2);
    const other = r.state.players.find((p) => p.id !== me)?.id as string;
    const v = viewFor(r.state, other);
    expect(v.drawnChoice).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/"c\d\d"/);
  });

  it('Pasar = robo normal de 1', () => {
    const { s, me } = armed();
    expect(legalActions(s, me).map((a) => a.t)).toContain('EFFECT_SKIP');
    const p = run(s, { t: 'EFFECT_SKIP', p: me });
    expect(p.events[0]).toMatchObject({ e: 'DOUBLE_DRAW_CLEARED', reason: 'passed' });
    expect(p.state.phase).toBe('TURN_DRAW');
    const d = run(p.state, { t: 'DRAW_DECK', p: me });
    expect(d.state.drawn).toBeDefined();
    expect(d.state.drawnChoice).toBeUndefined();
  });

  it('índice de elección inválido se rechaza', () => {
    const { s, me } = armed();
    const r = run(s, { t: 'DRAW_DECK', p: me });
    expect(apply(r.state, { t: 'DOUBLE_DRAW_KEEP', p: me, index: 2 })).toMatchObject({
      error: { code: 'BAD_INDEX' },
    });
    expect(apply(s, { t: 'DOUBLE_DRAW_KEEP', p: me, index: 0 }).ok).toBe(false);
  });
});

describe('E29 · el Doble Robo se pierde', () => {
  it('al robar del descarte', () => {
    const { s, me } = armed();
    const r = run(s, { t: 'DRAW_DISCARD', p: me });
    expect(r.events.find((e) => e.e === 'DOUBLE_DRAW_CLEARED')).toMatchObject({ reason: 'lost' });
    expect(player(r.state, me).doubleDrawPending).toBe(false);
  });

  it('al cantar ¡ÚLTIMA!', () => {
    const { s, me } = armed();
    s.orbit = 2;
    const r = run(s, { t: 'CALL_ULTIMA', p: me });
    expect(r.events.some((e) => e.e === 'DOUBLE_DRAW_CLEARED' && e.reason === 'lost')).toBe(true);
  });

  it('al expirar el reloj de turno (E15)', () => {
    const { s, me } = armed();
    const r = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(r.events.some((e) => e.e === 'DOUBLE_DRAW_CLEARED' && e.reason === 'lost')).toBe(true);
    expect(player(r.state, me).doubleDrawPending).toBe(false);
  });

  it('al expirar el reloj con las dos cartas sin elegir: ambas al descarte sin efecto', () => {
    const { s, me } = armed();
    const d = run(s, { t: 'DRAW_DECK', p: me });
    const r = run(d.state, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(r.state.drawnChoice).toBeUndefined();
    expect(r.state.pendingEffect).toBeUndefined();
    expect(totalCards(r.state)).toBe(52);
    expect(activeId(r.state)).not.toBe(me);
  });

  it('al terminar la ronda antes de cobrarlo', () => {
    const { s, me } = armed();
    const mut = structuredClone(s);
    // 2º agotamiento del mazo: vaciar mazo con reshuffles ya hecho
    mut.deck = [];
    mut.reshuffles = 1;
    const r = run(mut, { t: 'DRAW_DECK', p: me });
    expect(r.state.phase).toBe('ROUND_REVEAL');
    const next = run(r.state, { t: 'TIMER_FIRED', timer: 'reveal' });
    if (next.state.phase === 'ROUND_END') {
      const again = run(next.state, { t: 'START_ROUND' });
      expect(again.state.players.every((p) => !p.doubleDrawPending)).toBe(true);
    }
  });
});

describe('E31 · Doble Robo con mazo corto', () => {
  it('con 1 sola carta en el mazo solo se ve esa (sin elección)', () => {
    const { s, me } = armed();
    s.discard.push(...s.deck.splice(1)); // deja 1 carta en el mazo
    const r = run(s, { t: 'DRAW_DECK', p: me });
    expect(r.state.drawnChoice).toBeUndefined();
    expect(r.state.drawn).toBeDefined();
    expect(r.events.some((e) => e.e === 'DOUBLE_DRAW_CLEARED' && e.reason === 'used')).toBe(true);
  });

  it('con el mazo vacío primero se rebaraja (E3) y luego se roban 2', () => {
    const { s, me } = armed();
    s.discard.push(...s.deck.splice(0));
    const r = run(s, { t: 'DRAW_DECK', p: me });
    expect(r.events.some((e) => e.e === 'DECK_RESHUFFLED')).toBe(true);
    expect(r.state.drawnChoice).toHaveLength(2);
    expect(totalCards(r.state)).toBe(52);
  });
});

describe('Doble Robo — la rechazada es matchable (carrera normal)', () => {
  it('un jugador puede casar sobre la carta rechazada', () => {
    const { s, me } = armed();
    const rival = s.players.find((p) => p.id !== me)?.id as string;
    const top = s.deck[s.deck.length - 1]?.value as 0;
    forceSlot(s, rival, 0, s.deck[s.deck.length - 2]?.value as 0);
    const d = run(s, { t: 'DRAW_DECK', p: me });
    const second = d.state.drawnChoice?.[1]?.value;
    void top;
    const k = run(d.state, { t: 'DOUBLE_DRAW_KEEP', p: me, index: 0 });
    forceSlot(k.state, rival, 1, second as 0);
    const m = run(k.state, { t: 'MATCH_ATTEMPT', p: rival, slot: 1, tick: k.state.tick + 500 });
    expect(m.events[0]).toMatchObject({ e: 'MATCH_OK', player: rival, value: second });
  });
});
