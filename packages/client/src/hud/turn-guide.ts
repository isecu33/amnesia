/**
 * Guía de turno (lógica pura): de la vista + el estado de apuntado de la interfaz
 * a «quién juega», «qué toca hacer ahora» y las acciones legales con su tecla.
 * Solo traduce `view.legal` a texto: las reglas las decide `core`. Nunca usa
 * valores ocultos (I2): lo único con valor es la carta pública del descarte.
 */
import type { ActionType, EffectKind, PlayerView } from '@totem/core';
import type { TKey } from '../i18n/index.js';
import { actionList } from './slot-bar.js';

export type GuideVars = Record<string, string | number>;

export interface GuideText {
  key: TKey;
  vars?: GuideVars;
  /** variables que son a su vez claves del diccionario (p. ej. el nombre del efecto) */
  tvars?: Record<string, TKey>;
}

export interface GuideChip {
  /** tecla (`KeyboardEvent.key` en minúscula) */
  key: string;
  /** glifo que se muestra en la tecla */
  glyph: string;
  label: TKey;
  /** la acción queda «armada» (p. ej. Sustituir esperando slot) */
  armed?: boolean;
  /** acción destacada (¡ÚLTIMA!) */
  accent?: boolean;
}

export type GuideTone = 'you' | 'rival' | 'all' | 'ultima';

export interface TurnGuide {
  tone: GuideTone;
  title: GuideText;
  /** instrucción contextual; el aviso del efecto (EffectHint) manda sobre ella */
  hint?: GuideText;
  chips: GuideChip[];
  /** alguien cantó ¡ÚLTIMA! en la última instantánea (la mesa puede ir por detrás) */
  ultima: boolean;
}

export interface GuideCtx {
  /** nombre visible de un jugador */
  name: (id: string) => string;
  swapArmed: boolean;
  peekPicks: number;
  /** vislumbres que pide la sala (`initialPeekCount`) */
  peekCount: number;
  /** el efecto admite elegir rival con Q/W */
  targeting: boolean;
  effect?: EffectKind | undefined;
}

const CHIP_LABEL: Record<string, TKey> = {
  DRAW_DECK: 'actDrawDeck',
  DRAW_DISCARD: 'actDrawDiscard',
  DISCARD_DRAWN: 'actDiscard',
  SWAP_DRAWN: 'actSwap',
  EFFECT_SKIP: 'actSkip',
  PEEK_INITIAL: 'actPeek',
  CALL_ULTIMA: 'actUltima',
};

const EFFECT_NAME: Record<EffectKind, TKey> = {
  PEEK: 'effPEEK',
  SPY: 'effSPY',
  SWAP: 'effSWAP',
  DOUBLE_DRAW: 'effDOUBLE_DRAW',
  SHARED_EYE: 'effSHARED_EYE',
  RUMBLE: 'effRUMBLE',
  SEER: 'effSEER',
};

/** Glifo de la tecla tal y como está grabado en la mesa. */
export function keyGlyph(key: string): string {
  return key === 'enter' ? '↵' : key.toUpperCase();
}

function chips(view: PlayerView, ctx: GuideCtx): GuideChip[] {
  const out: GuideChip[] = actionList(view).map((a) => ({
    key: a.key,
    glyph: keyGlyph(a.key),
    label: CHIP_LABEL[a.id] ?? a.label,
    ...(a.id === 'SWAP_DRAWN' && ctx.swapArmed ? { armed: true } : {}),
    ...(a.id === 'CALL_ULTIMA' ? { accent: true } : {}),
  }));
  if (ctx.targeting) out.unshift({ key: 'w', glyph: 'Q/W', label: 'actRival' });
  return out;
}

function title(view: PlayerView, ctx: GuideCtx): { tone: GuideTone; title: GuideText } {
  const mine = view.activePlayer === view.you.id;
  if (view.phase === 'INITIAL_PEEK') return { tone: 'all', title: { key: 'platePeek' } };
  if (view.phase === 'ROUND_REVEAL' || view.phase === 'ROUND_END' || view.phase === 'GAME_END')
    return { tone: 'all', title: { key: 'plateReveal' } };
  if (view.phase === 'STEAL_WINDOW') return { tone: 'all', title: { key: 'plateSteal' } };
  if (view.phase === 'EFFECT_TARGETING' && view.effect) {
    const tvars = { effect: EFFECT_NAME[view.effect.kind] };
    return view.effect.owner === view.you.id
      ? { tone: 'you', title: { key: 'plateEffectYou', tvars } }
      : {
          tone: 'rival',
          title: { key: 'plateEffectOf', vars: { name: ctx.name(view.effect.owner) }, tvars },
        };
  }
  return mine
    ? { tone: 'you', title: { key: 'plateYourTurn' } }
    : { tone: 'rival', title: { key: 'plateTurnOf', vars: { name: ctx.name(view.activePlayer) } } };
}

function hint(view: PlayerView, ctx: GuideCtx): GuideText | undefined {
  const can = (a: ActionType): boolean => view.legal.includes(a);
  if (can('PEEK_INITIAL'))
    return { key: 'guidePeek', vars: { n: ctx.peekCount, picked: ctx.peekPicks } };
  if (view.phase === 'INITIAL_PEEK') return { key: 'guidePeekWait' };
  if (can('SWAP_DRAWN') && ctx.swapArmed)
    return { key: 'guideSwapPick', vars: { max: view.you.slots.length } };
  if (can('SWAP_DRAWN')) return { key: can('DISCARD_DRAWN') ? 'guideResolve' : 'guideResolveSwap' };
  if (can('DRAW_DECK') || can('DRAW_DISCARD')) return { key: 'guideDraw' };
  if (can('MATCH_ATTEMPT') && view.discardTop !== undefined)
    return { key: 'guideMatch', vars: { value: view.discardTop } };
  if (view.you.lockedForMs > 0) return { key: 'guideLocked' };
  return undefined;
}

export function turnGuide(view: PlayerView, ctx: GuideCtx): TurnGuide {
  const h = hint(view, ctx);
  const sealed = [view.you, ...view.others].find((p) => p.sealed);
  const head = title(view, ctx);
  return {
    // Con la ¡ÚLTIMA! cantada la placa entera se tiñe de peligro (cuenta atrás de la ronda).
    tone: sealed && head.tone !== 'you' ? 'ultima' : head.tone,
    title: head.title,
    ...(h ? { hint: h } : {}),
    chips: chips(view, ctx),
    ultima: !!sealed,
  };
}

/** Segundos enteros que se muestran (redondeo hacia arriba: «1» hasta el final). */
export function displaySeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
