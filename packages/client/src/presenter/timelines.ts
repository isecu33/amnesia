/**
 * Tabla de feedback por acción — docs/01 §11 (duraciones normativas ±30 %).
 * Es DATO PURO: la escena solo la consume. Así el ritmo del juego se ajusta aquí
 * y se testea sin WebGL.
 */
import type { EffectKind, GameEvent } from '@totem/core';
import { resolvedOf, type ResolvedEffect } from './effects.js';

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
  | 'emote'
  | 'chain'
  | 'steal'
  | 'shuffle'
  | 'victory'
  // P1 efectos: leitmotiv por efecto (3–4 notas) + avisos de la ventana de robo
  | 'motifPeek'
  | 'motifDoubleDraw'
  | 'motifSpy'
  | 'motifSharedEye'
  | 'motifSwap'
  | 'motifRumble'
  | 'motifSeer'
  | 'stealTick'
  | 'omen'
  | 'chainBroken'
  | 'fizzle'
  | 'wildGift';

/** Secuencias VFX (vfx/sequences.ts). */
export type VfxId =
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
  | 'reveal'
  | 'penalty'
  | 'reject'
  | 'chain'
  | 'steal'
  | 'shuffle'
  | 'victory'
  // P1 efectos: marca pública sobre las casillas afectadas (nunca valores, I2)
  | 'peekMark'
  | 'spyMark'
  | 'sharedEye'
  | 'rumble'
  | 'seerLook'
  | 'seerSwap'
  | 'stealOpen'
  | 'chainBroken'
  | 'omen'
  | 'doubleDraw'
  | 'doubleDrawClear'
  | 'doubleDrew'
  | 'doubleDrawReject'
  | 'wildGift'
  | 'fizzle';

export interface Beat {
  /** duración de la timeline en ms */
  durationMs: number;
  sfx?: SfxId;
  /** segundo sonido simultáneo (p. ej. el tic de la ventana de robo bajo el leitmotiv) */
  sfx2?: SfxId;
  /** identificador de la secuencia VFX que dispara (WP-11) */
  vfx?: VfxId;
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
  /** P1: trueques con movimiento de tótems (Revuelo, Vidente) = Trueque Ciego */
  rumble: 1200,
  seerSwap: 1200,
  wildGift: 600,
} as const;

/** Leitmotiv de cada efecto: suena al anunciarse (ventana de robo) y al robarse. */
export const EFFECT_MOTIF: Record<EffectKind, SfxId> = {
  PEEK: 'motifPeek',
  DOUBLE_DRAW: 'motifDoubleDraw',
  SPY: 'motifSpy',
  SHARED_EYE: 'motifSharedEye',
  SWAP: 'motifSwap',
  RUMBLE: 'motifRumble',
  SEER: 'motifSeer',
};

interface ResolvedBeat {
  durationMs: number;
  vfx: VfxId;
  sfx: SfxId;
  /** el actor ya oyó este sonido con su PRIVATE_REVEAL: no se repite */
  privateLook: boolean;
}

/** EFFECT_RESOLVED → beat. Las vistas privadas ya animan con PRIVATE_REVEAL: aquí, 0 ms. */
export const RESOLVED_BEATS: Record<ResolvedEffect, ResolvedBeat> = {
  PEEK: { durationMs: 0, vfx: 'peekMark', sfx: 'peek', privateLook: true },
  SPY: { durationMs: 0, vfx: 'spyMark', sfx: 'spy', privateLook: true },
  SHARED_EYE: { durationMs: 0, vfx: 'sharedEye', sfx: 'motifSharedEye', privateLook: true },
  SEER_LOOK: { durationMs: 0, vfx: 'seerLook', sfx: 'motifSeer', privateLook: true },
  SWAP: { durationMs: DURATIONS.blindSwap, vfx: 'blindSwap', sfx: 'blindSwap', privateLook: false },
  RUMBLE: { durationMs: DURATIONS.rumble, vfx: 'rumble', sfx: 'motifRumble', privateLook: false },
  SEER_SWAP: {
    durationMs: DURATIONS.seerSwap,
    vfx: 'seerSwap',
    sfx: 'blindSwap',
    privateLook: false,
  },
};

/** Contexto opcional: con `selfId` se evita repetir sonidos que el actor ya oyó. */
export interface BeatCtx {
  selfId?: string;
}

export function beatFor(e: GameEvent, ctx: BeatCtx = {}): Beat {
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
    case 'EFFECT_RESOLVED': {
      const kind = resolvedOf(e);
      if (!kind) return beat(0);
      const r = RESOLVED_BEATS[kind];
      const heard = r.privateLook && ctx.selfId !== undefined && e.player === ctx.selfId;
      return beat(r.durationMs, { vfx: r.vfx, ...(heard ? {} : { sfx: r.sfx }) });
    }
    case 'EFFECT_SKIPPED':
      return beat(0, { sfx: 'fizzle', vfx: 'fizzle' });
    case 'STEAL_WINDOW_OPENED':
      return beat(0, { sfx: EFFECT_MOTIF[e.effect], sfx2: 'stealTick', vfx: 'stealOpen' });
    case 'CHAIN_BROKEN':
      return beat(0, { sfx: 'chainBroken', vfx: 'chainBroken' });
    case 'OMEN_CHANGED':
      return beat(0, e.omen ? { sfx: 'omen', vfx: 'omen' } : { vfx: 'omen' });
    case 'DOUBLE_DRAW_PENDING':
      return beat(0, { sfx: 'motifDoubleDraw', vfx: 'doubleDraw' });
    case 'DOUBLE_DRAW_CLEARED':
      return beat(0, { vfx: 'doubleDrawClear', ...(e.reason === 'lost' ? { sfx: 'fizzle' } : {}) });
    case 'DOUBLE_DREW_VALUES':
      return beat(0, { sfx: 'motifDoubleDraw', vfx: 'doubleDrew' });
    case 'DOUBLE_DRAW_REJECTED':
      return beat(DURATIONS.discard, { sfx: 'discard', vfx: 'doubleDrawReject' });
    case 'WILD_GIFT':
      return beat(DURATIONS.wildGift, { sfx: 'wildGift', vfx: 'wildGift' });
    case 'EFFECT_PENDING':
      return beat(150);
    case 'MATCH_OK':
      return beat(DURATIONS.matchOk, { sfx: 'matchOk', vfx: 'matchOk' });
    case 'MATCH_FAIL':
      return beat(DURATIONS.matchFail, { sfx: 'matchFail', vfx: 'matchFail' });
    case 'MATCH_REJECTED':
      return beat(200, { sfx: 'reject', vfx: 'reject' });
    case 'PENALTY_CARD':
      return beat(300, { sfx: 'penalty', vfx: 'penalty' });
    // Beats de 0 ms: suenan y brillan sin alterar el ritmo de la cola.
    case 'CHAIN_LINK':
      return beat(0, { sfx: 'chain', vfx: 'chain' });
    case 'EFFECT_STOLEN':
      return beat(0, { sfx: 'steal', vfx: 'steal' });
    case 'DECK_RESHUFFLED':
      return beat(0, { sfx: 'shuffle', vfx: 'shuffle' });
    case 'GAME_ENDED':
      return beat(0, { sfx: 'victory', vfx: 'victory' });
    case 'ULTIMA_CALLED':
      return beat(DURATIONS.ultima, { sfx: 'ultima', vfx: 'ultima' });
    case 'ROUND_REVEAL':
      return beat(DURATIONS.reveal, { sfx: 'reveal', vfx: 'reveal' });
    default:
      return beat(0);
  }
}
