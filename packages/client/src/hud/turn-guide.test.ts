/** Guía de turno: quién juega, qué toca y acciones con tecla, sin valores ocultos (I2). */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import {
  URGENT_SECONDS,
  displaySeconds,
  timerView,
  turnGuide,
  type GuideCtx,
} from './turn-guide.js';

const view = (patch: Partial<PlayerView> = {}): PlayerView => ({
  you: { id: 'me', slots: ['hidden', 'hidden', 'empty', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [{ id: 'r1', slots: ['hidden', 'hidden'], sealed: false, controller: 'bot' }],
  discardTop: 7,
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

const ctx = (patch: Partial<GuideCtx> = {}): GuideCtx => ({
  name: (id) => (id === 'r1' ? 'Ana' : id),
  selectedSlot: undefined,
  peekPicks: 0,
  peekCount: 2,
  targeting: false,
  ...patch,
});

describe('turnGuide', () => {
  it('tu turno de robo: placa propia, instrucción y teclas R/F', () => {
    const g = turnGuide(view({ legal: ['DRAW_DECK', 'DRAW_DISCARD', 'CALL_ULTIMA'] }), ctx());
    expect(g.tone).toBe('you');
    expect(g.title.key).toBe('plateYourTurn');
    expect(g.hint?.key).toBe('guideDraw');
    expect(g.chips.map((c) => c.glyph)).toEqual(['R', 'F', 'U']);
    expect(g.chips.find((c) => c.key === 'u')?.accent).toBe(true);
  });

  it('resolver: con descarte posible pide sustituir o descartar; sin él, solo sustituir', () => {
    const both = view({ phase: 'TURN_RESOLVE', legal: ['SWAP_DRAWN', 'DISCARD_DRAWN'] });
    expect(turnGuide(both, ctx()).hint?.key).toBe('guideResolve');
    const swapOnly = view({ phase: 'TURN_RESOLVE', legal: ['SWAP_DRAWN'] });
    expect(turnGuide(swapOnly, ctx()).hint?.key).toBe('guideResolveSwap');
    // Sin slot elegido: Sustituir existe pero deshabilitado (sin slot por defecto).
    const none = turnGuide(both, ctx());
    expect(none.chips.find((c) => c.key === 's')?.disabled).toBe(true);
    expect(none.chips.find((c) => c.key === 's')?.armed).toBeUndefined();
    // Con slot elegido: se habilita y dice «tótem N».
    const picked = turnGuide(both, ctx({ selectedSlot: 3 }));
    expect(picked.hint?.key).toBe('guideSwapConfirm');
    const chip = picked.chips.find((c) => c.key === 's');
    expect(chip).toMatchObject({ label: 'actSwapN', labelVars: { n: 4 }, armed: true });
    expect(chip?.disabled).toBeUndefined();
    // Un hueco no cuenta como elegido.
    expect(
      turnGuide(both, ctx({ selectedSlot: 2 })).chips.find((c) => c.key === 's')?.disabled,
    ).toBe(true);
  });

  it('turno de un rival: su nombre y, si puedes igualar, la carta pública del descarte', () => {
    const g = turnGuide(
      view({ activePlayer: 'r1', phase: 'TURN_RESOLVE', legal: ['MATCH_ATTEMPT'] }),
      ctx(),
    );
    expect(g.tone).toBe('rival');
    expect(g.title).toEqual({ key: 'plateTurnOf', vars: { name: 'Ana' } });
    expect(g.hint).toEqual({ key: 'guideMatch', vars: { value: 7 } });
  });

  it('vislumbre inicial: cuenta lo elegido y ofrece confirmar con Enter', () => {
    const g = turnGuide(
      view({ phase: 'INITIAL_PEEK', legal: ['PEEK_INITIAL'] }),
      ctx({ peekPicks: 1 }),
    );
    expect(g.tone).toBe('all');
    expect(g.hint).toEqual({ key: 'guidePeek', vars: { n: 2, picked: 1 } });
    expect(g.chips[0]?.glyph).toBe('↵');
    expect(turnGuide(view({ phase: 'INITIAL_PEEK' }), ctx()).hint?.key).toBe('guidePeekWait');
  });

  it('efecto de un rival y apuntado con Q/W', () => {
    const rival = view({
      activePlayer: 'r1',
      phase: 'EFFECT_TARGETING',
      effect: { kind: 'SPY', owner: 'r1' },
    });
    expect(turnGuide(rival, ctx()).title).toEqual({
      key: 'plateEffectOf',
      vars: { name: 'Ana' },
      tvars: { effect: 'effSPY' },
    });
    const mine = view({
      phase: 'EFFECT_TARGETING',
      effect: { kind: 'SWAP', owner: 'me' },
      legal: ['EFFECT_TARGET', 'EFFECT_SKIP'],
    });
    const g = turnGuide(mine, ctx({ targeting: true }));
    expect(g.title.key).toBe('plateEffectYou');
    expect(g.chips.map((c) => c.glyph)).toEqual(['Q/W', 'O']);
  });

  it('con ¡ÚLTIMA! cantada la placa de los demás se tiñe de peligro', () => {
    const v = view({
      activePlayer: 'r1',
      others: [{ id: 'r1', slots: ['hidden'], sealed: true, controller: 'bot' }],
    });
    expect(turnGuide(v, ctx()).tone).toBe('ultima');
    expect(turnGuide(v, ctx()).ultima).toBe(true);
    expect(turnGuide(view(), ctx()).ultima).toBe(false);
  });

  it('bloqueado tras un fallo: lo explica', () => {
    const v = view({ activePlayer: 'r1', you: { ...view().you, lockedForMs: 2000 } });
    expect(turnGuide(v, ctx()).hint?.key).toBe('guideLocked');
  });

  it('nunca expone valores ocultos: solo el descarte público aparece como valor (I2)', () => {
    const v = view({
      activePlayer: 'r1',
      phase: 'TURN_RESOLVE',
      legal: ['MATCH_ATTEMPT'],
      drawn: { source: 'deck' },
    });
    const json = JSON.stringify(turnGuide(v, ctx()));
    expect(json).not.toMatch(/"value":(?!7)/);
  });
});

describe('displaySeconds', () => {
  it('redondea hacia arriba y nunca baja de 0', () => {
    expect(displaySeconds(29_001)).toBe(30);
    expect(displaySeconds(1)).toBe(1);
    expect(displaySeconds(-50)).toBe(0);
  });
});

describe('timerView: reloj suave y estado urgente', () => {
  it('sin plazo no hay reloj', () => {
    expect(timerView(undefined)).toBeUndefined();
  });

  it('con tiempo de sobra no es urgente y la fracción se acota', () => {
    const v = timerView({ remainingMs: 12_000, frac: 1.4, danger: false });
    expect(v).toEqual({ secs: 12, frac: 1, urgent: false });
  });

  it('es urgente a partir de URGENT_SECONDS aunque la vela aún no esté en peligro', () => {
    expect(timerView({ remainingMs: URGENT_SECONDS * 1000, frac: 0.2, danger: false })?.urgent).toBe(
      true,
    );
    expect(
      timerView({ remainingMs: URGENT_SECONDS * 1000 + 1, frac: 0.2, danger: false })?.urgent,
    ).toBe(false);
  });

  it('la vela en peligro fuerza urgente', () => {
    expect(timerView({ remainingMs: 9000, frac: 0.3, danger: true })?.urgent).toBe(true);
  });
});
