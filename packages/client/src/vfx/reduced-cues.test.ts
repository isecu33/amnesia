/** P1 · «menos movimiento»: pista no cinética para cada beat nuevo (D-015). */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@totem/core';
import { beatFor, type VfxId } from '../presenter/timelines.js';
import { EFFECT_COLORS } from '../presenter/effects.js';
import { PALETTE } from '../scene/palette.js';
import { reducedCueFor } from './reduced-cues.js';

const res = (effect: string): GameEvent => ({
  e: 'EFFECT_RESOLVED',
  player: 'A',
  effect,
  publicInfo: { slots: [] },
});

const NEW_IDS: [VfxId, GameEvent][] = [
  ['peekMark', res('PEEK')],
  ['spyMark', res('SPY')],
  ['sharedEye', res('SHARED_EYE')],
  ['blindSwap', res('SWAP')],
  ['rumble', res('RUMBLE')],
  ['seerLook', res('SEER_LOOK')],
  ['seerSwap', res('SEER_SWAP')],
  ['stealOpen', { e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'SPY', deadlineTick: 1 }],
  ['steal', { e: 'EFFECT_STOLEN', thief: 'B', owner: 'A', effect: 'SPY' }],
  ['chain', { e: 'CHAIN_LINK', player: 'A', link: 2, bonus: -1 }],
  ['chainBroken', { e: 'CHAIN_BROKEN', links: 2 }],
  ['omen', { e: 'OMEN_CHANGED', omen: 'HASTE' }],
  ['doubleDraw', { e: 'DOUBLE_DRAW_PENDING', player: 'A' }],
  ['doubleDrawClear', { e: 'DOUBLE_DRAW_CLEARED', player: 'A', reason: 'used' }],
  ['doubleDrew', { e: 'DOUBLE_DREW_VALUES', to: 'A', values: [1, 2] }],
  ['doubleDrawReject', { e: 'DOUBLE_DRAW_REJECTED', player: 'A', value: 4 }],
  ['wildGift', { e: 'WILD_GIFT', from: 'A', fromSlot: 0, to: 'B', toSlot: 1 }],
  ['fizzle', { e: 'EFFECT_SKIPPED', player: 'A', reason: 'chosen' }],
];

describe('P1 · pistas de «menos movimiento»', () => {
  it.each(NEW_IDS)('%s', (id, e) => {
    expect(beatFor(e).vfx).toBe(id);
    const c = reducedCueFor(id, e, PALETTE);
    expect(c, id).toBeTruthy();
    expect(c?.strength).toBeGreaterThan(0);
  });

  it('cada efecto tiñe con SU color (identidad también sin movimiento)', () => {
    expect(reducedCueFor('peekMark', res('PEEK'), PALETTE)?.color).toBe(EFFECT_COLORS.PEEK);
    expect(reducedCueFor('seerLook', res('SEER_LOOK'), PALETTE)?.color).toBe(EFFECT_COLORS.SEER);
  });

  it('se mantienen las pistas previas (fallo en rojo)', () => {
    const fail: GameEvent = { e: 'MATCH_FAIL', player: 'A', slot: 0, value: 3, penalty: 'card' };
    expect(reducedCueFor('matchFail', fail, PALETTE)?.color).toBe(PALETTE.danger);
  });
});
