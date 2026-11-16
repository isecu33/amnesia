/**
 * Modelo puro de «elegir y luego confirmar» para Sustituir (C2/E2): no hay slot por
 * defecto; tocar un slot lo marca, tocarlo otra vez (o Esc) lo suelta; «Sustituir»
 * solo vale con un slot elegido. Solo cuenta lo público: la posición, nunca el valor (I2).
 */
import type { PlayerView } from '@totem/core';

/** ¿Estoy resolviendo una carta robada (sustituir es legal)? */
export const isSwapPhase = (view: PlayerView): boolean => view.legal.includes('SWAP_DRAWN');

/** Un slot es elegible si sigue oculto (los huecos no se compactan, E21). */
export const isSelectableSlot = (view: PlayerView, slot: number): boolean =>
  view.you.slots[slot] === 'hidden';

/** Tocar `slot`: lo elige; si ya era el elegido, lo suelta; un hueco no hace nada. */
export function toggleSlotSelection(
  view: PlayerView,
  current: number | undefined,
  slot: number,
): number | undefined {
  if (!isSelectableSlot(view, slot)) return current;
  return current === slot ? undefined : slot;
}

/** La selección que sobrevive a una nueva vista: se suelta si ya no es elegible o no toca sustituir. */
export function sanitizeSelection(view: PlayerView, current: number | undefined): number | undefined {
  if (current === undefined) return undefined;
  return isSelectableSlot(view, current) ? current : undefined;
}

export interface SwapState {
  /** sustituir es una acción legal ahora */
  legal: boolean;
  /** el botón se puede pulsar: legal y con un slot elegido */
  enabled: boolean;
  /** número de slot visible (1-8) del elegido */
  slotNumber?: number;
  /** slot (0-7) a enviar en SWAP_DRAWN */
  slot?: number;
}

export function swapState(view: PlayerView, selected: number | undefined): SwapState {
  const legal = isSwapPhase(view);
  if (!legal) return { legal: false, enabled: false };
  if (selected === undefined || !isSelectableSlot(view, selected)) {
    return { legal: true, enabled: false };
  }
  return { legal: true, enabled: true, slot: selected, slotNumber: selected + 1 };
}

/**
 * Tocar en el canvas: tu propio slot SIEMPRE solo elige (pickSlot), nunca manda
 * MATCH_ATTEMPT (Descarte Rápido accidental = castigo, §6). Lo demás sigue su intención.
 */
export function ownSlotTapAction(
  view: PlayerView,
  intent: { kind: string; player?: string },
): 'select' | 'intent' {
  return intent.kind === 'slot' && intent.player === view.you.id ? 'select' : 'intent';
}
