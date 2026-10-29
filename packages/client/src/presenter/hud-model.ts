/**
 * Modelo puro de la HUD diegética (#8): estado de la partida → indicadores que
 * la escena pinta como objetos de la mesa (vela-reloj, tótem de ¡ÚLTIMA!, teclas
 * grabadas, carta que se apaga...). Sin WebGL ni DOM: se testea en Vitest.
 *
 * Capa `presenter`: lee estado (net → state) y entrega datos a `scene`.
 */
import { DEFAULT_CONFIG } from '@totem/core';
import type { GameEvent, PlayerView } from '@totem/core';
import { actionList } from '../hud/slot-bar.js';
import type { HudV2State } from './hud-v2.js';

/** Por debajo de esta fracción la vela se pone roja y arde más rápido. */
export const DANGER_FRAC = 0.25;
/** Luz de la carta bloqueada en el instante del fallo (1 = luz plena). */
export const LOCK_MIN_LIGHT = 0.15;

const MS = 1000;
/** Duración de referencia por tipo de plazo, para no llenar la vela al reconectar a medias. */
const FALLBACK_TIMER_MS: Record<string, number> = {
  turn: DEFAULT_CONFIG.turnSeconds * MS,
  effect: DEFAULT_CONFIG.effectTargetSeconds * MS,
  peek: DEFAULT_CONFIG.initialPeekSeconds * MS,
  reveal: DEFAULT_CONFIG.revealPauseSeconds * MS,
};
const DEFAULT_LOCK_MS = DEFAULT_CONFIG.matchFailLockoutSeconds * MS;

export type KeyGlyph = 'R' | 'F' | 'X' | 'S' | 'O' | 'ENTER' | 'U' | 'Q' | 'W' | 'E' | 'L';
export type KeyState = 'off' | 'legal' | 'armed';
export type SlotState = 'empty' | 'idle' | 'legal' | 'selected' | 'picked';

/** Tecla (`KeyboardEvent.key` en minúscula) de cada glifo grabado en la mesa. */
export const KEY_OF_GLYPH: Record<KeyGlyph, string> = {
  R: 'r',
  F: 'f',
  X: 'x',
  S: 's',
  O: 'o',
  ENTER: 'enter',
  U: 'u',
  Q: 'q',
  W: 'w',
  E: 'e',
  L: 'l',
};

export interface HudIndicators {
  /** vela del jugador cuyo plazo corre; `seat` 0 = tú */
  candle?: { seat: number; frac: number; danger: boolean };
  /** tótem de ¡ÚLTIMA!: asiento de quien la cantó y turnos que quedan */
  ultima?: { seat: number; turnsLeft: number };
  /** luz de tus cartas: 1 libre; baja al fallar un Descarte Rápido y se recupera */
  lockLight: number;
  /** estado del número grabado bajo cada uno de tus slots (misma posición, E21) */
  digits: SlotState[];
  keys: Record<KeyGlyph, KeyState>;
  omen?: { color: number };
  chainLinks: number;
  /** aro de Robo de efecto: 1 = recién abierto, 0 = a punto de cerrarse */
  steal?: { frac: number };
}

export interface KeyContext {
  swapArmed?: boolean;
  /** el efecto en curso admite elegir rival (Q/W) */
  targeting?: boolean;
  /** ventana de Robo de efecto abierta (reglas v2) */
  stealOpen?: boolean;
}

export interface SlotContext {
  selected?: number;
  picks?: number[];
}

/** Fracción de vela que queda, acotada a 0..1. */
export function candleFrac(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  return Math.max(0, Math.min(1, remainingMs / totalMs));
}

/** Luz de la carta bloqueada: oscura al fallar, plena cuando acaba el castigo. */
export function lockLight(remainingMs: number, totalMs: number): number {
  if (remainingMs <= 0 || totalMs <= 0) return 1;
  const frac = Math.min(1, remainingMs / totalMs);
  return 1 - (1 - LOCK_MIN_LIGHT) * frac;
}

export function keyStates(view: PlayerView, ctx: KeyContext): Record<KeyGlyph, KeyState> {
  const keys: Record<KeyGlyph, KeyState> = {
    R: 'off',
    F: 'off',
    X: 'off',
    S: 'off',
    O: 'off',
    ENTER: 'off',
    U: 'off',
    Q: ctx.targeting ? 'legal' : 'off',
    W: ctx.targeting ? 'legal' : 'off',
    E: ctx.stealOpen ? 'legal' : 'off',
    // El registro (mantener L) está siempre disponible: es la tecla grabada que lo anuncia.
    L: 'legal',
  };
  const byKey = new Map(Object.entries(KEY_OF_GLYPH).map(([g, k]) => [k, g as KeyGlyph]));
  for (const a of actionList(view)) {
    const g = byKey.get(a.key);
    if (g) keys[g] = a.id === 'SWAP_DRAWN' && ctx.swapArmed ? 'armed' : 'legal';
  }
  return keys;
}

const SLOT_ACTIONS = ['MATCH_ATTEMPT', 'SWAP_DRAWN', 'PEEK_INITIAL', 'EFFECT_TARGET'] as const;

