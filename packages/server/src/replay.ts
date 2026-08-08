/** Re-simulación de partidas grabadas — docs/02 §7. */
import { apply, createGame, type GameState } from '@totem/core';
import type { ReplayFile } from './session.js';

export interface ReplayResult {
  ok: boolean;
  steps: number;
  rejected: number;
  finalPhase: string;
  totals: Record<string, number>;
  mismatch?: string;
}

export function replay(file: ReplayFile): ReplayResult {
  let s: GameState = createGame(file.config, file.playerIds, file.seed);
  let rejected = 0;
  for (const a of file.actions) {
    const r = apply(s, a);
    if (!r.ok) {
      rejected++;
      continue;
    }
    s = r.state;
  }
  const totals: Record<string, number> = {};
  for (const p of s.players) totals[p.id] = p.totalScore;

  const phaseOk = s.phase === file.finalPhase;
  const totalsOk = JSON.stringify(totals) === JSON.stringify(file.finalTotals);
  const result: ReplayResult = {
    ok: phaseOk && totalsOk && rejected === 0,
    steps: file.actions.length,
    rejected,
    finalPhase: s.phase,
    totals,
  };
  if (!phaseOk) result.mismatch = `fase: esperada ${file.finalPhase}, obtenida ${s.phase}`;
  else if (!totalsOk) result.mismatch = `totales: ${JSON.stringify(totals)}`;
  else if (rejected > 0) result.mismatch = `${rejected} acciones rechazadas al re-simular`;
  return result;
}
