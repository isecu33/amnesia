/** #14 / D-043 — Robo de efecto (E23–E28). */
import { describe, expect, it } from 'vitest';
import { legalActions } from './legal.js';
import {
  activeId,
  forceSlot,
  newGame,
  player,
  run,
  skipPeek,
  withDrawnValue,
} from './test-helpers.js';
import type { CardValue, GameState } from './types.js';

/** Ventana abierta: `me` descartó un tótem de valor `v`; `thief` tiene otro `v` en el slot 0. */
function windowWith(v: CardValue, ids = ['A', 'B', 'C']) {
  const w = withDrawnValue(v, ids);
  const r = run(w.s, { t: 'DISCARD_DRAWN', p: w.me });
  const rivals = r.state.players.filter((p) => p.id !== w.me).map((p) => p.id);
  const thief = rivals[0] as string;
  forceSlot(r.state, thief, 0, v);
  return { s: r.state, events: r.events, me: w.me, thief, other: rivals[1] };
}
const at = (s: GameState, ms: number): number => s.tick + ms;

describe('E23 · apertura de la ventana de robo', () => {
  it('C1 con efecto abre STEAL_WINDOW con stealWindowMs y el Descarte Rápido abierto', () => {
    const { s, events, me } = windowWith(9);
    expect(s.phase).toBe('STEAL_WINDOW');
    expect(events.find((e) => e.e === 'STEAL_WINDOW_OPENED')).toMatchObject({
      owner: me,
      effect: 'SPY',
      deadlineTick: s.tick + 1500,
    });
    expect(s.timers).toEqual([{ kind: 'steal', deadlineTick: s.tick + 1500 }]);
    expect(legalActions(s, 'B').map((a) => a.t)).toContain('MATCH_ATTEMPT');
  });

  it('si nadie roba, vence la ventana y el dueño entra en EFFECT_TARGETING', () => {
    const { s, me } = windowWith(9);
    const r = run(s, { t: 'TIMER_FIRED', timer: 'steal' });
    expect(r.state.phase).toBe('EFFECT_TARGETING');
    expect(r.state.effectOwner).toBe(me);
    expect(r.events.find((e) => e.e === 'EFFECT_PENDING')).toMatchObject({ player: me });
  });

  it('se abre aunque el dueño no tenga objetivos (luego E8)', () => {
    const w = withDrawnValue(9);
    for (const p of w.s.players) if (p.id !== w.me) p.sealed = true;
    const r = run(w.s, { t: 'DISCARD_DRAWN', p: w.me });
    expect(r.state.phase).toBe('STEAL_WINDOW');
    const t = run(r.state, { t: 'TIMER_FIRED', timer: 'steal' });
    expect(t.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'noTargets')).toBe(true);
  });

  it('no se abre con tótems sin efecto, con C2, con E15 ni con la carta inicial (E1)', () => {
    const w = withDrawnValue(4);
    expect(run(w.s, { t: 'DISCARD_DRAWN', p: w.me }).state.phase).toBe('TURN_DRAW');
    const c2 = withDrawnValue(9);
    expect(run(c2.s, { t: 'SWAP_DRAWN', p: c2.me, slot: 0 }).state.phase).toBe('TURN_DRAW');
    const e15 = withDrawnValue(9);
    expect(run(e15.s, { t: 'TIMER_FIRED', timer: 'turn' }).state.phase).toBe('TURN_DRAW');
    expect(skipPeek(newGame()).phase).toBe('TURN_DRAW');
  });
});

describe('E24 · el dueño acierta durante la ventana', () => {
  it('es un match normal y conserva el efecto (la ventana se cierra)', () => {
    const { s, me } = windowWith(9);
    forceSlot(s, me, 1, 9);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: me, slot: 1, tick: at(s, 200) });
    expect(r.events.some((e) => e.e === 'MATCH_OK' && e.player === me)).toBe(true);
    expect(r.events.some((e) => e.e === 'EFFECT_STOLEN')).toBe(false);
    expect(r.state.phase).toBe('EFFECT_TARGETING');
    expect(r.state.effectOwner).toBe(me);
    expect(player(r.state, me).slots[1]).toBeNull(); // E21
  });
});

describe('Robo de efecto — el rival acierta', () => {
  it('se lleva el efecto: EFFECT_STOLEN, targeting del ladrón y el dueño lo pierde', () => {
    const { s, me, thief } = windowWith(9);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(r.events.find((e) => e.e === 'EFFECT_STOLEN')).toMatchObject({
      thief,
      owner: me,
      effect: 'SPY',
    });
    expect(r.state.phase).toBe('EFFECT_TARGETING');
    expect(r.state.effectOwner).toBe(thief);
    expect(player(r.state, thief).slots[0]).toBeNull();
    expect(legalActions(r.state, me).map((a) => a.t)).not.toContain('EFFECT_TARGET');

    // el ladrón espía al dueño original; resultado privado solo para el ladrón (E28)
    const spy = run(r.state, {
      t: 'EFFECT_TARGET',
      p: thief,
      target: { kind: 'SPY', player: me, slot: 0 },
    });
    expect(spy.events.find((e) => e.e === 'PRIVATE_REVEAL')).toMatchObject({ to: thief });
    expect(JSON.stringify(spy.events.find((e) => e.e === 'EFFECT_RESOLVED'))).not.toContain(
      '"value"',
    );
    // el turno continúa: tras el efecto, pasa al siguiente
    expect(spy.state.phase).toBe('TURN_DRAW');
    expect(activeId(spy.state)).not.toBe(me);
  });

  it('un Vislumbre robado mira un slot del ladrón', () => {
    const { s, thief } = windowWith(7);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(r.state.pendingEffect).toBe('PEEK');
    expect(legalActions(r.state, thief).some((a) => a.t === 'EFFECT_TARGET')).toBe(true);
  });

  it('el Doble Robo robado se traslada al ladrón', () => {
    const { s, me, thief } = windowWith(8);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(player(r.state, thief).doubleDrawPending).toBe(true);
    expect(player(r.state, me).doubleDrawPending).toBe(false);
    expect(r.state.phase).toBe('TURN_DRAW');
  });

  it('el Doble Robo del dueño se cobra al vencer la ventana', () => {
    const { s, me } = windowWith(8);
    const r = run(s, { t: 'TIMER_FIRED', timer: 'steal' });
    expect(player(r.state, me).doubleDrawPending).toBe(true);
    expect(r.state.phase).toBe('TURN_DRAW');
  });
});

