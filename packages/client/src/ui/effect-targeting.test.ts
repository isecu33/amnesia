/** Cada efecto solo admite su objetivo: Vislumbre = tuyo, Espionaje = rival, Trueque = tuyo y luego rival. */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import {
  doubleDrawChoice,
  doubleDrawKeepAction,
  doubleDrawKeyIndex,
  effectHintKey,
  intentToAction,
  legalIntents,
} from './effect-targeting.js';

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

const ownA = { kind: 'slot', player: 'me', slot: 0 } as const;
const rivalB = { kind: 'slot', player: 'r1', slot: 1 } as const;

describe('Ojo Compartido (SHARED_EYE)', () => {
  it('funciona como Trueque: tu slot se marca y el del rival cierra con SHARED_EYE', () => {
    const first = intentToAction(view, mineSlot, { ...ctx, effect: 'SHARED_EYE' });
    expect(first).toEqual({ swapSource: 1 });
    const second = intentToAction(view, rivalSlot, { ...ctx, effect: 'SHARED_EYE', swapSource: 1 });
    expect(second.action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SHARED_EYE', ownSlot: 1, player: 'r1', theirSlot: 0 },
    });
  });
  it('un rival sin slot propio previo no hace nada', () => {
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'SHARED_EYE' })).toEqual({});
  });
  it('resalta tus slots y los de rivales', () => {
    expect(legalIntents(view, 'SHARED_EYE')).toHaveLength(4);
  });
});

describe('Revuelo (RUMBLE)', () => {
  const rumble = { ...ctx, effect: 'RUMBLE' as const };
  it('la primera casilla solo se marca (propia o ajena)', () => {
    expect(intentToAction(view, mineSlot, rumble)).toEqual({
      rumbleFirst: { player: 'me', slot: 1 },
    });
    expect(intentToAction(view, rivalSlot, rumble)).toEqual({
      rumbleFirst: { player: 'r1', slot: 0 },
    });
  });
  it('propia + rival cierra el Revuelo en el orden elegido', () => {
    const r = intentToAction(view, rivalSlot, {
      ...rumble,
      rumbleFirst: { player: 'me', slot: 1 },
    });
    expect(r.action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'RUMBLE', a: { player: 'me', slot: 1 }, b: { player: 'r1', slot: 0 } },
    });
  });
  it('rival + propia también vale', () => {
    const r = intentToAction(view, ownA, { ...rumble, rumbleFirst: { player: 'r1', slot: 1 } });
    expect(r.action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'RUMBLE', a: { player: 'r1', slot: 1 }, b: { player: 'me', slot: 0 } },
    });
  });
  it('rival + rival (distinta casilla) es válido', () => {
    const r = intentToAction(view, rivalB, { ...rumble, rumbleFirst: { player: 'r1', slot: 0 } });
    expect(r.action).toMatchObject({ target: { kind: 'RUMBLE' } });
  });
  it('rechaza la segunda si ambas son tuyas y conserva la primera', () => {
    const r = intentToAction(view, ownA, { ...rumble, rumbleFirst: { player: 'me', slot: 1 } });
    expect(r).toEqual({});
  });
  it('rechaza repetir la misma casilla', () => {
    const r = intentToAction(view, rivalSlot, {
      ...rumble,
      rumbleFirst: { player: 'r1', slot: 0 },
    });
    expect(r).toEqual({});
  });
  it('tras elegir una propia no resalta más slots propios', () => {
    const intents = legalIntents(view, 'RUMBLE', { rumbleFirst: { player: 'me', slot: 0 } });
    expect(intents.every((i) => i.kind === 'slot' && i.player === 'r1')).toBe(true);
    expect(legalIntents(view, 'RUMBLE')).toHaveLength(4);
  });
});

