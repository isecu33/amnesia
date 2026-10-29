/** Puntuación de ronda — docs/01 §8 (NORMATIVO). Función pura (base de I9). */
import type { GameState } from './types.js';

export interface RoundScore {
  /** suma de los valores de los tótems restantes */
  totemSum: number;
  /** puntos de castigo acumulados en la ronda (E4/E13) */
  penaltyPoints: number;
  /** ajuste de Cadena con premio (#16): aparte de la comparación de ÚLTIMA, sin suelo */
  chainPoints: number;
  /** puntuación final de la ronda que se suma al total */
  round: number;
}

export interface ScoreResult {
  perPlayer: Record<string, RoundScore>;
  /** definido solo si alguien cantó ÚLTIMA */
  ultimaSuccess?: boolean;
}

export function score(s: GameState): ScoreResult {
  const c = s.config;
  const perPlayer: Record<string, RoundScore> = {};
  const base: Record<string, number> = {};

  for (const p of s.players) {
    const totemSum = p.slots.reduce((acc, slot) => acc + (slot ? slot.value : 0), 0);
    base[p.id] = totemSum + p.penaltyPoints;
    perPlayer[p.id] = {
      totemSum,
      penaltyPoints: p.penaltyPoints,
      chainPoints: p.chainPoints,
      round: base[p.id] as number,
    };
  }

  let ultimaSuccess: boolean | undefined;
  if (s.ultimaCaller && perPlayer[s.ultimaCaller]) {
    const mine = base[s.ultimaCaller] as number;
    const strictlyLowest = s.players.every(
      (p) => p.id === s.ultimaCaller || (base[p.id] as number) > mine,
    );
    ultimaSuccess = strictlyLowest;
    (perPlayer[s.ultimaCaller] as RoundScore).round = strictlyLowest
      ? 0
      : mine + c.ultimaFailPenaltyPoints;
  }

  // §7.2 / §8: quien vacía su altar anota 0 y además el bonus (−5) al total.
  if (s.emptyAltarWinner && perPlayer[s.emptyAltarWinner]) {
    (perPlayer[s.emptyAltarWinner] as RoundScore).round = c.emptyAltarBonusPoints;
  }

  // #16: la Cadena con premio se suma al final y se acumula con el −5 de altar vacío.
  for (const p of s.players) (perPlayer[p.id] as RoundScore).round += p.chainPoints;

  return ultimaSuccess === undefined ? { perPlayer } : { perPlayer, ultimaSuccess };
}

/** Ganador de la partida: menor total; desempate por menos tótems y luego por orden de turno. */
export function gameWinner(s: GameState): string {
  const ordered = s.turnOrder
    .map((id, idx) => {
      const p = s.players.find((x) => x.id === id);
      const remaining = p ? p.slots.filter((sl) => sl !== null).length : 0;
      return { id, total: p ? p.totalScore : Number.POSITIVE_INFINITY, remaining, idx };
    })
    .sort((a, b) => a.total - b.total || a.remaining - b.remaining || a.idx - b.idx);
  return (ordered[0]?.id ?? s.turnOrder[0]) as string;
}
