/**
 * Modelo puro de la barra 2D de slots y de la lista de acciones (docs/01 §11,
 * D-042). La barra refleja tus slots por posición y NUNCA lleva valores: olvidar
 * es la mecánica central. Única excepción: la vista privada en curso de tu slot.
 */
import type { ActionType, PlayerView } from '@totem/core';
import type { TKey } from '../i18n/index.js';

export interface SlotCell {
  index: number;
  state: 'hidden' | 'empty';
  legal: boolean;
  selected: boolean;
  sealed: boolean;
  /** segundos de bloqueo tras un fallo de Descarte Rápido (0 = libre) */
  lockedSeconds: number;
  /** SOLO durante la vista privada de este slot */
  value?: number;
}

export interface SlotBarContext {
  selected?: number;
  reveal?: { player: string; slot: number; value: number };
}

const SLOT_ACTIONS: ActionType[] = ['MATCH_ATTEMPT', 'SWAP_DRAWN', 'PEEK_INITIAL', 'EFFECT_TARGET'];

export function slotBarModel(view: PlayerView, ctx: SlotBarContext): SlotCell[] {
  const slotLegal = SLOT_ACTIONS.some((a) => view.legal.includes(a));
  const locked = Math.ceil(Math.max(0, view.you.lockedForMs) / 1000);
  return view.you.slots.map((state, index) => {
    const cell: SlotCell = {
      index,
      state,
      legal: slotLegal && state === 'hidden',
      selected: ctx.selected === index,
      sealed: view.you.sealed,
      lockedSeconds: locked,
    };
    const r = ctx.reveal;
    if (r && r.player === view.you.id && r.slot === index && state === 'hidden') {
      return { ...cell, value: r.value };
    }
    return cell;
  });
}

/** A/D: siguiente slot ocupado en la dirección `dir`, dando la vuelta. */
export function moveSelection(
  view: PlayerView,
  current: number | undefined,
  dir: 1 | -1,
): number | undefined {
  const n = view.you.slots.length;
  if (n === 0) return undefined;
  let i = current ?? (dir > 0 ? -1 : n);
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (view.you.slots[i] === 'hidden') return i;
  }
  return current;
}

export interface ActionEntry {
  id: ActionType;
  label: TKey;
  /** tecla (código de `KeyboardEvent.key`, en minúscula) */
  key: string;
}

/** Acciones que se lanzan con botón/tecla; las de slot van por la barra. */
const ACTIONS: ActionEntry[] = [
  { id: 'DRAW_DECK', label: 'drawDeck', key: 'r' },
  { id: 'DRAW_DISCARD', label: 'drawDiscard', key: 'f' },
  { id: 'DISCARD_DRAWN', label: 'discardDrawn', key: 'x' },
  { id: 'SWAP_DRAWN', label: 'swapHint', key: 's' },
  { id: 'EFFECT_SKIP', label: 'skipEffect', key: 'o' },
  { id: 'PEEK_INITIAL', label: 'confirmPeek', key: 'enter' },
  { id: 'CALL_ULTIMA', label: 'callUltima', key: 'u' },
];

export function actionList(view: PlayerView): ActionEntry[] {
  return ACTIONS.filter((a) => view.legal.includes(a.id));
}
