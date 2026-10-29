/**
 * Única fuente de verdad de constantes de juego — tabla de docs/01 §9.
 * Regla de oro nº5: ningún número mágico fuera de aquí.
 */
import type { GameConfig, OmenDef } from './types.js';
import { effectOf } from './deck.js';

/** #15: Prisa (Conejo 2), Calma (Tortuga 3), Destello (Luciérnaga 0). */
export const DEFAULT_OMENS: readonly OmenDef[] = [
  { id: 'HASTE', value: 2, turnSeconds: 15 },
  { id: 'CALM', value: 3, turnSeconds: 45 },
  { id: 'FLASH', value: 0, matchFailPublicRevealSeconds: 4 },
];

export const DEFAULT_CONFIG: GameConfig = {
  minPlayers: 2,
  maxPlayers: 6,
  initialSlots: 4,
  maxSlots: 8,
  initialPeekCount: 2,
  initialPeekSeconds: 10,
  autoPeekAtSecond: 7,
  turnSeconds: 30,
  effectTargetSeconds: 10,
  privateRevealSeconds: 3,
  matchFailPenaltyCards: 1,
  matchFailLockoutSeconds: 5,
  matchFailPublicRevealSeconds: 2,
  matchArbitrationMs: 300,
  fullHandPenaltyPoints: 5,
  ultimaMinOrbit: 2,
  ultimaFailPenaltyPoints: 10,
  emptyAltarBonusPoints: -5,
  gameEndScore: 100,
  revealPauseSeconds: 4,
  reconnectGraceSeconds: 60,
  botTurnDelayMsMin: 800,
  botTurnDelayMsMax: 1500,
  wildModeEnabled: false,
  kamikazeRule: false,
  mode: 'classic',
  chainBonusPerLink: -1,
  stealWindowMs: 1500,
  omensEnabled: false,
  kamikazeResetScore: 50,
  wildFailPenaltyFactor: 2,
  omens: DEFAULT_OMENS.map((o) => ({ ...o })),
};

type NumericKey = {
  [K in keyof GameConfig]: GameConfig[K] extends number ? K : never;
}[keyof GameConfig];

/** Rangos válidos de docs/01 §9. Las claves sin rango explícito no se listan. */
export const CONFIG_RANGES: Partial<Record<NumericKey, [number, number]>> = {
  minPlayers: [2, 6],
  maxPlayers: [2, 6],
  initialSlots: [3, 5],
  maxSlots: [6, 10],
  initialPeekCount: [1, 3],
  initialPeekSeconds: [5, 20],
  turnSeconds: [15, 60],
  effectTargetSeconds: [5, 20],
  privateRevealSeconds: [2, 5],
  matchFailPenaltyCards: [1, 2],
  matchFailLockoutSeconds: [3, 10],
  matchFailPublicRevealSeconds: [1, 4],
  matchArbitrationMs: [150, 500],
  fullHandPenaltyPoints: [3, 13],
  ultimaMinOrbit: [1, 3],
  ultimaFailPenaltyPoints: [5, 15],
  emptyAltarBonusPoints: [-10, 0],
  gameEndScore: [50, 200],
  revealPauseSeconds: [2, 8],
  reconnectGraceSeconds: [30, 180],
  chainBonusPerLink: [-3, 0],
  stealWindowMs: [1000, 2500],
  kamikazeResetScore: [0, 99],
  wildFailPenaltyFactor: [2, 3],
};

export interface ConfigIssue {
  key: string;
  msg: string;
}

/** Devuelve la lista de problemas; vacía = config válida. Nunca lanza. */
export function validateConfig(c: GameConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const [key, range] of Object.entries(CONFIG_RANGES)) {
    const [min, max] = range as [number, number];
    const v = c[key as NumericKey];
    if (typeof v !== 'number' || Number.isNaN(v)) {
      issues.push({ key, msg: 'no es un número' });
    } else if (v < min || v > max) {
      issues.push({ key, msg: `fuera de rango [${min}, ${max}]: ${v}` });
    }
  }
  if (c.minPlayers > c.maxPlayers) {
    issues.push({ key: 'minPlayers', msg: 'minPlayers > maxPlayers' });
  }
  if (c.initialSlots > c.maxSlots) {
    issues.push({ key: 'initialSlots', msg: 'initialSlots > maxSlots' });
  }
  if (c.initialPeekCount > c.initialSlots) {
    issues.push({ key: 'initialPeekCount', msg: 'initialPeekCount > initialSlots' });
  }
  if (c.autoPeekAtSecond > c.initialPeekSeconds) {
    issues.push({ key: 'autoPeekAtSecond', msg: 'autoPeekAtSecond > initialPeekSeconds' });
  }
  if (c.botTurnDelayMsMin > c.botTurnDelayMsMax) {
    issues.push({ key: 'botTurnDelayMsMin', msg: 'min > max' });
  }
  if (c.mode !== 'quick' && c.mode !== 'classic') {
    issues.push({ key: 'mode', msg: "debe ser 'quick' o 'classic'" });
  }
  if (c.kamikazeRule && c.kamikazeResetScore >= c.gameEndScore) {
    issues.push({ key: 'kamikazeResetScore', msg: 'debe ser menor que gameEndScore' });
  }
  const seen = new Set<number>();
  for (const o of c.omens) {
    if (!Number.isInteger(o.value) || o.value < 0 || o.value > 13) {
      issues.push({ key: 'omens', msg: `valor de carta inválido: ${o.value}` });
    } else if (effectOf(o.value) !== undefined) {
      issues.push({
        key: 'omens',
        msg: `el ${o.value} ya tiene efecto: un presagio es de un tótem sin efecto`,
      });
    }
    if (seen.has(o.value))
      issues.push({ key: 'omens', msg: `presagio duplicado para el ${o.value}` });
    seen.add(o.value);
    for (const sec of [o.turnSeconds, o.matchFailPublicRevealSeconds]) {
      if (sec !== undefined && !(sec > 0)) issues.push({ key: 'omens', msg: 'segundos inválidos' });
    }
  }
  return issues;
}

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/** 1 tick = 1 ms (D-002). */
export const TICKS_PER_SECOND = 1000;
export const secondsToTicks = (s: number): number => Math.round(s * TICKS_PER_SECOND);
