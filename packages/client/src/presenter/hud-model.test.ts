/**
 * HUD diegética (#8): lógica pura que decide QUÉ indicadores enciende la mesa.
 * Aquí no hay WebGL: solo estado → indicadores.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@totem/core';
import {
  DANGER_FRAC,
  HudModel,
  LOCK_MIN_LIGHT,
  candleFrac,
  keyStates,
  lockLight,
  reduceUltima,
  slotStates,
} from './hud-model.js';

const view = (patch: Partial<PlayerView> = {}): PlayerView => ({
  you: { id: 'me', slots: ['hidden', 'empty', 'hidden', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [
    { id: 'r1', slots: ['hidden', 'hidden'], sealed: false, controller: 'bot' },
    { id: 'r2', slots: ['hidden', 'hidden'], sealed: false, controller: 'bot' },
  ],
  discardTop: 5,
  deckCount: 20,
  phase: 'TURN_DRAW',
  activePlayer: 'me',
  orbit: 3,
  timers: [],
  scores: {},
  legal: [],
  tick: 1000,
  ...patch,
});

describe('vela-reloj', () => {
  it('la cera es la fracción de tiempo que queda, acotada a 0..1', () => {
    expect(candleFrac(15_000, 30_000)).toBe(0.5);
    expect(candleFrac(-5, 30_000)).toBe(0);
    expect(candleFrac(40_000, 30_000)).toBe(1);
    expect(candleFrac(1000, 0)).toBe(0);
  });

  it('el peligro empieza por debajo del umbral', () => {
    const m = new HudModel();
    const turn = { kind: 'turn', deadlineTick: 31_000 };
    const at = (nowMs: number) =>
      m.frame({ view: view({ timers: [turn] }), clockView: view({ timers: [turn] }), nowMs });
    expect(at(0).candle?.danger).toBe(false);
    expect(at(0).candle?.frac).toBeCloseTo(1, 2);
    const late = at(30_000 * (1 - DANGER_FRAC) + 500);
    expect(late.candle?.danger).toBe(true);
    expect(late.candle?.frac).toBeLessThan(DANGER_FRAC);
  });

  it('consume la vela del jugador activo, no la tuya', () => {
    const m = new HudModel();
    const v = view({ activePlayer: 'r2', timers: [{ kind: 'turn', deadlineTick: 31_000 }] });
    expect(m.frame({ view: v, clockView: v, nowMs: 0 }).candle?.seat).toBe(2);
  });

  it('en el vislumbre inicial todos miran a la vez: la vela es la tuya', () => {
    const m = new HudModel();
    const v = view({
      phase: 'INITIAL_PEEK',
      activePlayer: 'r1',
      timers: [{ kind: 'peek', deadlineTick: 11_000 }],
    });
    expect(m.frame({ view: v, clockView: v, nowMs: 0 }).candle?.seat).toBe(0);
  });

  it('sin temporizador no hay vela consumiéndose', () => {
    const m = new HudModel();
    expect(m.frame({ view: view(), clockView: view(), nowMs: 0 }).candle).toBeUndefined();
  });

  it('una reconexión a mitad de turno no llena la vela de golpe', () => {
    const m = new HudModel();
    // Quedan 9 s de un turno de 30 s: la primera vez que se ve el plazo.
    const v = view({ timers: [{ kind: 'turn', deadlineTick: 10_000 }] });
    expect(m.frame({ view: v, clockView: v, nowMs: 0 }).candle?.frac).toBeCloseTo(0.3, 2);
  });
});

describe('carta bloqueada', () => {
  it('se apaga al fallar y recupera la luz con el castigo', () => {
    expect(lockLight(5000, 5000)).toBeCloseTo(LOCK_MIN_LIGHT, 5);
    expect(lockLight(2500, 5000)).toBeGreaterThan(LOCK_MIN_LIGHT);
    expect(lockLight(2500, 5000)).toBeLessThan(1);
    expect(lockLight(0, 5000)).toBe(1);
    expect(lockLight(-10, 5000)).toBe(1);
  });

  it('el modelo cuenta atrás el bloqueo con el reloj local', () => {
    const m = new HudModel();
    const v = view({ you: { ...view().you, lockedForMs: 5000 } });
    const first = m.frame({ view: v, clockView: v, nowMs: 100 }).lockLight;
    const later = m.frame({ view: v, clockView: v, nowMs: 3100 }).lockLight;
    const done = m.frame({ view: v, clockView: v, nowMs: 5200 }).lockLight;
    expect(first).toBeCloseTo(LOCK_MIN_LIGHT, 2);
    expect(later).toBeGreaterThan(first);
    expect(done).toBe(1);
  });

  it('sin bloqueo, luz plena', () => {
    const m = new HudModel();
    expect(m.frame({ view: view(), clockView: view(), nowMs: 0 }).lockLight).toBe(1);
  });
});

describe('teclas grabadas', () => {
  it('solo se encienden las teclas legales ahora', () => {
    const k = keyStates(view({ legal: ['DRAW_DECK', 'DRAW_DISCARD', 'CALL_ULTIMA'] }), {});
    expect(k.R).toBe('legal');
    expect(k.F).toBe('legal');
    expect(k.U).toBe('legal');
    expect(k.X).toBe('off');
    expect(k.S).toBe('off');
  });

  it('con la carta en mano se pueden descartar o sustituir', () => {
    const k = keyStates(view({ legal: ['DISCARD_DRAWN', 'SWAP_DRAWN'] }), { swapArmed: true });
    expect(k.X).toBe('legal');
    expect(k.S).toBe('armed');
  });

  it('Q/W solo se graban cuando el efecto admite elegir rival', () => {
    expect(keyStates(view(), { targeting: false }).Q).toBe('off');
    expect(keyStates(view(), { targeting: true }).Q).toBe('legal');
    expect(keyStates(view(), { targeting: true }).W).toBe('legal');
  });

  it('la E (robo de efecto) sigue apagada mientras no haya ventana', () => {
    expect(keyStates(view(), {}).E).toBe('off');
    expect(keyStates(view(), { stealOpen: true }).E).toBe('legal');
  });
});

describe('números de los slots', () => {
  it('cada hueco conserva su posición (E21) y no se compacta', () => {
    const s = slotStates(view({ legal: ['MATCH_ATTEMPT'] }), {});
    expect(s).toHaveLength(4);
    expect(s[1]).toBe('empty');
    expect(s[0]).toBe('legal');
  });

  it('distingue el slot elegido y los marcados en el vislumbre', () => {
    const s = slotStates(view({ legal: ['PEEK_INITIAL'] }), { selected: 2, picks: [0] });
    expect(s[0]).toBe('picked');
    expect(s[2]).toBe('selected');
    expect(s[3]).toBe('legal');
  });

  it('sin acciones sobre slots no se enciende ninguno', () => {
    expect(slotStates(view({ legal: ['DRAW_DECK'] }), {})).toEqual([
      'idle',
      'empty',
      'idle',
      'idle',
    ]);
  });
});

describe('tótem de ¡ÚLTIMA!', () => {
  const ev = (e: GameEvent): GameEvent => e;
  const turn = (player: string): GameEvent => ev({ e: 'TURN_STARTED', player, orbit: 3, deadlineTick: 1 });

  it('quedan tantos turnos como rivales tras cantarla; cada turno apaga un piso', () => {
    let s = reduceUltima({ left: 0, started: false }, ev({ e: 'ULTIMA_CALLED', player: 'me' }), 3);
    expect(s).toMatchObject({ caller: 'me', left: 2 });
    s = reduceUltima(s, turn('r1'), 3); // el primer turno tras el canto aún cuenta entero
    expect(s.left).toBe(2);
    s = reduceUltima(s, turn('r2'), 3);
    expect(s.left).toBe(1);
  });

  it('una ronda nueva lo apaga', () => {
    const s = reduceUltima(
      { caller: 'me', left: 1, started: true },
      ev({ e: 'ROUND_STARTED', order: ['me'], discardTop: 1, startingPlayer: 'me' }),
      3,
    );
    expect(s.caller).toBeUndefined();
  });

  it('el modelo lo enciende en el asiento de quien la cantó', () => {
    const m = new HudModel();
    m.onEvent({ e: 'ULTIMA_CALLED', player: 'r2' }, 3);
    const v = view({ others: [view().others[0]!, { ...view().others[1]!, sealed: true }] });
    expect(m.frame({ view: v, clockView: v, nowMs: 0 }).ultima).toEqual({ seat: 2, turnsLeft: 2 });
  });

  it('tras reconectar, sin eventos, se deduce del sellado de la vista', () => {
    const m = new HudModel();
    const v = view({ you: { ...view().you, sealed: true } });
    expect(m.frame({ view: v, clockView: v, nowMs: 0 }).ultima).toEqual({ seat: 0, turnsLeft: 2 });
  });

  it('sin sellados, no hay tótem encendido', () => {
    const m = new HudModel();
    expect(m.frame({ view: view(), clockView: view(), nowMs: 0 }).ultima).toBeUndefined();
  });
});

describe('indicadores de reglas v2 (punto de entrada)', () => {
  it('sin datos v2 no hay presagio, cadena ni aro', () => {
    const m = new HudModel();
    const f = m.frame({ view: view(), clockView: view(), nowMs: 0 });
    expect(f.omen).toBeUndefined();
    expect(f.chainLinks).toBe(0);
    expect(f.steal).toBeUndefined();
  });

  it('alimentado por el adaptador, los traduce a lo que pinta la escena', () => {
    const m = new HudModel();
    const f = m.frame({
      view: view(),
      clockView: view(),
      nowMs: 0,
      v2: { omen: { color: 0x7be0c8 }, chainLinks: 2, steal: { remainingMs: 750, totalMs: 1500 } },
    });
    expect(f.omen).toEqual({ color: 0x7be0c8 });
    expect(f.chainLinks).toBe(2);
    expect(f.steal?.frac).toBe(0.5);
  });

  it('el aro se cierra y desaparece al agotarse la ventana', () => {
    const m = new HudModel();
    const f = m.frame({
      view: view(),
      clockView: view(),
      nowMs: 0,
      v2: { steal: { remainingMs: 0, totalMs: 1500 } },
    });
    expect(f.steal).toBeUndefined();
  });
});
