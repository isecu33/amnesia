/** Registro de mapas. v1 prevé 3 elegidos por el anfitrión; hoy solo existe uno. */
import { CANDLE_NIGHT } from './candle-night.js';
import type { MapDescriptor, MapId } from './types.js';

export type { MapDescriptor, MapId } from './types.js';

export const MAPS: Record<MapId, MapDescriptor> = { 'candle-night': CANDLE_NIGHT };
export const DEFAULT_MAP: MapId = 'candle-night';

export function getMap(id: string | undefined): MapDescriptor {
  return (id && id in MAPS ? MAPS[id as MapId] : undefined) ?? MAPS[DEFAULT_MAP];
}

/** Variante daltónica: místico y peligro a azul/naranja (docs/01 §11). */
export function paletteForMap(map: MapDescriptor, colorBlind: boolean): number[] {
  if (!colorBlind) return [...map.paleta];
  return map.paleta.map((c) => (c === 0x7be0c8 ? 0x4da6ff : c === 0xe0565b ? 0xff8c1a : c));
}
