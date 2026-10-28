/** Utilidades de test. No forma parte de la API pública ni de la cobertura. */
import { apply, createGame } from './engine.js';
import { makeConfig } from './config.js';
import type { Action, Card, CardValue, GameConfig, GameEvent, GameState } from './types.js';

export function newGame(
  overrides: Partial<GameConfig> = {},
  ids: string[] = ['A', 'B', 'C'],
  seed = 42,
): GameState {
  return createGame(makeConfig(overrides), ids, seed);
}

export function must(s: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  const r = apply(s, a);
  if (!r.ok) throw new Error(`apply(${a.t}) falló: ${r.error.code} ${r.error.msg ?? ''}`);
  return { state: r.state, events: r.events };
}

/** Encadena acciones, acumulando eventos. Lanza si alguna falla. */
export function run(s: GameState, ...actions: Action[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = must(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Salta el vislumbre inicial: autocompletado + fin de fase → TURN_DRAW. */
export function skipPeek(s: GameState): GameState {
  return run(s, { t: 'TIMER_FIRED', timer: 'peek' }, { t: 'TIMER_FIRED', timer: 'peek' }).state;
}

export const player = (s: GameState, id: string) => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`sin jugador ${id}`);
  return p;
};

export const activeId = (s: GameState): string => (s.players[s.activeIdx] as { id: string }).id;
export const topValue = (s: GameState): CardValue | undefined =>
  s.discard[s.discard.length - 1]?.value;

/**
 * Saca del mazo una carta con ese valor. Si ya no queda ninguna, reetiqueta una
 * carta cualquiera del mazo: el recuento de 52 (I1) se mantiene siempre, que es
 * lo que verifican los tests; la composición exacta se comprueba aparte.
 */
function takeValueFromDeck(s: GameState, value: CardValue): Card {
  const i = s.deck.findIndex((c) => c.value === value);
  if (i !== -1) return s.deck.splice(i, 1)[0] as Card;
  const any = s.deck.pop();
  if (!any) throw new Error('mazo vacío: no se puede forzar un valor');
  return { id: any.id, value };
}

/** Coloca un valor concreto en un slot, devolviendo la carta anterior al mazo (I1 intacta). */
export function forceSlot(s: GameState, pid: string, slot: number, value: CardValue): void {
  const p = player(s, pid);
  const card = takeValueFromDeck(s, value);
  const old = p.slots[slot];
  p.slots[slot] = card;
  if (old) s.deck.push(old);
}

/** Fuerza la carta superior del descarte a un valor concreto (I1 intacta). */
export function forceDiscardTop(s: GameState, value: CardValue): void {
  const card = takeValueFromDeck(s, value);
  const old = s.discard.pop();
  if (old) s.deck.push(old);
  s.discard.push(card);
}

/** Cuenta de cartas en juego — base de I1. */
export function totalCards(s: GameState): number {
  const inSlots = s.players.reduce((n, p) => n + p.slots.filter((x) => x !== null).length, 0);
  return (
    s.deck.length + s.discard.length + inSlots + (s.drawn ? 1 : 0) + (s.drawnChoice?.length ?? 0)
  );
}

/** Deja el estado en TURN_DRAW con `pid` como jugador activo. */
export function makeActive(s: GameState, pid: string): GameState {
  const next = structuredClone(s);
  next.activeIdx = next.players.findIndex((p) => p.id === pid);
  return next;
}

/** El jugador activo roba del mazo una carta del valor pedido (la deja a mano). */
export function withDrawnValue(
  value: CardValue,
  ids: string[] = ['A', 'B', 'C'],
  overrides: Partial<GameConfig> = {},
): { s: GameState; me: string } {
  let s = skipPeek(newGame(overrides, ids));
  const me = activeId(s);
  const i = s.deck.findIndex((c) => c.value === value);
  if (i === -1) throw new Error(`no queda ningún ${value} en el mazo`);
  const [card] = s.deck.splice(i, 1);
  if (card) s.deck.push(card);
  s = run(s, { t: 'DRAW_DECK', p: me }).state;
  return { s, me };
}

/** Descarta la robada y, si hay ventana de robo, la deja vencer: efecto abierto para el dueño. */
export function openEffectWith(
  value: CardValue,
  ids: string[] = ['A', 'B', 'C'],
  overrides: Partial<GameConfig> = {},
): { s: GameState; me: string } {
  const { s, me } = withDrawnValue(value, ids, overrides);
  let state = run(s, { t: 'DISCARD_DRAWN', p: me }).state;
  if ((state.phase as string) === 'STEAL_WINDOW') {
    state = run(state, { t: 'TIMER_FIRED', timer: 'steal' as never }).state;
  }
  return { s: state, me };
}

// --- driver de partidas aleatorias (fuzz) ----------------------------------

import { legalActions } from './legal.js';
import { mulberry32 } from './rng.js';

export class Rnd {
  private n: number;
  constructor(seed: number) {
    this.n = seed >>> 0;
  }
  next(): number {
    this.n = (this.n + 0x9e3779b9) >>> 0;
    return mulberry32(this.n);
  }
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)] as T;
  }
}

