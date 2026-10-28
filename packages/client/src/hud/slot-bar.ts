/**
 * Lógica pura de teclado: selección de slots (A/D) y lista de acciones legales
 * con su tecla (docs/01 §11). Los valores nunca salen de aquí: olvidar es la
 * mecánica central; la vista privada se enseña en la carta 3D.
 */
import type { ActionType, PlayerView } from '@totem/core';
import type { TKey } from '../i18n/index.js';

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
