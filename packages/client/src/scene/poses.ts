/**
 * Catálogo de poses de las marionetas y qué evento dispara cada una
 * (docs/01 §11, tabla de docs/05 §2.4). Datos puros: `characters.ts` los anima.
 */
import type { CardValue, GameEvent, PlayerView } from '@totem/core';

export type PoseId =
  | 'idle'
  | 'turn'
  | 'reach'
  | 'hold'
  | 'toss'
  | 'point'
  | 'slap'
  | 'flinch'
  | 'ultima'
  | 'cheer'
  | 'slump';

export interface PoseDef {
  durationMs: number;
  /** inclinación del torso hacia la mesa (rad) */
  lean: number;
  /** cabeceo (rad, positivo = mira abajo) */
  headPitch: number;
}

export const POSES: Record<PoseId, PoseDef> = {
  idle: { durationMs: 400, lean: 0, headPitch: 0.12 },
  turn: { durationMs: 300, lean: 0.16, headPitch: 0.22 },
  reach: { durationMs: 380, lean: 0.32, headPitch: 0.3 },
  hold: { durationMs: 300, lean: 0.05, headPitch: 0.05 },
  toss: { durationMs: 420, lean: 0.22, headPitch: 0.25 },
  point: { durationMs: 450, lean: 0.25, headPitch: 0.3 },
  // Descarte Rápido: golpe seco y corto, nunca tapa la ventana de match.
  slap: { durationMs: 200, lean: 0.38, headPitch: 0.35 },
  flinch: { durationMs: 350, lean: -0.18, headPitch: -0.15 },
  ultima: { durationMs: 600, lean: 0.3, headPitch: 0.1 },
  cheer: { durationMs: 700, lean: -0.12, headPitch: -0.3 },
  slump: { durationMs: 700, lean: 0.25, headPitch: 0.55 },
};

export type PoseTarget =
  { kind: 'deck' } | { kind: 'discard' } | { kind: 'slot'; player: string; slot: number };

export interface PoseCue {
  pose: PoseId;
  target?: PoseTarget;
}

/** Qué hace el personaje `who` ante un evento público; undefined = nada. */
export function poseForEvent(e: GameEvent, who: string): PoseCue | undefined {
  switch (e.e) {
    case 'TURN_STARTED':
      return e.player === who ? { pose: 'turn' } : undefined;
    case 'DREW':
      return e.player === who ? { pose: 'reach', target: { kind: e.source } } : undefined;
    case 'DISCARDED_DRAWN':
      return e.player === who ? { pose: 'toss', target: { kind: 'discard' } } : undefined;
    case 'SWAPPED_DRAWN':
      return e.player === who
        ? { pose: 'reach', target: { kind: 'slot', player: e.player, slot: e.slot } }
        : undefined;
    case 'EFFECT_RESOLVED': {
      if (e.player !== who) return undefined;
      const first = e.publicInfo.slots[0];
      return first
        ? { pose: 'point', target: { kind: 'slot', player: first.player, slot: first.slot } }
        : { pose: 'point' };
    }
    case 'MATCH_OK':
      return e.player === who
        ? { pose: 'slap', target: { kind: 'slot', player: e.player, slot: e.slot } }
        : undefined;
    case 'MATCH_FAIL':
      return e.player === who ? { pose: 'flinch' } : undefined;
    case 'ULTIMA_CALLED':
      return e.player === who ? { pose: 'ultima' } : undefined;
    case 'ROUND_SCORED': {
      const mine = e.scores[who];
      if (!mine) return undefined;
      const best = Math.min(...Object.values(e.scores).map((s) => s.round));
      return { pose: mine.round <= best ? 'cheer' : 'slump' };
    }
    case 'GAME_ENDED':
      return { pose: e.winner === who ? 'cheer' : 'slump' };
    default:
      return undefined;
  }
}

/**
 * Qué cara enseña la carta que sostiene `owner` (I2, E22). La de un rival es
 * SIEMPRE el dorso, sepa lo que sepa el cliente; la tuya, solo si su valor te
 * ha llegado por `DREW_VALUE`.
 */
export function heldCardFace(args: {
  owner: string;
  you: string;
  drawn: PlayerView['drawn'];
}): 'back' | CardValue {
  if (args.owner !== args.you) return 'back';
  return args.drawn?.value ?? 'back';
}
