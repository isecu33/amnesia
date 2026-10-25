/**
 * WP-18 · barra 2D de slots (docs/01 §11, D-042). Requisito: refleja tus slots
 * POR POSICIÓN y NUNCA muestra valores, salvo el de la vista privada en curso.
 */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { actionList, moveSelection, slotBarModel } from './slot-bar.js';

const view = (patch: Partial<PlayerView> = {}): PlayerView => ({
  you: { id: 'me', slots: ['hidden', 'empty', 'hidden', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [{ id: 'r1', slots: ['hidden', 'hidden'], sealed: false, controller: 'bot' }],
  discardTop: 5,
  deckCount: 20,
  phase: 'TURN_DRAW',
  activePlayer: 'me',
  orbit: 1,
  timers: [],
  scores: {},
  legal: [],
  tick: 0,
  ...patch,
});

describe('barra de slots', () => {
  it('una casilla por slot, en orden y con los huecos en su sitio (E21)', () => {
    const m = slotBarModel(view(), {});
    expect(m.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(m.map((s) => s.state)).toEqual(['hidden', 'empty', 'hidden', 'hidden']);
  });

  it('nunca lleva valores fuera de la vista privada', () => {
    const m = slotBarModel(view({ legal: ['MATCH_ATTEMPT'] }), {});
    for (const s of m) expect(s.value).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/"value"/);
  });

  it('durante la vista privada de TU slot enseña ese valor y solo ese', () => {
    const m = slotBarModel(view(), { reveal: { player: 'me', slot: 2, value: 9 } });
    expect(m[2]?.value).toBe(9);
    expect(m.filter((s) => s.value !== undefined)).toHaveLength(1);
  });

  it('un espionaje a un rival no aparece en tu barra', () => {
    const m = slotBarModel(view(), { reveal: { player: 'r1', slot: 0, value: 3 } });
    expect(m.every((s) => s.value === undefined)).toBe(true);
  });

  it('marca como legales solo los tótems ocupados cuando el servidor lo permite', () => {
    expect(slotBarModel(view(), {}).some((s) => s.legal)).toBe(false);
    const m = slotBarModel(view({ legal: ['MATCH_ATTEMPT'] }), {});
    expect(m.map((s) => s.legal)).toEqual([true, false, true, true]);
  });

  it('sellado y bloqueo con cuenta atrás', () => {
    const m = slotBarModel(view({ you: { ...view().you, sealed: true, lockedForMs: 4200 } }), {});
    expect(m[0]?.sealed).toBe(true);
    expect(m[0]?.lockedSeconds).toBe(5);
  });

  it('la selección marca la casilla elegida y salta los huecos con A/D', () => {
    const v = view({ legal: ['MATCH_ATTEMPT'] });
    expect(slotBarModel(v, { selected: 3 })[3]?.selected).toBe(true);
    expect(moveSelection(v, 0, 1)).toBe(2);
    expect(moveSelection(v, 2, -1)).toBe(0);
    expect(moveSelection(v, 3, 1)).toBe(0);
    expect(moveSelection(v, undefined, 1)).toBe(0);
  });
});

describe('lista de acciones legales con tecla', () => {
  it('solo enseña lo que dice view.legal, cada una con su tecla', () => {
    const list = actionList(view({ legal: ['DRAW_DECK', 'DRAW_DISCARD', 'CALL_ULTIMA'] }));
    expect(list.map((a) => a.id)).toEqual(['DRAW_DECK', 'DRAW_DISCARD', 'CALL_ULTIMA']);
    expect(new Set(list.map((a) => a.key)).size).toBe(list.length);
  });

  it('sin nada legal no hay acciones', () => {
    expect(actionList(view())).toEqual([]);
  });
});
