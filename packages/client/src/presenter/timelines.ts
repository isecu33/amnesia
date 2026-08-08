/**
 * Tabla de feedback por acción — docs/01 §11 (duraciones normativas ±30 %).
 * Es DATO PURO: la escena solo la consume. Así el ritmo del juego se ajusta aquí
 * y se testea sin WebGL.
 */
import type { GameEvent } from '@totem/core';

export type SfxId =
  | 'draw'
  | 'discard'
  | 'swap'
  | 'peek'
  | 'spy'
  | 'blindSwap'
  | 'matchOk'
  | 'matchFail'
  | 'ultima'
  | 'reveal'
  | 'penalty'
  | 'reject'
  | 'turn'
  | 'emote';

export interface Beat {
  /** duración de la timeline en ms */
  durationMs: number;
  sfx?: SfxId;
  /** identificador de la secuencia VFX que dispara (WP-11) */
  vfx?:
    | 'drawDeck'
    | 'drawDiscard'
    | 'discard'
    | 'swap'
    | 'peek'
    | 'spy'
    | 'blindSwap'
    | 'matchOk'
    | 'matchFail'
    | 'ultima'
    | 'reveal';
  /** si true, la vista lógica avanza al EMPEZAR la animación (docs/02 §5.2) */
  advanceOnStart: boolean;
}

const beat = (durationMs: number, rest: Partial<Beat> = {}): Beat => ({
  durationMs,
  advanceOnStart: true,
  ...rest,
});

/** Duraciones de la tabla de docs/01 §11, en ms. */
export const DURATIONS = {
  draw: 600,
  discard: 500,
  swap: 800,
  peek: 3000,
  spy: 3000,
  blindSwap: 1200,
  matchOk: 700,
  matchFail: 3000,
  ultima: 1500,
  reveal: 4000,
} as const;

export function beatFor(e: GameEvent): Beat {
  switch (e.e) {
    case 'TURN_STARTED':
      return beat(200, { sfx: 'turn' });
    case 'DREW':
      return beat(DURATIONS.draw, {
        sfx: 'draw',
        vfx: e.source === 'deck' ? 'drawDeck' : 'drawDiscard',
      });
    case 'DREW_VALUE':
      return beat(0);
    case 'DISCARDED_DRAWN':
      return beat(DURATIONS.discard, { sfx: 'discard', vfx: 'discard' });
    case 'SWAPPED_DRAWN':
      return beat(DURATIONS.swap, { sfx: 'swap', vfx: 'swap' });
    case 'PRIVATE_REVEAL':
      // Vislumbre y Espionaje duran lo que diga el servidor (privateRevealSeconds).
      return beat(e.ttlMs, {
        sfx: e.player === e.to ? 'peek' : 'spy',
        vfx: e.player === e.to ? 'peek' : 'spy',
      });
    case 'EFFECT_RESOLVED':
      if (e.effect === 'SWAP')
        return beat(DURATIONS.blindSwap, { sfx: 'blindSwap', vfx: 'blindSwap' });
      return beat(0);
    case 'EFFECT_PENDING':
      return beat(150);
    case 'MATCH_OK':
      return beat(DURATIONS.matchOk, { sfx: 'matchOk', vfx: 'matchOk' });
    case 'MATCH_FAIL':
      return beat(DURATIONS.matchFail, { sfx: 'matchFail', vfx: 'matchFail' });
    case 'MATCH_REJECTED':
      return beat(200, { sfx: 'reject' });
    case 'PENALTY_CARD':
      return beat(300, { sfx: 'penalty' });
    case 'ULTIMA_CALLED':
      return beat(DURATIONS.ultima, { sfx: 'ultima', vfx: 'ultima' });
    case 'ROUND_REVEAL':
      return beat(DURATIONS.reveal, { sfx: 'reveal', vfx: 'reveal' });
    default:
      return beat(0);
  }
}
