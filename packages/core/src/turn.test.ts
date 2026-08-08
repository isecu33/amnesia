import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import {
  activeId,
  forceDiscardTop,
  forceSlot,
  newGame,
  player,
  run,
  skipPeek,
  topValue,
  totalCards,
} from './test-helpers.js';

const start = () => skipPeek(newGame());

describe('turno: robar del mazo (docs/01 §4 Paso B)', () => {
  it('DREW es público y DREW_VALUE privado solo para el ladrón (E22)', () => {
    const s = start();
    const me = activeId(s);
    const { state, events } = run(s, { t: 'DRAW_DECK', p: me });
    expect(state.phase).toBe('TURN_RESOLVE');
    expect(state.drawn?.source).toBe('deck');
    const drew = events.find((e) => e.e === 'DREW');
    expect(drew).toMatchObject({ player: me, source: 'deck' });
    expect(drew && 'value' in drew).toBe(false);
    const priv = events.find((e) => e.e === 'DREW_VALUE');
    expect(priv).toMatchObject({ to: me });
    expect(totalCards(state)).toBe(52);
  });

  it('descartar la robada la deja arriba del descarte y pasa el turno', () => {
    let s = start();
    const me = activeId(s);
    forceDeckTopWithoutEffect(s);
    const drawn = run(s, { t: 'DRAW_DECK', p: me });
    s = drawn.state;
    const value = s.drawn?.card.value;
    const after = run(s, { t: 'DISCARD_DRAWN', p: me });
    expect(topValue(after.state)).toBe(value);
    expect(after.events.some((e) => e.e === 'DISCARDED_DRAWN')).toBe(true);
    expect(activeId(after.state)).not.toBe(me);
    expect(after.state.phase).toBe('TURN_DRAW');
  });

  it('sustituir mete la robada boca abajo y manda la vieja al descarte', () => {
    let s = start();
    const me = activeId(s);
    forceSlot(s, me, 2, 4);
    s = run(s, { t: 'DRAW_DECK', p: me }).state;
    const drawnValue = s.drawn?.card.value;
    const r = run(s, { t: 'SWAP_DRAWN', p: me, slot: 2 });
    expect(player(r.state, me).slots[2]?.value).toBe(drawnValue);
    expect(topValue(r.state)).toBe(4);
    expect(r.events.some((e) => e.e === 'SWAPPED_DRAWN' && e.discardedValue === 4)).toBe(true);
    expect(totalCards(r.state)).toBe(52);
  });

  it('rechaza jugar fuera de turno, en fase equivocada o sobre slot vacío', () => {
    const s = start();
    const me = activeId(s);
    const other = s.players.find((p) => p.id !== me)?.id as string;
    expect(apply(s, { t: 'DRAW_DECK', p: other })).toMatchObject({
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(apply(s, { t: 'DISCARD_DRAWN', p: me })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    expect(apply(s, { t: 'SWAP_DRAWN', p: me, slot: 0 })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    const drawn = run(s, { t: 'DRAW_DECK', p: me }).state;
    expect(apply(drawn, { t: 'SWAP_DRAWN', p: me, slot: 99 })).toMatchObject({
      error: { code: 'BAD_SLOT' },
    });
    expect(apply(drawn, { t: 'DRAW_DECK', p: me })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    expect(apply(s, { t: 'DRAW_DECK', p: 'Z' })).toMatchObject({
      error: { code: 'NO_SUCH_PLAYER' },
    });
  });
});

describe('turno: rotación y órbitas (docs/01 §4)', () => {
  it('la órbita sube cuando el turno vuelve a quien abrió la ronda', () => {
    let s = start();
    const starter = s.roundStarter;
    expect(s.orbit).toBe(1);
    for (let i = 0; i < s.players.length; i++) {
      s = run(s, { t: 'TIMER_FIRED', timer: 'turn' }).state;
    }
    expect(activeId(s)).toBe(starter);
    expect(s.orbit).toBe(2);
  });
});

describe('E1 · la carta inicial del descarte nunca activa efecto', () => {
  it('no hay efecto pendiente por mucho que la inicial tenga valor con efecto', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = newGame({}, ['A', 'B', 'C'], seed);
      expect(s.pendingEffect).toBeUndefined();
      expect(s.phase).toBe('INITIAL_PEEK');
    }
    // Y explícitamente con una carta de efecto arriba:
    const s = newGame();
    forceDiscardTop(s, 9);
    const started = skipPeek(s);
    expect(started.phase).toBe('TURN_DRAW');
    expect(started.pendingEffect).toBeUndefined();
  });
});

describe('E2 · la carta robada del descarte no puede devolverse al descarte', () => {
  it('DISCARD_DRAWN es ilegal tras DRAW_DISCARD; solo cabe sustituir', () => {
    const s = start();
    const me = activeId(s);
    const after = run(s, { t: 'DRAW_DISCARD', p: me });
    expect(after.state.drawn?.source).toBe('discard');
    expect(apply(after.state, { t: 'DISCARD_DRAWN', p: me })).toMatchObject({
      ok: false,
      error: { code: 'CANNOT_RETURN_TO_DISCARD' },
    });
    const types = legalActions(after.state, me).map((a) => a.t);
    expect(types).not.toContain('DISCARD_DRAWN');
    expect(types).toContain('SWAP_DRAWN');
  });

  it('DRAW_DISCARD es ilegal sin ningún slot propio ocupado', () => {
    const s = start();
    const me = activeId(s);
    const mut = structuredClone(s);
    const p = player(mut, me);
    for (let i = 0; i < p.slots.length; i++) {
      const c = p.slots[i];
      if (c) mut.deck.push(c);
      p.slots[i] = null;
    }
    expect(apply(mut, { t: 'DRAW_DISCARD', p: me })).toMatchObject({
      error: { code: 'NO_SLOT_TO_SWAP' },
    });
  });
});

describe('E15 · timeout de turno = robar del mazo y descartar SIN efecto', () => {
  it('resuelve el turno automáticamente y no abre targeting', () => {
    const s = start();
    const me = activeId(s);
    forceDeckTopWithEffect(s);
    const { state, events } = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    const discarded = events.find((e) => e.e === 'DISCARDED_DRAWN');
    expect(discarded).toBeDefined();
    if (discarded?.e === 'DISCARDED_DRAWN') {
      expect(discarded.player).toBe(me);
      expect(discarded.effect).toBeUndefined(); // el efecto NO se activa
    }
    expect(state.phase).toBe('TURN_DRAW');
    expect(state.pendingEffect).toBeUndefined();
    expect(activeId(state)).not.toBe(me);
  });

  it('con carta ya en mano descarta sin efecto (fuente mazo)', () => {
    let s = start();
    const me = activeId(s);
    forceDeckTopWithEffect(s);
    s = run(s, { t: 'DRAW_DECK', p: me }).state;
    const r = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(r.state.pendingEffect).toBeUndefined();
    expect(r.state.phase).toBe('TURN_DRAW');
  });

  it('con carta robada del descarte, el timeout sustituye en el primer slot ocupado', () => {
    let s = start();
    const me = activeId(s);
    s = run(s, { t: 'DRAW_DISCARD', p: me }).state;
    const r = run(s, { t: 'TIMER_FIRED', timer: 'turn' });
    expect(r.events.some((e) => e.e === 'SWAPPED_DRAWN' && e.slot === 0)).toBe(true);
    expect(totalCards(r.state)).toBe(52);
  });

  it('el timer de turno es ilegal en otras fases', () => {
    expect(apply(newGame(), { t: 'TIMER_FIRED', timer: 'turn' })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
    expect(apply(newGame(), { t: 'TIMER_FIRED', timer: 'zzz' as 'turn' })).toMatchObject({
      error: { code: 'UNKNOWN_TIMER' },
    });
  });
});

describe('E21 · los slots vaciados no se compactan jamás', () => {
  it('un hueco se queda donde está y los índices no se mueven', () => {
    const s = start();
    const me = activeId(s);
    forceSlot(s, me, 1, 5);
    forceSlot(s, me, 3, 9);
    forceDiscardTop(s, 5);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: me, slot: 1, tick: 1000 });
    const p = player(r.state, me);
    expect(p.slots).toHaveLength(4);
    expect(p.slots[1]).toBeNull();
    expect(p.slots[3]?.value).toBe(9); // el índice 3 sigue siendo el 3
  });
});

// --- helpers locales -------------------------------------------------------

/** Deja arriba del mazo (deck[last]) una carta sin efecto. */
function forceDeckTopWithoutEffect(s: ReturnType<typeof newGame>): void {
  const i = s.deck.findIndex((c) => c.value <= 6);
  const [card] = s.deck.splice(i, 1);
  if (card) s.deck.push(card);
}
/** Deja arriba del mazo una carta con efecto (un 9, Espionaje). */
function forceDeckTopWithEffect(s: ReturnType<typeof newGame>): void {
  const i = s.deck.findIndex((c) => c.value === 9);
  const [card] = s.deck.splice(i, 1);
  if (card) s.deck.push(card);
}
