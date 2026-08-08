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
import type { GameState } from './types.js';

const start = () => skipPeek(newGame());
const occupied = (s: GameState, id: string) => player(s, id).slots.filter((x) => x !== null).length;

describe('Descarte Rápido: acierto (docs/01 §6)', () => {
  it('el tótem sube al descarte, deja hueco y abre cadena', () => {
    const s = start();
    forceSlot(s, 'B', 2, 6);
    forceDiscardTop(s, 6);
    const before = occupied(s, 'B');
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 2, tick: 500 });
    expect(r.events.find((e) => e.e === 'MATCH_OK')).toMatchObject({
      player: 'B',
      slot: 2,
      value: 6,
    });
    expect(player(r.state, 'B').slots[2]).toBeNull(); // E21
    expect(occupied(r.state, 'B')).toBe(before - 1);
    expect(topValue(r.state)).toBe(6);
    expect(r.state.firstMatchAttemptTick).toBe(500); // ancla de arbitraje viva (E5)
    expect(totalCards(r.state)).toBe(52);
  });

  it('las cadenas son posibles: dos matches seguidos válidos', () => {
    const s = start();
    forceSlot(s, 'B', 0, 6);
    forceSlot(s, 'C', 1, 6);
    forceDiscardTop(s, 6);
    const r1 = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    // Pasada la ventana de arbitraje, la nueva superior (otro 6) es encadenable.
    const r2 = run(r1.state, { t: 'MATCH_ATTEMPT', p: 'C', slot: 1, tick: 1400 });
    expect(r2.events.some((e) => e.e === 'MATCH_OK' && e.player === 'C')).toBe(true);
    expect(player(r2.state, 'C').slots[1]).toBeNull();
  });

  it('funciona también fuera de tu turno', () => {
    const s = start();
    const me = activeId(s);
    const other = s.players.find((p) => p.id !== me)?.id as string;
    forceSlot(s, other, 0, 3);
    forceDiscardTop(s, 3);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: other, slot: 0, tick: 900 });
    expect(r.events.some((e) => e.e === 'MATCH_OK')).toBe(true);
    expect(activeId(r.state)).toBe(me); // el turno no cambia
  });
});

describe('Descarte Rápido: fallo y castigo (docs/01 §6)', () => {
  it('MATCH_FAIL revela el valor, da carta de castigo en el primer hueco y bloquea 5 s', () => {
    const s = start();
    forceSlot(s, 'B', 1, 2);
    forceDiscardTop(s, 9);
    const before = occupied(s, 'B');
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 1, tick: 2000 });
    const failEv = r.events.find((e) => e.e === 'MATCH_FAIL');
    expect(failEv).toMatchObject({ player: 'B', slot: 1, value: 2, penalty: 'card' });
    // I5: la mano crece exactamente en 1
    expect(occupied(r.state, 'B')).toBe(before + 1);
    expect(r.events.some((e) => e.e === 'PENALTY_CARD' && e.slot === 4)).toBe(true);
    expect(player(r.state, 'B').slots[1]?.value).toBe(2); // vuelve boca abajo a su slot
    expect(player(r.state, 'B').matchLockedUntilTick).toBe(2000 + 5000);
    expect(totalCards(r.state)).toBe(52);
  });

  it('el evento PENALTY_CARD no lleva valor (I2)', () => {
    const s = start();
    forceSlot(s, 'B', 1, 2);
    forceDiscardTop(s, 9);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 1, tick: 2000 });
    const pc = r.events.find((e) => e.e === 'PENALTY_CARD');
    expect(JSON.stringify(pc)).not.toContain('value');
  });

  it('durante el bloqueo los intentos se rechazan sin castigo', () => {
    const s = start();
    forceSlot(s, 'B', 1, 2);
    forceDiscardTop(s, 9);
    const failed = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 1, tick: 2000 }).state;
    const handAfterFail = occupied(failed, 'B');
    const r = run(failed, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 4000 });
    expect(r.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'locked' });
    expect(occupied(r.state, 'B')).toBe(handAfterFail); // sin castigo adicional
    expect(legalActions(failed, 'B').map((a) => a.t)).not.toContain('MATCH_ATTEMPT');
  });
});

describe('E5 · arbitraje de simultaneidad (300 ms)', () => {
  it('dos intentos en la misma ventana: 1 se procesa y el otro se cancela sin castigo', () => {
    const s = start();
    forceSlot(s, 'B', 0, 4);
    forceSlot(s, 'C', 0, 4);
    forceDiscardTop(s, 4);
    const r1 = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(r1.events.some((e) => e.e === 'MATCH_OK')).toBe(true);

    // C llega 100 ms después, ya sobre la NUEVA superior (también un 4): se cancela.
    const r2 = run(r1.state, { t: 'MATCH_ATTEMPT', p: 'C', slot: 0, tick: 1100 });
    expect(r2.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'tooLate' });
    expect(occupied(r2.state, 'C')).toBe(4); // sin castigo
  });

  it('el segundo intento perdedor sobre una superior que no cambió también se cancela', () => {
    const s = start();
    forceSlot(s, 'B', 0, 1);
    forceSlot(s, 'C', 0, 12);
    forceDiscardTop(s, 12);
    // B falla (la superior no cambia) y fija el ancla de arbitraje.
    const r1 = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(r1.events.some((e) => e.e === 'MATCH_FAIL')).toBe(true);
    const r2 = run(r1.state, { t: 'MATCH_ATTEMPT', p: 'C', slot: 0, tick: 1200 });
    expect(r2.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'tooLate' });
  });
});