describe('E25 · un solo robo por carta', () => {
  it('el primer acierto gana; los posteriores no son casables ni castigan', () => {
    const { s, thief, other } = windowWith(9);
    forceSlot(s, other as string, 0, 9);
    const r1 = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    const r2 = run(r1.state, {
      t: 'MATCH_ATTEMPT',
      p: other as string,
      slot: 0,
      tick: at(r1.state, 800),
    });
    expect(r2.events[0]).toMatchObject({ e: 'MATCH_REJECTED' }); // casilla cerrada, sin castigo
    expect(r2.events.some((e) => e.e === 'EFFECT_STOLEN')).toBe(false);
    expect(r2.state.effectOwner).toBe(thief);
  });

  it('un fallo no consume el robo: tras 300 ms otro rival aún puede robar', () => {
    const { s, thief, other } = windowWith(9);
    forceSlot(s, other as string, 1, 3);
    const f = run(s, { t: 'MATCH_ATTEMPT', p: other as string, slot: 1, tick: at(s, 100) });
    expect(f.events.some((e) => e.e === 'MATCH_FAIL')).toBe(true);
    expect(f.state.phase).toBe('STEAL_WINDOW');
    const r = run(f.state, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(f.state, 500) });
    expect(r.events.some((e) => e.e === 'EFFECT_STOLEN')).toBe(true);
  });
});

describe('E26 · ladrón sellado, bloqueado o sin objetivos', () => {
  it('un ladrón sellado o bloqueado no puede intentar', () => {
    const { s, thief } = windowWith(9);
    const sealed = structuredClone(s);
    player(sealed, thief).sealed = true;
    expect(
      run(sealed, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 100) }).events[0],
    ).toMatchObject({ e: 'MATCH_REJECTED', reason: 'locked' });
    const locked = structuredClone(s);
    player(locked, thief).matchLockedUntilTick = s.tick + 5000;
    expect(
      run(locked, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 100) }).events[0],
    ).toMatchObject({ e: 'MATCH_REJECTED', reason: 'locked' });
  });

  it('sin objetivos válidos para el ladrón: efecto omitido y perdido (no vuelve al dueño)', () => {
    const { s, me, thief } = windowWith(9);
    for (const p of s.players) if (p.id !== thief) p.sealed = true; // nadie espiable
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(r.events.some((e) => e.e === 'EFFECT_STOLEN')).toBe(true);
    expect(r.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'noTargets')).toBe(true);
    expect(r.state.phase).not.toBe('EFFECT_TARGETING');
    expect(r.state.effectOwner).toBeUndefined();
    void me;
  });
});

describe('E27 · fin de ronda durante la ventana', () => {
  it('el ladrón que acierta con su último tótem gana la ronda y cancela el efecto', () => {
    const { s, thief } = windowWith(9);
    const p = player(s, thief);
    for (let i = 1; i < p.slots.length; i++) p.slots[i] = null;
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(r.state.phase).toBe('ROUND_REVEAL');
    expect(r.state.pendingEffect).toBeUndefined();
    expect(r.state.emptyAltarWinner).toBe(thief);
    expect(r.events.some((e) => e.e === 'EFFECT_STOLEN')).toBe(false);
  });

  it('un castigo con el mazo agotado (E4) no altera la ventana', () => {
    const { s, thief } = windowWith(9);
    forceSlot(s, thief, 1, 2);
    s.deck = [];
    s.reshuffles = 1;
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 1, tick: at(s, 100) });
    expect(r.events.find((e) => e.e === 'MATCH_FAIL')).toMatchObject({ penalty: 'points' });
    expect(r.state.phase).toBe('STEAL_WINDOW');
  });
});

describe('E28 · Cadena y visibilidad', () => {
  it('el robo cuenta como eslabón (match normal), sin bonus propio en el eslabón 1', () => {
    const { s, thief } = windowWith(9);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(r.events.find((e) => e.e === 'CHAIN_LINK')).toMatchObject({
      player: thief,
      link: 1,
      bonus: 0,
    });
  });

  it('los eventos públicos del robo no contienen ids de carta', () => {
    const { s, thief } = windowWith(9);
    const r = run(s, { t: 'MATCH_ATTEMPT', p: thief, slot: 0, tick: at(s, 200) });
    expect(JSON.stringify(r.events)).not.toMatch(/"c\d\d"/);
  });
});
