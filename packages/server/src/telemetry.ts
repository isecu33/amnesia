/**
 * Telemetría MVP — docs/02 §8. Solo contadores agregados a logs, nada de terceros
 * ni datos personales (docs/02 §6).
 */
import type { GameEvent, GameState } from '@totem/core';

export interface Telemetry {
  games: number;
  rounds: number;
  totalDurationMs: number;
  matchAttempts: number;
  matchOk: number;
  matchFail: number;
  matchRejected: number;
  ultimaCalls: number;
  ultimaSuccess: number;
  emptyAltarWins: number;
  reshuffles: number;
  penaltyPoints: number;
  botSeats: number;
  reconnects: number;
}

export const emptyTelemetry = (): Telemetry => ({
  games: 0,
  rounds: 0,
  totalDurationMs: 0,
  matchAttempts: 0,
  matchOk: 0,
  matchFail: 0,
  matchRejected: 0,
  ultimaCalls: 0,
  ultimaSuccess: 0,
  emptyAltarWins: 0,
  reshuffles: 0,
  penaltyPoints: 0,
  botSeats: 0,
  reconnects: 0,
});

export class TelemetryCollector {
  private t = emptyTelemetry();
  private startedAt?: number;

  snapshot(): Telemetry {
    return { ...this.t };
  }

  gameStarted(atMs: number): void {
    this.t.games += 1;
    this.startedAt = atMs;
  }

  gameEnded(atMs: number): void {
    if (this.startedAt !== undefined) this.t.totalDurationMs += atMs - this.startedAt;
    this.startedAt = undefined;
  }

  reconnected(): void {
    this.t.reconnects += 1;
  }

  observe(e: GameEvent, state?: GameState): void {
    switch (e.e) {
      case 'MATCH_OK':
        this.t.matchAttempts += 1;
        this.t.matchOk += 1;
        break;
      case 'MATCH_FAIL':
        this.t.matchAttempts += 1;
        this.t.matchFail += 1;
        if (e.penalty === 'points')
          this.t.penaltyPoints += state?.config.fullHandPenaltyPoints ?? 0;
        break;
      case 'MATCH_REJECTED':
        this.t.matchAttempts += 1;
        this.t.matchRejected += 1;
        break;
      case 'ULTIMA_CALLED':
        this.t.ultimaCalls += 1;
        break;
      case 'ROUND_SCORED':
        this.t.rounds += 1;
        if (e.ultimaSuccess === true) this.t.ultimaSuccess += 1;
        break;
      case 'DECK_RESHUFFLED':
        this.t.reshuffles += 1;
        break;
      case 'PLAYER_SEAT':
        if (e.controller === 'bot') this.t.botSeats += 1;
        break;
      case 'ROUND_REVEAL':
        if (state?.emptyAltarWinner) this.t.emptyAltarWins += 1;
        break;
      default:
        break;
    }
  }

  /** Ratios de balance que se revisan en WP-17. */
  ratios(): Record<string, number> {
    const r = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 1000) / 1000);
    return {
      matchHitRate: r(this.t.matchOk, this.t.matchAttempts),
      matchFailRate: r(this.t.matchFail, this.t.matchAttempts),
      ultimaSuccessRate: r(this.t.ultimaSuccess, this.t.ultimaCalls),
      roundsPerGame: r(this.t.rounds, this.t.games),
      avgGameMs: r(this.t.totalDurationMs, this.t.games),
      emptyAltarRate: r(this.t.emptyAltarWins, this.t.rounds),
    };
  }

  /** Línea JSON para `pino` (docs/02 §8). */
  toLog(): string {
    return JSON.stringify({ level: 'info', msg: 'telemetry', ...this.t, ...this.ratios() });
  }
}
