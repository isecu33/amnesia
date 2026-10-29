/** Mapa 4: marisma con niebla densa y fuegos fatuos (D-044). */
import type { MapDescriptor } from './types.js';
import { CANDLE_LIGHT, MYSTIC, makePalette } from './palette-kit.js';

export const FOG_MARSH: MapDescriptor = {
  id: 'fog-marsh',
  mesa: {
    shape: 'round',
    material: 'mossy-wood',
    wood: 0x4b3a2a,
    woodDark: 0x2f403c,
    rim: 0x141c1c,
    rune: 0x3a9a8a,
    stool: 0x141c1c,
  },
  fondo: {
    scenery: 'dead-trees',
    skyKind: 'murk',
    groundKind: 'water',
    sky: 0x2f403c,
    skyHorizon: 0x7a8a7c,
    ground: 0x2f403c,
    groundAlt: 0x3b4a2a,
    groundDetail: 0x6a8a8a,
    trees: 30,
    treeRing: { min: 4.4, range: 5 },
    treeColors: [0x141c1c, 0x3b4a2a, 0x5a6e3a],
    trunk: 0x2f403c,
    rockKind: 'rock',
    rocks: 10,
    rock: 0x3b4a2a,
    accent: { kind: 'reeds', count: 90, colors: [0x5a6e3a, 0x8a9a4a] },
    motes: { count: 14, color: MYSTIC, size: 0.085, mode: 'orbit' },
    celestial: { color: 0xa9b8a4, size: 1.3, x: -5, y: 8 },
    stars: 0,
    fog: { color: 0x7a8a7c, near: 3.2, far: 8.5 },
  },
  luces: {
    ambient: { color: 0x5f6b66, intensity: 0.8 },
    hemi: { sky: 0xa9b8a4, ground: 0x2f403c, intensity: 0.85 },
    moon: { color: 0xa9b8a4, intensity: 0.9 },
    candle: { color: CANDLE_LIGHT, intensity: 2.2, distance: 2.6 },
  },
  paleta: makePalette([
    0x141c1c, 0x1f2b2a, 0x2f403c, 0x4a5a52, 0x7a8a7c, 0xa9b8a4, 0x3b4a2a, 0x5a6e3a, 0x8a9a4a,
    0x4b3a2a, 0x6a8a8a, 0x2a2a3a,
  ]),
  ambiente: { sound: 'night-forest' },
};
