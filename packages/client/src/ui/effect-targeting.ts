/**
 * Lógica pura de apuntado: qué se resalta y qué acción sale de un clic/tecla
 * (docs/01 §11: solo lo legal brilla). Sin React ni escena; las reglas de
 * validez las decide `core`, aquí solo se guía la intención del jugador.
 */
import type { ActionType, EffectKind, PlayerView, SlotRef } from '@totem/core';
import type { ClientAction } from '@totem/protocol';
import type { Intent } from '../scene/world.js';
import type { TKey } from '../i18n/index.js';

/** Teclas del Doble Robo: Z = primera carta, C = segunda (1-8 son los slots). */
export const DOUBLE_DRAW_KEYS = ['z', 'c'] as const;

export interface IntentCtx {
  peekPicks: number[];
  swapArmed: boolean;
  swapSource: number | null;
  effect?: EffectKind | undefined;
  /** Trueque Vidente: 1 = mirar, 2 = trueque opcional */
  step?: 1 | 2 | undefined;
  /** Revuelo: primera casilla ya elegida */
  rumbleFirst?: SlotRef | null | undefined;
  /** la sala tiene Modo Salvaje: se puede igualar sobre tótems de rivales */
  wild?: boolean | undefined;
}

export interface IntentResult {
  action?: ClientAction;
  peekToggle?: number;
  swapSource?: number;
  rumbleFirst?: SlotRef;
}

export interface LegalIntentOptions {
  wild?: boolean | undefined;
  rumbleFirst?: SlotRef | null | undefined;
}

type SlotIntent = Extract<Intent, { kind: 'slot' }>;
type PairedKind = 'SWAP' | 'SHARED_EYE' | 'SEER_SWAP';

/** Efectos de elegir «tuyo + rival» y cerrar con una acción de trueque/mirada. */
function pairedKind(effect: EffectKind, step: 1 | 2 | undefined): PairedKind | undefined {
  if (effect === 'SWAP') return 'SWAP';
  if (effect === 'SHARED_EYE') return 'SHARED_EYE';
  if (effect === 'SEER' && step === 2) return 'SEER_SWAP';
  return undefined;
}

/** Intenciones legales derivadas de view.legal (docs/01 §11: solo lo legal brilla). */
export function legalIntents(
  view: PlayerView,
  effect?: EffectKind,
  opts: LegalIntentOptions = {},
): Intent[] {
  const out: Intent[] = [];
  const can = (a: ActionType): boolean => view.legal.includes(a);
  if (can('DRAW_DECK')) out.push({ kind: 'deck' });
  if (can('DRAW_DISCARD')) out.push({ kind: 'discard' });
  if (can('CALL_ULTIMA')) out.push({ kind: 'bell' });
  if (can('MATCH_ATTEMPT') || can('SWAP_DRAWN') || can('PEEK_INITIAL')) {
    view.you.slots.forEach((s, i) => {
      if (s === 'hidden') out.push({ kind: 'slot', player: view.you.id, slot: i });
    });
  }
  if (can('MATCH_ATTEMPT') && opts.wild) {
    // Salvaje: también los tótems de rivales no sellados.
    for (const o of view.others) {
      o.slots.forEach((s, i) => {
        if (s === 'hidden' && !o.sealed) out.push({ kind: 'slot', player: o.id, slot: i });
      });
    }
  }
  if (can('EFFECT_TARGET')) {
    const first = effect === 'RUMBLE' ? opts.rumbleFirst : null;
    // Cada efecto admite un objetivo distinto; sin saberlo (p. ej. tras reconectar) se ofrece todo.
    if (effect !== 'PEEK') {
      for (const o of view.others) {
        o.slots.forEach((s, i) => {
          if (s !== 'hidden' || o.sealed) return;
          if (first?.player === o.id && first.slot === i) return;
          out.push({ kind: 'slot', player: o.id, slot: i });
        });
      }
    }
    // Revuelo: tras elegir una casilla propia, la segunda no puede serlo.
    if (effect !== 'SPY' && first?.player !== view.you.id) {
      view.you.slots.forEach((s, i) => {
        if (s === 'hidden') out.push({ kind: 'slot', player: view.you.id, slot: i });
      });
    }
  }
  return out;
}

function pairedAction(kind: PairedKind, ownSlot: number, intent: SlotIntent): ClientAction {
  return {
    t: 'EFFECT_TARGET',
    target: { kind, ownSlot, player: intent.player, theirSlot: intent.slot },
  };
}

/** Efecto con objetivo conocido: PEEK, SPY, parejas, Revuelo y Vidente. */
function knownEffectIntent(
  view: PlayerView,
  intent: SlotIntent,
  ctx: IntentCtx,
  effect: EffectKind,
): IntentResult {
  const mine = intent.player === view.you.id;
  if (effect === 'PEEK') {
    return mine
      ? { action: { t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: intent.slot } } }
      : {};
  }
  if (effect === 'SPY') {
    if (mine) return {};
    return {
      action: {
        t: 'EFFECT_TARGET',
        target: { kind: 'SPY', player: intent.player, slot: intent.slot },
      },
    };
  }
  if (effect === 'RUMBLE') {
    const here: SlotRef = { player: intent.player, slot: intent.slot };
    const first = ctx.rumbleFirst;
    if (!first) return { rumbleFirst: here };
    if (first.player === here.player && first.slot === here.slot) return {};
    // Dos casillas propias no valen: se rechaza la segunda y se conserva la primera.
    if (first.player === view.you.id && mine) return {};
    return { action: { t: 'EFFECT_TARGET', target: { kind: 'RUMBLE', a: first, b: here } } };
  }
  if (effect === 'SEER' && ctx.step !== 2) {
    return {
      action: {
        t: 'EFFECT_TARGET',
        target: { kind: 'SEER_LOOK', player: intent.player, slot: intent.slot },
      },
    };
  }
  const kind = pairedKind(effect, ctx.step);
  if (!kind) return {};
  // Tu slot primero (solo se marca), luego el del rival.
  if (mine) return { swapSource: intent.slot };
  if (ctx.swapSource === null) return {};
  return { action: pairedAction(kind, ctx.swapSource, intent) };
}

