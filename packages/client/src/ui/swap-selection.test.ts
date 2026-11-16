import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import {
  ownSlotTapAction,
  sanitizeSelection,
  swapState,
  toggleSlotSelection,
} from './swap-selection.js';
import { intentToAction } from './effect-targeting.js';

const view = (legal: string[], slots = ['hidden', 'hidden', 'empty', 'hidden']): PlayerView =>
  ({
    you: { id: 'me', slots, sealed: false, lockedForMs: 0 },
    others: [],
    phase: 'TURN_RESOLVE',
    activePlayer: 'me',
    legal,
  }) as unknown as PlayerView;

describe('Sustituir: elegir y confirmar (sin slot por defecto)', () => {
  const v = view(['SWAP_DRAWN', 'DISCARD_DRAWN']);

  it('sin selección: sustituir legal pero deshabilitado', () => {
    expect(swapState(v, undefined)).toEqual({ legal: true, enabled: false });
  });

  it('con un slot elegido se habilita y dice «tótem N» (1-8)', () => {
    expect(swapState(v, 3)).toEqual({ legal: true, enabled: true, slot: 3, slotNumber: 4 });
  });

  it('si no es legal (p. ej. turno ajeno) nunca se habilita', () => {
    expect(swapState(view(['DRAW_DECK']), 0).enabled).toBe(false);
  });

  it('tocar un slot lo elige; tocarlo otra vez lo suelta', () => {
    const a = toggleSlotSelection(v, undefined, 1);
    expect(a).toBe(1);
    expect(toggleSlotSelection(v, a, 1)).toBeUndefined();
  });

  it('tocar otro slot mueve la selección (solo uno a la vez)', () => {
    expect(toggleSlotSelection(v, 0, 3)).toBe(3);
  });

  it('un hueco (E21) no se puede elegir', () => {
    expect(toggleSlotSelection(v, undefined, 2)).toBeUndefined();
    expect(toggleSlotSelection(v, 0, 2)).toBe(0);
  });

  it('una selección que deja de ser elegible se suelta', () => {
    expect(sanitizeSelection(view(['SWAP_DRAWN'], ['hidden', 'empty']), 1)).toBeUndefined();
    expect(sanitizeSelection(v, 0)).toBe(0);
  });

  it('un clic en tu slot NO sustituye: solo se elige (confirmar es aparte)', () => {
    const r = intentToAction(v, { kind: 'slot', player: 'me', slot: 1 }, {
      peekPicks: [],
      swapSource: null,
    });
    expect(r.action).toBeUndefined();
  });
});

describe('tocar tu slot en el canvas (regresión: nunca MATCH_ATTEMPT)', () => {
  const swap = view(['SWAP_DRAWN', 'DISCARD_DRAWN']);

  it('tu propio slot solo elige, también en fase de sustituir', () => {
    expect(ownSlotTapAction(swap, { kind: 'slot', player: 'me' })).toBe('select');
  });

  it('el slot de un rival o un botón siguen su intención', () => {
    expect(ownSlotTapAction(swap, { kind: 'slot', player: 'other' })).toBe('intent');
    expect(ownSlotTapAction(swap, { kind: 'key' })).toBe('intent');
  });
});
