/** Cada efecto solo admite su objetivo: Vislumbre = tuyo, Espionaje = rival, Trueque = tuyo y luego rival. */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { intentToAction, legalIntents } from './Table3D.js';

const view = {
  you: { id: 'me', slots: ['hidden', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [{ id: 'r1', slots: ['hidden', 'hidden'], sealed: false, controller: 'human' }],
  phase: 'EFFECT_TARGETING',
  activePlayer: 'me',
  legal: ['EFFECT_TARGET', 'EFFECT_SKIP'],
} as unknown as PlayerView;

const ctx = { peekPicks: [], swapArmed: false, swapSource: null as number | null };
const mineSlot = { kind: 'slot', player: 'me', slot: 1 } as const;
const rivalSlot = { kind: 'slot', player: 'r1', slot: 0 } as const;

describe('Vislumbre (PEEK)', () => {
  it('mira tu slot y no admite rivales', () => {
    expect(intentToAction(view, mineSlot, { ...ctx, effect: 'PEEK' }).action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'PEEK', slot: 1 },
    });
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'PEEK' })).toEqual({});
  });
  it('solo resalta tus slots', () => {
    const intents = legalIntents(view, 'PEEK');
    expect(intents).toHaveLength(2);
    expect(intents.every((i) => i.kind === 'slot' && i.player === 'me')).toBe(true);
  });
});

describe('Espionaje (SPY)', () => {
  it('espía a un rival y no admite tus slots', () => {
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'SPY' }).action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SPY', player: 'r1', slot: 0 },
    });
    expect(intentToAction(view, mineSlot, { ...ctx, effect: 'SPY' })).toEqual({});
  });
  it('solo resalta los slots de rivales', () => {
    const intents = legalIntents(view, 'SPY');
    expect(intents).toHaveLength(2);
    expect(intents.every((i) => i.kind === 'slot' && i.player === 'r1')).toBe(true);
  });
});

describe('Trueque Ciego (SWAP)', () => {
  it('tu slot solo lo marca (no manda ninguna acción) y el del rival cierra el trueque', () => {
    const first = intentToAction(view, mineSlot, { ...ctx, effect: 'SWAP' });
    expect(first.action).toBeUndefined();
    expect(first.swapSource).toBe(1);

    const second = intentToAction(view, rivalSlot, { ...ctx, effect: 'SWAP', swapSource: 1 });
    expect(second.action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SWAP', ownSlot: 1, player: 'r1', theirSlot: 0 },
    });
  });
  it('un rival sin haber elegido primero tu slot no hace nada', () => {
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'SWAP' })).toEqual({});
  });
  it('puedes cambiar tu slot de origen antes de elegir rival', () => {
    expect(intentToAction(view, mineSlot, { ...ctx, effect: 'SWAP', swapSource: 0 })).toEqual({
      swapSource: 1,
    });
  });
});

describe('sin saber el efecto (p. ej. tras reconectar)', () => {
  it('conserva el comportamiento anterior en vez de bloquear la partida', () => {
    expect(intentToAction(view, rivalSlot, ctx).action).toBeDefined();
    expect(legalIntents(view).length).toBe(4);
  });
});
