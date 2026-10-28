/**
 * Tipos núcleo de TÓTEM — docs/02 §3.2 (NORMATIVO).
 *
 * Extensiones sobre el extracto normativo (ver docs/decisiones.md):
 *  - D-003: todas las acciones admiten `tick` inyectado por el servidor.
 *  - D-004: `GameState` añade campos de bookkeeping no normativos
 *    (peekChoices, timers, firstMatchAttemptTick, roundStarter, ...).
 */

export type CardValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** ids "c00".."c51" — SOLO servidor, jamás en una vista ni en un evento público (I2). */
export interface Card {
  id: string;
  value: CardValue;
}

/** null = hueco. E21: los huecos NUNCA se compactan. */
export type Slot = Card | null;

export type Phase =
  | 'INITIAL_PEEK'
  | 'TURN_DRAW'
  | 'TURN_RESOLVE'
  | 'EFFECT_TARGETING'
  | 'ROUND_REVEAL'
  | 'ROUND_END'
  | 'GAME_END';

export type EffectKind = 'PEEK' | 'SPY' | 'SWAP' | 'SHARED_EYE' | 'RUMBLE' | 'SEER';
export type Controller = 'human' | 'bot';
export type GameMode = 'quick' | 'classic';

export interface PlayerCore {
  id: string;
  slots: Slot[];
  roundScore: number;
  totalScore: number;
  /** cantor de ÚLTIMA */
  sealed: boolean;
  /** bloqueo tras fallo de Descarte Rápido (ticks = ms) */
  matchLockedUntilTick?: number;
  controller: Controller;
  /** puntos de castigo acumulados en la ronda (E4/E13), aparte de los tótems */
  penaltyPoints: number;
}

export interface TimerInfo {
  kind: 'peek' | 'turn' | 'effect' | 'reveal';
  deadlineTick: number;
}

export interface GameState {
  config: GameConfig;
  seed: number;
  rngCounter: number;
  deck: Card[];
  /** discard[último] = carta superior */
  discard: Card[];
  players: PlayerCore[];
  turnOrder: string[];
  activeIdx: number;
  orbit: number;
  phase: Phase;
  drawn?: { card: Card; source: 'deck' | 'discard' };
  pendingEffect?: EffectKind;
  /** dueño del efecto pendiente */
  effectOwner?: string;
  /** Trueque Vidente: paso en curso (1 = mirar, 2 = trueque opcional) */
  effectStep?: 1 | 2;
  ultimaCaller?: string;
  turnsLeftAfterUltima?: number;
  reshuffles: number;
  /** contador monótono asignado por el servidor. D-002: 1 tick = 1 ms. */
  tick: number;
  /** ancla del arbitraje E5/E7 */
  lastDiscardChangeTick: number;

  // --- bookkeeping (D-004) ---
  /** elecciones del vislumbre inicial ya consumidas */
  peekChoices: Record<string, number[]>;
  /** el autocompletado de vislumbre (autoPeekAtSecond) ya se ejecutó */
  peekAutoCompleted: boolean;
  /** primer intento de match sobre la carta superior vigente (E5) */
  firstMatchAttemptTick?: number;
  /** temporizadores vivos, con su deadline en ticks */
  timers: TimerInfo[];
  /** quién abrió la ronda (ancla del contador de órbitas) */
  roundStarter: string;
  /** número de ronda, 1-based */
  round: number;
  /** ganador por altar vacío en la ronda en curso (§7.2) */
  emptyAltarWinner?: string;
  /** ganador de la partida, solo en GAME_END */
  winner?: string;
}

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  initialSlots: number;
  maxSlots: number;
  initialPeekCount: number;
  initialPeekSeconds: number;
  autoPeekAtSecond: number;
  turnSeconds: number;
  effectTargetSeconds: number;
  privateRevealSeconds: number;
  matchFailPenaltyCards: number;
  matchFailLockoutSeconds: number;
  matchFailPublicRevealSeconds: number;
  matchArbitrationMs: number;
  fullHandPenaltyPoints: number;
  ultimaMinOrbit: number;
  ultimaFailPenaltyPoints: number;
  emptyAltarBonusPoints: number;
  gameEndScore: number;
  revealPauseSeconds: number;
  reconnectGraceSeconds: number;
  botTurnDelayMsMin: number;
  botTurnDelayMsMax: number;
  wildModeEnabled: boolean;
  kamikazeRule: boolean;
  /** D-001: modo de partida (docs/01 §8) */
  mode: GameMode;
}

// ---------------------------------------------------------------------------
// Acciones (docs/02 §3.4, NORMATIVO). `tick` lo inyecta siempre el servidor (D-003).
// ---------------------------------------------------------------------------

/** Una casilla concreta de un altar. */
export interface SlotRef {
  player: string;
  slot: number;
}

export type EffectTarget =
  | { kind: 'PEEK'; slot: number }
  | { kind: 'SPY'; player: string; slot: number }
  | { kind: 'SWAP'; ownSlot: number; player: string; theirSlot: number }
  /** 10 Ojo Compartido: 1 slot propio + 1 de un rival, ambos en privado (#13). */
  | { kind: 'SHARED_EYE'; ownSlot: number; player: string; theirSlot: number }
  /** 12 Revuelo: trueque ciego entre dos casillas cualesquiera, salvo dos propias (#13). */
  | { kind: 'RUMBLE'; a: SlotRef; b: SlotRef }
  /** 13 Trueque Vidente, paso 1: mirar un tótem propio o de un rival no sellado. */
  | { kind: 'SEER_LOOK'; player: string; slot: number }
  /** 13 Trueque Vidente, paso 2: trueque propio↔rival opcional (no tiene por qué ser el mirado). */
  | { kind: 'SEER_SWAP'; ownSlot: number; player: string; theirSlot: number };

