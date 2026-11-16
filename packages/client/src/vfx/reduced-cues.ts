/**
 * «Menos movimiento» (D-015/D-065): cada secuencia tiene una pista NO cinética,
 * una viñeta teñida con color y ritmo propios. Dato puro: se testea que ningún
 * VfxId se quede sin alternativa.
 */
import type { GameEvent } from '@totem/core';
import type { VfxId } from '../presenter/timelines.js';
import { OMEN_COLORS } from '../presenter/hud-v2.js';
import { EFFECT_COLORS, effectKindOf, resolvedOf } from '../presenter/effects.js';
import type { Palette } from '../scene/palette.js';

export interface ReducedCue {
  color: number;
  strength: number;
  holdMs: number;
  fadeMs: number;
}

const cue = (color: number, strength: number, holdMs: number, fadeMs: number): ReducedCue => ({
  color,
  strength,
  holdMs,
  fadeMs,
});

/** Pistas sutiles: los gestos de mesa (robar, descartar) no tiñen la pantalla. */
const QUIET: readonly VfxId[] = ['drawDeck', 'drawDiscard', 'discard', 'swap', 'shuffle', 'reveal'];

export function reducedCueFor(id: VfxId, e: GameEvent, p: Palette): ReducedCue | undefined {
  if (QUIET.includes(id)) return undefined;
  switch (id) {
    case 'matchFail':
    case 'penalty':
      return cue(p.danger, 0.4, 1200, 800);
    case 'matchOk':
    case 'chain':
      return cue(p.mystic, 0.3, 300, 600);
    case 'ultima':
      return cue(p.candle, 0.4, 900, 800);
    case 'peek':
      return e.e === 'PRIVATE_REVEAL'
        ? cue(EFFECT_COLORS.PEEK, 0.3, Math.max(0, e.ttlMs - 800), 600)
        : undefined;
    case 'spy':
      return e.e === 'PRIVATE_REVEAL'
        ? cue(p.mystic, 0.35, Math.max(0, e.ttlMs - 800), 600)
        : undefined;
    case 'peekMark':
    case 'spyMark':
    case 'sharedEye':
    case 'blindSwap':
    case 'rumble':
    case 'seerLook':
    case 'seerSwap': {
      const r = resolvedOf(e);
      return cue(r ? EFFECT_COLORS[effectKindOf(r)] : p.mystic, 0.25, 500, 600);
    }
    case 'stealOpen':
      return cue(e.e === 'STEAL_WINDOW_OPENED' ? EFFECT_COLORS[e.effect] : p.mystic, 0.3, 900, 500);
    case 'steal':
      return cue(p.mystic, 0.4, 400, 700);
    case 'chainBroken':
      return cue(p.ivory, 0.2, 200, 500);
    case 'omen':
      return cue(e.e === 'OMEN_CHANGED' && e.omen ? OMEN_COLORS[e.omen] : p.ivory, 0.3, 600, 700);
    case 'doubleDraw':
    case 'doubleDrew':
    case 'doubleDrawReject':
      return cue(EFFECT_COLORS.DOUBLE_DRAW, 0.25, 400, 600);
    case 'doubleDrawClear':
      return cue(EFFECT_COLORS.DOUBLE_DRAW, 0.15, 150, 400);
    case 'wildGift':
      return cue(p.mystic, 0.25, 400, 500);
    case 'fizzle':
      return cue(p.ivory, 0.15, 150, 400);
    case 'reject':
      return cue(p.ivory, 0.12, 100, 300);
    case 'victory':
      return cue(p.candle, 0.3, 800, 900);
    default:
      return undefined;
  }
}
