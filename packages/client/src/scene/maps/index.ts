/** Registro de mapas de v1 (D-044): los elige el anfitrión en la sala. */
import { CANDLE_NIGHT } from './candle-night.js';
import { FOG_MARSH } from './fog-marsh.js';
import { FROZEN_CAVE } from './frozen-cave.js';
import { JUNGLE_TEMPLE } from './jungle-temple.js';
import { TOTEM_CANYON } from './totem-canyon.js';
import { DANGER, DANGER_CB, MYSTIC, MYSTIC_CB } from './palette-kit.js';
import type { MapDescriptor, MapId } from './types.js';

export type { MapDescriptor, MapId } from './types.js';

export const MAPS: Record<MapId, MapDescriptor> = {
  'candle-night': CANDLE_NIGHT,
  'frozen-cave': FROZEN_CAVE,
  'jungle-temple': JUNGLE_TEMPLE,
  'fog-marsh': FOG_MARSH,
  'totem-canyon': TOTEM_CANYON,
};
export const DEFAULT_MAP: MapId = 'candle-night';

export function getMap(id: string | undefined): MapDescriptor {
  return id !== undefined && Object.hasOwn(MAPS, id) ? MAPS[id as MapId] : MAPS[DEFAULT_MAP];
}

/** Variante daltónica: místico y peligro a azul/naranja (docs/01 §11). */
export function paletteForMap(map: MapDescriptor, colorBlind: boolean): number[] {
  if (!colorBlind) return [...map.paleta];
  return map.paleta.map((c) => (c === MYSTIC ? MYSTIC_CB : c === DANGER ? DANGER_CB : c));
}

/** Selección pura: id recibido del servidor + ajuste daltónico → descriptor y paleta. */
export function selectMap(
  id: string | undefined,
  colorBlind: boolean,
): { map: MapDescriptor; palette: number[] } {
  const map = getMap(id);
  return { map, palette: paletteForMap(map, colorBlind) };
}
