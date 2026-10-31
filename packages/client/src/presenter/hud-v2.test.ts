/** HUD v2: presagio, cadena y ventana de Robo de efecto salen de PlayerView. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type PlayerView } from '@totem/core';
import { HudModel } from './hud-model.js';
import { OMEN_COLORS, deriveHudV2 } from './hud-v2.js';

const view = (patch: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: { id: 'me', slots: ['hidden'], sealed: false, lockedForMs: 0 },
    others: [],
    phase: 'TURN_DRAW',
    activePlayer: 'me',
    timers: [],
    legal: [],
    tick: 10_000,
    ...patch,
  }) as unknown as PlayerView;

describe('deriveHudV2', () => {
  it('sin presagio, cadena ni ventana no enciende nada', () => {
    expect(deriveHudV2(view())).toBeUndefined();
  });

  it('un color distinto por presagio', () => {
    const colors = (['HASTE', 'CALM', 'FLASH'] as const).map(
      (omen) => deriveHudV2(view({ omen }))?.omen?.color,
    );
    expect(colors).toEqual([OMEN_COLORS.HASTE, OMEN_COLORS.CALM, OMEN_COLORS.FLASH]);
    expect(new Set(colors).size).toBe(3);
  });

  it('cadena: eslabones; 0 o ausente se ignora', () => {
    expect(deriveHudV2(view({ chain: 3 }))?.chainLinks).toBe(3);
    expect(deriveHudV2(view({ chain: 0 }))).toBeUndefined();
  });

  it('ventana de robo: resta deadline - tick y usa la constante de core por defecto', () => {
    const v = view({
      phase: 'STEAL_WINDOW',
      timers: [{ kind: 'steal', deadlineTick: 10_600 }],
    });
    expect(deriveHudV2(v)?.steal).toEqual({
      remainingMs: 600,
      totalMs: DEFAULT_CONFIG.stealWindowMs,
      deadlineTick: 10_600,
    });
  });

  it('usa el stealWindowMs de la sala si se pasa', () => {
    const v = view({ phase: 'STEAL_WINDOW', timers: [{ kind: 'steal', deadlineTick: 12_000 }] });
    expect(deriveHudV2(v, { stealTotalMs: 2500 })?.steal?.totalMs).toBe(2500);
  });

  it('sin timer steal o fuera de STEAL_WINDOW no hay aro; plazo vencido tampoco', () => {
    const t = [{ kind: 'steal', deadlineTick: 10_600 }];
    expect(deriveHudV2(view({ phase: 'TURN_DRAW', timers: t }))).toBeUndefined();
    expect(deriveHudV2(view({ phase: 'STEAL_WINDOW', timers: [] }))).toBeUndefined();
    const late = [{ kind: 'steal', deadlineTick: 9_000 }];
    expect(deriveHudV2(view({ phase: 'STEAL_WINDOW', timers: late }))).toBeUndefined();
  });

  it('combina las tres cosas', () => {
    const v = view({
      omen: 'CALM',
      chain: 2,
      phase: 'STEAL_WINDOW',
      timers: [{ kind: 'steal', deadlineTick: 10_750 }],
    });
    expect(deriveHudV2(v)).toMatchObject({
      omen: { color: OMEN_COLORS.CALM },
      chainLinks: 2,
      steal: { remainingMs: 750 },
    });
  });
});

describe('HudModel con v2', () => {
  it('el aro de robo se consume con el reloj interpolado', () => {
    const model = new HudModel();
    const v = view({
      phase: 'STEAL_WINDOW',
      timers: [{ kind: 'steal', deadlineTick: 11_000 }],
    });
    const v2 = deriveHudV2(v, { stealTotalMs: 1000 });
    const at = (nowMs: number) => model.frame({ view: v, clockView: v, nowMs, v2 }).steal?.frac;
    expect(at(0)).toBe(1);
    expect(at(500)).toBeCloseTo(0.5);
    const out = model.frame({ view: v, clockView: v, nowMs: 0, v2 });
    expect(out.chainLinks).toBe(0);
  });

  it('presagio y cadena llegan al indicador', () => {
    const v = view({ omen: 'FLASH', chain: 4 });
    const out = new HudModel().frame({
      view: v,
      clockView: v,
      nowMs: 0,
      v2: deriveHudV2(v),
    });
    expect(out.omen).toEqual({ color: OMEN_COLORS.FLASH });
    expect(out.chainLinks).toBe(4);
  });
});