describe('Trueque Vidente (SEER)', () => {
  it('paso 1 mira un slot propio o de rival con SEER_LOOK', () => {
    expect(intentToAction(view, mineSlot, { ...ctx, effect: 'SEER', step: 1 }).action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SEER_LOOK', player: 'me', slot: 1 },
    });
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'SEER', step: 1 }).action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SEER_LOOK', player: 'r1', slot: 0 },
    });
  });
  it('sin paso conocido se trata como paso 1', () => {
    expect(intentToAction(view, rivalSlot, { ...ctx, effect: 'SEER' }).action).toMatchObject({
      target: { kind: 'SEER_LOOK' },
    });
  });
  it('paso 2 funciona como Trueque con SEER_SWAP', () => {
    const s2 = { ...ctx, effect: 'SEER' as const, step: 2 as const };
    expect(intentToAction(view, mineSlot, s2)).toEqual({ swapSource: 1 });
    expect(intentToAction(view, rivalSlot, s2)).toEqual({});
    expect(intentToAction(view, rivalSlot, { ...s2, swapSource: 1 }).action).toEqual({
      t: 'EFFECT_TARGET',
      target: { kind: 'SEER_SWAP', ownSlot: 1, player: 'r1', theirSlot: 0 },
    });
  });
});

describe('Doble Robo (DOUBLE_DRAW_KEEP)', () => {
  const choice = {
    ...view,
    phase: 'TURN_RESOLVE',
    drawnChoice: [3, 9],
    legal: ['DOUBLE_DRAW_KEEP', 'MATCH_ATTEMPT'],
  } as unknown as PlayerView;
  it('detecta la elección y expone las dos cartas', () => {
    expect(doubleDrawChoice(choice)).toEqual([3, 9]);
    expect(doubleDrawChoice(view)).toBeUndefined();
  });
  it('sin DOUBLE_DRAW_KEEP legal no hay elección aunque haya cartas', () => {
    expect(doubleDrawChoice({ ...choice, legal: [] } as PlayerView)).toBeUndefined();
  });
  it('envía DOUBLE_DRAW_KEEP con el índice elegido', () => {
    expect(doubleDrawKeepAction(choice, 0)).toEqual({ t: 'DOUBLE_DRAW_KEEP', index: 0 });
    expect(doubleDrawKeepAction(choice, 1)).toEqual({ t: 'DOUBLE_DRAW_KEEP', index: 1 });
  });
  it('rechaza índices inválidos o sin elección', () => {
    expect(doubleDrawKeepAction(choice, 2)).toBeUndefined();
    expect(doubleDrawKeepAction(choice, -1)).toBeUndefined();
    expect(doubleDrawKeepAction(view, 0)).toBeUndefined();
  });
  it('las teclas Z y C eligen la primera y la segunda', () => {
    expect(doubleDrawKeyIndex('z')).toBe(0);
    expect(doubleDrawKeyIndex('c')).toBe(1);
    expect(doubleDrawKeyIndex('x')).toBeUndefined();
  });
});

describe('Descarte Rápido en modo Salvaje', () => {
  const matchView = {
    ...view,
    phase: 'TURN_RESOLVE',
    legal: ['MATCH_ATTEMPT'],
  } as unknown as PlayerView;
  it('sobre un slot de rival envía owner (sin giveSlot) si la sala es Salvaje', () => {
    expect(intentToAction(matchView, rivalSlot, { ...ctx, wild: true }).action).toEqual({
      t: 'MATCH_ATTEMPT',
      slot: 0,
      owner: 'r1',
    });
  });
  it('sin Salvaje un slot de rival no hace nada', () => {
    expect(intentToAction(matchView, rivalSlot, ctx)).toEqual({});
  });
  it('tu propio slot sigue sin owner', () => {
    expect(intentToAction(matchView, mineSlot, { ...ctx, wild: true }).action).toEqual({
      t: 'MATCH_ATTEMPT',
      slot: 1,
    });
  });
  it('resalta los slots de rivales no sellados solo en Salvaje', () => {
    const sealedView = {
      ...matchView,
      others: [
        ...matchView.others,
        { id: 'r2', slots: ['hidden'], sealed: true, controller: 'bot' },
      ],
    } as unknown as PlayerView;
    const isR1 = (i: { kind: string; player?: string }): boolean =>
      i.kind === 'slot' && i.player === 'r1';
    expect(legalIntents(matchView).some(isR1)).toBe(false);
    const wild = legalIntents(sealedView, undefined, { wild: true });
    expect(wild.filter(isR1)).toHaveLength(2);
    expect(wild.some((i) => i.kind === 'slot' && i.player === 'r2')).toBe(false);
  });
  it('en la ventana de robo igualar sigue siendo posible si view.legal lo incluye', () => {
    const steal = { ...matchView, phase: 'STEAL_WINDOW' } as PlayerView;
    expect(intentToAction(steal, mineSlot, ctx).action).toMatchObject({ t: 'MATCH_ATTEMPT' });
    expect(legalIntents(steal)).toHaveLength(2);
  });
});

