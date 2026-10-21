/** Selección por teclado de los slots de un rival (Espionaje y Trueque). */
import type { PlayerView } from '@totem/core';
import type { Intent } from '../scene/world.js';

type Rival = PlayerView['others'][number];

/** Rivales a los que se puede apuntar: sin sellar y con algún tótem oculto (E10/E12/E21). */
export function targetableRivals(view: PlayerView): Rival[] {
  return view.others.filter((o) => !o.sealed && o.slots.some((s) => s === 'hidden'));
}

/** Siguiente (+1) o anterior (-1) rival apuntable, dando la vuelta. */
export function cycleRival(
  view: PlayerView,
  current: string | undefined,
  dir: 1 | -1,
): string | undefined {
  const list = targetableRivals(view);
  if (list.length === 0) return undefined;
  const i = list.findIndex((r) => r.id === current);
  if (i === -1) return (dir === 1 ? list[0] : list[list.length - 1])?.id;
  return list[(i + dir + list.length) % list.length]?.id;
}

/** Intención de apuntar al slot `slot` del rival `rivalId`, si es válida. */
export function rivalSlotIntent(
  view: PlayerView,
  rivalId: string | undefined,
  slot: number,
): Intent | undefined {
  const rival = targetableRivals(view).find((r) => r.id === rivalId);
  if (!rival || rival.slots[slot] !== 'hidden') return undefined;
  return { kind: 'slot', player: rival.id, slot };
}