/** Traduce una intención de la escena a una acción de protocolo. */
export function intentToAction(view: PlayerView, intent: Intent, ctx: IntentCtx): IntentResult {
  const can = (a: ActionType): boolean => view.legal.includes(a);
  if (intent.kind === 'deck' && can('DRAW_DECK')) return { action: { t: 'DRAW_DECK' } };
  if (intent.kind === 'discard' && can('DRAW_DISCARD')) return { action: { t: 'DRAW_DISCARD' } };
  if (intent.kind === 'bell' && can('CALL_ULTIMA')) return { action: { t: 'CALL_ULTIMA' } };
  if (intent.kind !== 'slot') return {};

  const mine = intent.player === view.you.id;
  if (can('PEEK_INITIAL') && mine) return { peekToggle: intent.slot };
  if (can('EFFECT_TARGET') && ctx.effect) return knownEffectIntent(view, intent, ctx, ctx.effect);
  if (can('EFFECT_TARGET')) {
    if (mine && ctx.swapSource === null && view.phase === 'EFFECT_TARGETING') {
      // Vislumbre propio, o primera mitad del Trueque.
      return {
        action: { t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: intent.slot } },
        swapSource: intent.slot,
      };
    }
    if (!mine && ctx.swapSource !== null) {
      return { action: pairedAction('SWAP', ctx.swapSource, intent) };
    }
    if (!mine) {
      return {
        action: {
          t: 'EFFECT_TARGET',
          target: { kind: 'SPY', player: intent.player, slot: intent.slot },
        },
      };
    }
  }
  if (mine && ctx.swapArmed && can('SWAP_DRAWN')) {
    return { action: { t: 'SWAP_DRAWN', slot: intent.slot } };
  }
  if (mine && can('MATCH_ATTEMPT')) return { action: { t: 'MATCH_ATTEMPT', slot: intent.slot } };
  // Salvaje: `giveSlot` se omite y el servidor regala tu primer slot ocupado.
  if (!mine && ctx.wild && can('MATCH_ATTEMPT')) {
    return { action: { t: 'MATCH_ATTEMPT', slot: intent.slot, owner: intent.player } };
  }
  return {};
}

/** Las dos cartas a elegir del Doble Robo, solo si el servidor admite la elección. */
export function doubleDrawChoice(view: PlayerView): number[] | undefined {
  if (!view.legal.includes('DOUBLE_DRAW_KEEP')) return undefined;
  return view.drawnChoice && view.drawnChoice.length === 2 ? view.drawnChoice : undefined;
}

export function doubleDrawKeepAction(view: PlayerView, index: number): ClientAction | undefined {
  if (!doubleDrawChoice(view) || (index !== 0 && index !== 1)) return undefined;
  return { t: 'DOUBLE_DRAW_KEEP', index };
}

export function doubleDrawKeyIndex(key: string): 0 | 1 | undefined {
  const i = DOUBLE_DRAW_KEYS.indexOf(key as (typeof DOUBLE_DRAW_KEYS)[number]);
  return i === 0 || i === 1 ? i : undefined;
}

export interface HintState {
  effect?: EffectKind | undefined;
  step?: 1 | 2 | undefined;
  swapSource: number | null;
  rumbleFirst?: SlotRef | null | undefined;
}

/** Clave i18n de la instrucción que toca ahora (si hay alguna). */
export function effectHintKey(view: PlayerView, hs: HintState): TKey | undefined {
  if (doubleDrawChoice(view)) return 'hintDoubleDraw';
  if (view.legal.includes('EFFECT_TARGET')) {
    const picked = hs.swapSource !== null;
    switch (hs.effect) {
      case 'PEEK':
        return 'hintPeek';
      case 'SPY':
        return 'hintSpy';
      case 'SWAP':
        return picked ? 'hintSwapRival' : 'hintSwapOwn';
      case 'SHARED_EYE':
        return picked ? 'hintSharedRival' : 'hintSharedOwn';
      case 'RUMBLE':
        if (!hs.rumbleFirst) return 'hintRumbleFirst';
        return hs.rumbleFirst.player === view.you.id ? 'hintRumbleSecondRival' : 'hintRumbleSecond';
      case 'SEER':
        if (hs.step === 2) return picked ? 'hintSeerSwapRival' : 'hintSeerSwapOwn';
        return 'hintSeerLook';
      default:
        return 'targetPrompt';
    }
  }
  if (view.phase === 'STEAL_WINDOW' && view.effect) {
    if (view.effect.owner === view.you.id) return 'hintStealOwner';
    if (view.legal.includes('MATCH_ATTEMPT')) return 'hintStealOpen';
  }
  return undefined;
}
