/**
 * Selección de slots con teclado y acciones legales con tecla. La HUD diegética
 * (#8) pinta los números sobre la mesa; el modelo vive en presenter/hud-model.ts.
 */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { actionList, moveSelection } from './slot-bar.js';

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

describe('selección de slots con A/D', () => {
  it('salta los huecos (E21) y da la vuelta', () => {
    const v = view({ legal: ['MATCH_ATTEMPT'] });
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