export function slotStates(view: PlayerView, ctx: SlotContext): SlotState[] {
  const slotLegal = SLOT_ACTIONS.some((a) => view.legal.includes(a));
  return view.you.slots.map((s, i) => {
    if (s === 'empty') return 'empty';
    if (ctx.picks?.includes(i)) return 'picked';
    if (ctx.selected === i) return 'selected';
    return slotLegal ? 'legal' : 'idle';
  });
}

export interface UltimaState {
  caller?: string;
  /** turnos que quedan tras cantarla (el que está en curso cuenta) */
  left: number;
  /** ya ha empezado el primer turno posterior al canto */
  started: boolean;
}

/** Réplica de `turnsLeftAfterUltima` del motor, alimentada por eventos públicos. */
export function reduceUltima(s: UltimaState, e: GameEvent, players: number): UltimaState {
  switch (e.e) {
    case 'ROUND_STARTED':
      return { left: 0, started: false };
    case 'ULTIMA_CALLED':
      return { caller: e.player, left: Math.max(0, players - 1), started: false };
    case 'TURN_STARTED':
      if (!s.caller) return s;
      return s.started ? { ...s, left: Math.max(0, s.left - 1) } : { ...s, started: true };
    default:
      return s;
  }
}

export interface FrameInput {
  /** vista lógica local (avanza con los eventos que reproduce el presenter) */
  view: PlayerView;
  /** última instantánea del servidor: ancla del reloj (`tick` en ms) */
  clockView: PlayerView;
  nowMs: number;
  ctx?: KeyContext & SlotContext;
  v2?: HudV2State | undefined;
}

export class HudModel {
  private clock?: { tick: number; at: number };
  private timer?: { key: string; totalMs: number };
  private lockTotalMs = DEFAULT_LOCK_MS;
  private ultima: UltimaState = { left: 0, started: false };

  /** El presenter llama aquí al empezar cada beat. */
  onEvent(e: GameEvent, players: number): void {
    this.ultima = reduceUltima(this.ultima, e, players);
  }

  frame({ view, clockView, nowMs, ctx = {}, v2 }: FrameInput): HudIndicators {
    if (!this.clock || this.clock.tick !== clockView.tick) {
      this.clock = { tick: clockView.tick, at: nowMs };
    }
    const serverNow = this.clock.tick + (nowMs - this.clock.at);
    const ids = [view.you.id, ...view.others.map((o) => o.id)];

    return {
      candle: this.candle(view, ids, serverNow),
      ultima: this.ultimaIndicator(view, ids),
      lockLight: this.lock(clockView, nowMs),
      // Lo legal viene de la última instantánea del servidor (la vista local solo avanza con la animación).
      digits: slotStates(clockView, ctx),
      keys: keyStates(clockView, { ...ctx, stealOpen: ctx.stealOpen ?? v2?.steal !== undefined }),
      ...(v2?.omen ? { omen: v2.omen } : {}),
      chainLinks: Math.max(0, v2?.chainLinks ?? 0),
      ...stealIndicator(v2),
    };
  }

  private candle(view: PlayerView, ids: string[], serverNow: number): HudIndicators['candle'] {
    const timer = view.timers[view.timers.length - 1];
    if (!timer) return undefined;
    const remaining = timer.deadlineTick - serverNow;
    const key = `${timer.kind}:${timer.deadlineTick}`;
    if (this.timer?.key !== key) {
      // Primera vez que se ve este plazo: si viene con más tiempo que el de
      // referencia (sala «×1,5», presagios...), ese es el total.
      this.timer = {
        key,
        totalMs: Math.max(remaining, FALLBACK_TIMER_MS[timer.kind] ?? remaining),
      };
    }
    const frac = candleFrac(remaining, this.timer.totalMs);
    // En el vislumbre inicial todos miran a la vez: se consume tu vela.
    const owner = view.phase === 'INITIAL_PEEK' ? view.you.id : view.activePlayer;
    const seat = Math.max(0, ids.indexOf(owner));
    return { seat, frac, danger: frac < DANGER_FRAC };
  }

  private ultimaIndicator(view: PlayerView, ids: string[]): HudIndicators['ultima'] {
    const sealed = [view.you, ...view.others].find((p) => p.sealed);
    if (!sealed) return undefined;
    const known = this.ultima.caller === sealed.id;
    // Sin eventos (reconexión): se asume el máximo, un turno por rival.
    const turnsLeft = known ? this.ultima.left : Math.max(0, ids.length - 1);
    return { seat: Math.max(0, ids.indexOf(sealed.id)), turnsLeft };
  }

  private lock(clockView: PlayerView, nowMs: number): number {
    const locked = clockView.you.lockedForMs;
    if (locked <= 0 || !this.clock) return 1;
    this.lockTotalMs = Math.max(this.lockTotalMs, locked);
    return lockLight(locked - (nowMs - this.clock.at), this.lockTotalMs);
  }
}

function stealIndicator(v2: HudV2State | undefined): { steal?: { frac: number } } {
  const s = v2?.steal;
  if (!s || s.remainingMs <= 0 || s.totalMs <= 0) return {};
  return { steal: { frac: candleFrac(s.remainingMs, s.totalMs) } };
}