export type ActionBody =
  | { t: 'PEEK_INITIAL'; p: string; slots: number[] }
  | { t: 'CALL_ULTIMA'; p: string }
  | { t: 'DRAW_DECK'; p: string }
  | { t: 'DRAW_DISCARD'; p: string }
  | { t: 'DISCARD_DRAWN'; p: string }
  | { t: 'SWAP_DRAWN'; p: string; slot: number }
  | { t: 'EFFECT_TARGET'; p: string; target: EffectTarget }
  | { t: 'EFFECT_SKIP'; p: string }
  | { t: 'MATCH_ATTEMPT'; p: string; slot: number; tick: number }
  | { t: 'TIMER_FIRED'; timer: 'peek' | 'turn' | 'effect' | 'reveal' }
  | { t: 'START_ROUND' }
  | { t: 'FORFEIT'; p: string };

export type Action = ActionBody & { tick?: number };
export type ActionType = ActionBody['t'];

/** Acciones que solo puede originar el servidor (exentas de I4). */
export const SERVER_ACTIONS = ['TIMER_FIRED', 'START_ROUND', 'FORFEIT', 'MATCH_ATTEMPT'] as const;
export type ServerActionType = (typeof SERVER_ACTIONS)[number];
export function isServerAction(t: ActionType): t is ServerActionType {
  return (SERVER_ACTIONS as readonly string[]).includes(t);
}

// ---------------------------------------------------------------------------
// Eventos (docs/02 §3.5, NORMATIVO)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { e: 'ROUND_STARTED'; order: string[]; discardTop: CardValue; startingPlayer: string }
  | { e: 'INITIAL_PEEK_RESULT'; to: string; cards: { slot: number; value: CardValue }[] }
  | { e: 'TURN_STARTED'; player: string; orbit: number; deadlineTick: number }
  | { e: 'ULTIMA_CALLED'; player: string }
  | { e: 'DREW'; player: string; source: 'deck' | 'discard' }
  | { e: 'DREW_VALUE'; to: string; value: CardValue }
  | { e: 'DISCARDED_DRAWN'; player: string; value: CardValue; effect?: EffectKind }
  | { e: 'SWAPPED_DRAWN'; player: string; slot: number; discardedValue: CardValue }
  | {
      e: 'EFFECT_PENDING';
      player: string;
      effect: EffectKind;
      deadlineTick: number;
      /** Trueque Vidente: 1 = mirar, 2 = trueque opcional */
      step?: 1 | 2;
    }
  | {
      e: 'EFFECT_RESOLVED';
      player: string;
      effect: string;
      publicInfo: { slots: { player: string; slot: number }[] };
    }
  | {
      e: 'PRIVATE_REVEAL';
      to: string;
      player: string;
      slot: number;
      value: CardValue;
      ttlMs: number;
    }
  | { e: 'EFFECT_SKIPPED'; player: string; reason: 'timeout' | 'chosen' | 'noTargets' }
  | { e: 'MATCH_OK'; player: string; slot: number; value: CardValue }
  | { e: 'MATCH_FAIL'; player: string; slot: number; value: CardValue; penalty: 'card' | 'points' }
  | { e: 'MATCH_REJECTED'; player: string; reason: 'tooLate' | 'window' | 'locked' }
  | { e: 'PENALTY_CARD'; player: string; slot: number }
  | { e: 'DECK_RESHUFFLED'; deckCount: number }
  | { e: 'ROUND_REVEAL'; hands: Record<string, (CardValue | null)[]> }
  | {
      e: 'ROUND_SCORED';
      scores: Record<string, { round: number; total: number }>;
      ultimaSuccess?: boolean;
    }
  | { e: 'GAME_ENDED'; winner: string; totals: Record<string, number> }
  | { e: 'PLAYER_SEAT'; player: string; controller: Controller };

/** Eventos dirigidos: solo se envían a `to`. */
export const PRIVATE_EVENTS = ['INITIAL_PEEK_RESULT', 'DREW_VALUE', 'PRIVATE_REVEAL'] as const;
export function isPrivateEvent(e: GameEvent): e is Extract<GameEvent, { to: string }> {
  return (PRIVATE_EVENTS as readonly string[]).includes(e.e);
}

// ---------------------------------------------------------------------------
// Resultado y vista
// ---------------------------------------------------------------------------

export interface RuleError {
  code: string;
  msg?: string;
}

export type Result =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: RuleError };

export type SlotView = 'hidden' | 'empty';

export interface PlayerView {
  you: { id: string; slots: SlotView[]; sealed: boolean; lockedForMs: number };
  others: {
    id: string;
    name?: string;
    slots: SlotView[];
    sealed: boolean;
    controller: Controller;
  }[];
  discardTop?: CardValue;
  deckCount: number;
  phase: Phase;
  activePlayer: string;
  orbit: number;
  drawn?: { source: 'deck' | 'discard'; value?: CardValue };
  timers: { kind: string; deadlineTick: number }[];
  scores: Record<string, { round?: number; total: number }>;
  legal: ActionType[];
  /** eco del tick del servidor, para calcular cuentas atrás en el cliente */
  tick: number;
}