/** Todas las acciones aplicables ahora mismo, incluidas las de servidor. */
export function candidateActions(s: GameState): Action[] {
  const out: Action[] = [];
  for (const p of s.players) out.push(...legalActions(s, p.id));
  switch (s.phase) {
    case 'INITIAL_PEEK':
      out.push({ t: 'TIMER_FIRED', timer: 'peek' });
      break;
    case 'TURN_DRAW':
    case 'TURN_RESOLVE':
      out.push({ t: 'TIMER_FIRED', timer: 'turn' });
      break;
    case 'EFFECT_TARGETING':
      out.push({ t: 'TIMER_FIRED', timer: 'effect' });
      break;
    case 'ROUND_REVEAL':
      out.push({ t: 'TIMER_FIRED', timer: 'reveal' });
      break;
    case 'ROUND_END':
      out.push({ t: 'START_ROUND' });
      break;
    case 'GAME_END':
      break;
  }
  return out;
}

export interface PlayStep {
  before: GameState;
  action: Action;
  after: GameState;
  events: GameEvent[];
}

/** Juega una partida con acciones legales aleatorias. Devuelve todos los pasos. */
export function playRandomGame(
  s0: GameState,
  rnd: Rnd,
  maxSteps = 4000,
): { state: GameState; steps: PlayStep[] } {
  let s = s0;
  const steps: PlayStep[] = [];
  for (let i = 0; i < maxSteps && s.phase !== 'GAME_END'; i++) {
    const cands = candidateActions(s);
    if (cands.length === 0) break;
    const action: Action = { ...rnd.pick(cands), tick: s.tick + 50 + rnd.int(1500) };
    const r = apply(s, action);
    if (!r.ok) continue;
    steps.push({ before: s, action, after: r.state, events: r.events });
    s = r.state;
  }
  return { state: s, steps };
}

/** Reetiqueta el valor de toda carta oculta para `pid`. Base del test duro de I2. */
export function scrambleHidden(s: GameState, pid: string, rnd: Rnd): GameState {
  const next = structuredClone(s);
  const rv = (): CardValue => rnd.int(14) as CardValue;
  next.deck = next.deck.map((c) => ({ id: c.id, value: rv() }));
  for (let i = 0; i < next.discard.length - 1; i++) {
    const c = next.discard[i] as Card;
    next.discard[i] = { id: c.id, value: rv() };
  }
  for (const p of next.players) {
    p.slots = p.slots.map((sl) => (sl ? { id: sl.id, value: rv() } : null));
  }
  const amThief = next.players[next.activeIdx]?.id === pid;
  if (next.drawn && !amThief && next.drawn.source === 'deck') {
    next.drawn = { card: { id: next.drawn.card.id, value: rv() }, source: 'deck' };
  }
  if (next.drawnChoice && !amThief) {
    next.drawnChoice = next.drawnChoice.map((c) => ({ id: c.id, value: rv() }));
  }
  return next;
}