describe('textos de ayuda', () => {
  const base = { swapSource: null as number | null, rumbleFirst: null };
  it('Trueque, Ojo Compartido y Vidente piden primero lo tuyo y luego el rival', () => {
    expect(effectHintKey(view, { ...base, effect: 'SWAP' })).toBe('hintSwapOwn');
    expect(effectHintKey(view, { ...base, effect: 'SWAP', swapSource: 0 })).toBe('hintSwapRival');
    expect(effectHintKey(view, { ...base, effect: 'SHARED_EYE' })).toBe('hintSharedOwn');
    expect(effectHintKey(view, { ...base, effect: 'SHARED_EYE', swapSource: 0 })).toBe(
      'hintSharedRival',
    );
    expect(effectHintKey(view, { ...base, effect: 'SEER', step: 2 })).toBe('hintSeerSwapOwn');
    expect(effectHintKey(view, { ...base, effect: 'SEER', step: 2, swapSource: 0 })).toBe(
      'hintSeerSwapRival',
    );
  });
  it('Revuelo y Vidente paso 1', () => {
    expect(effectHintKey(view, { ...base, effect: 'RUMBLE' })).toBe('hintRumbleFirst');
    const mine = { player: 'me', slot: 0 };
    expect(effectHintKey(view, { ...base, effect: 'RUMBLE', rumbleFirst: mine })).toBe(
      'hintRumbleSecondRival',
    );
    const theirs = { player: 'r1', slot: 0 };
    expect(effectHintKey(view, { ...base, effect: 'RUMBLE', rumbleFirst: theirs })).toBe(
      'hintRumbleSecond',
    );
    expect(effectHintKey(view, { ...base, effect: 'SEER' })).toBe('hintSeerLook');
  });
  it('Vislumbre, Espionaje y sin efecto conocido', () => {
    expect(effectHintKey(view, { ...base, effect: 'PEEK' })).toBe('hintPeek');
    expect(effectHintKey(view, { ...base, effect: 'SPY' })).toBe('hintSpy');
    expect(effectHintKey(view, base)).toBe('targetPrompt');
  });
  it('Doble Robo y ventana de robo', () => {
    const dd = {
      ...view,
      phase: 'TURN_RESOLVE',
      drawnChoice: [1, 2],
      legal: ['DOUBLE_DRAW_KEEP'],
    } as unknown as PlayerView;
    expect(effectHintKey(dd, base)).toBe('hintDoubleDraw');
    const steal = {
      ...view,
      phase: 'STEAL_WINDOW',
      legal: ['MATCH_ATTEMPT'],
      effect: { kind: 'PEEK', owner: 'r1' },
    } as unknown as PlayerView;
    expect(effectHintKey(steal, base)).toBe('hintStealOpen');
    const own = { ...steal, effect: { kind: 'PEEK', owner: 'me' } } as unknown as PlayerView;
    expect(effectHintKey(own, base)).toBe('hintStealOwner');
  });
  it('sin nada que decir no hay ayuda', () => {
    const idle = { ...view, phase: 'TURN_DRAW', legal: ['DRAW_DECK'] } as unknown as PlayerView;
    expect(effectHintKey(idle, base)).toBeUndefined();
  });
});