describe('E7 · pasados 300 ms se evalúa contra la superior vigente al recibir', () => {
  it('un intento tardío contra la superior nueva falla y se castiga', () => {
    const s = start();
    forceSlot(s, 'B', 0, 5);
    forceSlot(s, 'C', 0, 5);
    forceDiscardTop(s, 5);
    const r1 = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    const mid = structuredClone(r1.state);
    // La superior cambia a un 13 (nadie tiene 13 en juego en este montaje).
    forceDiscardTop(mid, 13);
    mid.lastDiscardChangeTick = 1400;
    delete mid.firstMatchAttemptTick;
    const before = occupied(mid, 'C');
    const r2 = run(mid, { t: 'MATCH_ATTEMPT', p: 'C', slot: 0, tick: 2000 });
    expect(r2.events.some((e) => e.e === 'MATCH_FAIL')).toBe(true);
    expect(occupied(r2.state, 'C')).toBe(before + 1);
  });
});

describe('E6 · quedarte sin tótems gana la ronda al instante', () => {
  it('cancela el turno en curso y pasa a revelación con bonus para el ganador', () => {
    const s = start();
    const mut = structuredClone(s);
    const b = player(mut, 'B');
    for (let i = 1; i < b.slots.length; i++) {
      const c = b.slots[i];
      if (c) mut.deck.push(c);
      b.slots[i] = null;
    }
    forceSlot(mut, 'B', 0, 8);
    forceDiscardTop(mut, 8);
    const r = run(mut, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(r.state.phase).toBe('ROUND_REVEAL');
    expect(r.state.emptyAltarWinner).toBe('B');
    expect(r.events.some((e) => e.e === 'ROUND_REVEAL')).toBe(true);
    const scored = run(r.state, { t: 'TIMER_FIRED', timer: 'reveal' });
    expect(player(scored.state, 'B').roundScore).toBe(-5);
  });
});

describe('E13 · castigo con la mano llena → puntos en vez de carta', () => {
  it('suma fullHandPenaltyPoints y no crece la mano', () => {
    const s = start();
    const mut = structuredClone(s);
    const b = player(mut, 'B');
    while (b.slots.length < mut.config.maxSlots) {
      const c = mut.deck.pop();
      if (c) b.slots.push(c);
    }
    forceSlot(mut, 'B', 0, 1);
    forceDiscardTop(mut, 13);
    expect(b.slots.filter((x) => x !== null)).toHaveLength(8);
    const r = run(mut, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(r.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ penalty: 'points' });
    expect(player(r.state, 'B').penaltyPoints).toBe(5);
    expect(player(r.state, 'B').slots).toHaveLength(8);
    expect(r.events.some((e) => e.e === 'PENALTY_CARD')).toBe(false);
  });
});

describe('E4 · castigo con el mazo agotado → puntos en vez de carta', () => {
  it('sin mazo ni descarte rebarajable se aplican puntos', () => {
    const s = start();
    const mut = structuredClone(s);
    // Vacía el mazo y deja el descarte con una sola carta (no rebarajable).
    mut.deck = [];
    const top = mut.discard[mut.discard.length - 1];
    mut.discard = top ? [top] : [];
    mut.reshuffles = 1;
    forceSlotFromDiscard(mut);
    const r = run(mut, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 });
    expect(r.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ penalty: 'points' });
    expect(player(r.state, 'B').penaltyPoints).toBe(5);
  });

  function forceSlotFromDiscard(st: GameState): void {
    const topV = st.discard[st.discard.length - 1]?.value ?? 0;
    const b = player(st, 'B');
    const wrong = b.slots.find((c) => c && c.value !== topV);
    if (!wrong) throw new Error('montaje inválido');
    const idx = b.slots.indexOf(wrong);
    const first = b.slots[0];
    b.slots[0] = wrong;
    b.slots[idx] = first ?? null;
  }
});

describe('E20 · intento en ventana cerrada: rechazado sin castigo', () => {
  it('durante el vislumbre inicial y durante EFFECT_TARGETING', () => {
    const peekPhase = newGame();
    const r1 = run(peekPhase, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 100 });
    expect(r1.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'window' });
    expect(occupied(r1.state, 'B')).toBe(4);

    let s = start();
    const me = activeId(s);
    const i = s.deck.findIndex((c) => c.value === 7);
    const [card] = s.deck.splice(i, 1);
    if (card) s.deck.push(card);
    s = run(s, { t: 'DRAW_DECK', p: me }, { t: 'DISCARD_DRAWN', p: me }).state;
    expect(s.phase).toBe('EFFECT_TARGETING');
    const other = s.players.find((p) => p.id !== me)?.id as string;
    const r2 = run(s, { t: 'MATCH_ATTEMPT', p: other, slot: 0, tick: 5000 });
    expect(r2.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'window' });
  });

  it('el cantor sellado no puede hacer match (I6)', () => {
    const s = start();
    const mut = structuredClone(s);
    player(mut, 'B').sealed = true;
    const r = run(mut, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 100 });
    expect(r.events.find((e) => e.e === 'MATCH_REJECTED')).toMatchObject({ reason: 'locked' });
  });

  it('slot inválido o jugador inexistente son errores de protocolo', () => {
    const s = start();
    expect(apply(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 99, tick: 10 })).toMatchObject({
      error: { code: 'BAD_SLOT' },
    });
    expect(apply(s, { t: 'MATCH_ATTEMPT', p: 'Z', slot: 0, tick: 10 })).toMatchObject({
      error: { code: 'NO_SUCH_PLAYER' },
    });
  });
});
