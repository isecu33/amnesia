/** Mapa 5: cañón de tótems al atardecer (D-044). */
import type { MapDescriptor } from './types.js';
import { CANDLE_LIGHT, makePalette } from './palette-kit.js';

export const TOTEM_CANYON: MapDescriptor = {
  id: 'totem-canyon',
  mesa: {
    shape: 'octagon',
    material: 'carved',
    wood: 0x9a5a38,
    woodDark: 0x6a3a28,
    rim: 0x3a2018,
    rune: 0x2b6a6a,
    stool: 0x3a2018,
  },
  fondo: {
    scenery: 'mesas',
    skyKind: 'dusk',
    groundKind: 'sand',
    sky: 0x4a2a4a,
    skyHorizon: 0xe89050,
    ground: 0x9a5a38,
    groundAlt: 0xc2603a,
    groundDetail: 0xd9b36a,
    trees: 22,
    treeRing: { min: 6.2, range: 4.5 },
    treeColors: [0x6a3a28, 0x9a5a38, 0xc2603a],
    trunk: 0x3a2018,
    rockKind: 'rock',
    rocks: 16,
    rock: 0x8c4a4a,
    accent: { kind: 'totems', count: 8, colors: [0x6a3a28, 0x2b6a6a] },
    motes: { count: 36, color: 0xd9b36a, size: 0.04, mode: 'orbit' },
    celestial: { color: 0xf6d9a0, size: 2.2, x: -3, y: 4 },
    stars: 0,
    fog: { color: 0xc07048, near: 6, far: 16 },
  },
  luces: {
    ambient: { color: 0x8c4a4a, intensity: 0.8 },
    hemi: { sky: 0xe89050, ground: 0x4a2a4a, intensity: 0.9 },
    moon: { color: 0xf6d9a0, intensity: 1.3 },
    candle: { color: CANDLE_LIGHT, intensity: 2.2, distance: 2.6 },
  },
  paleta: makePalette([
    0x1e1020, 0x4a2a4a, 0x8c4a4a, 0xc2603a, 0xe89050, 0xf6d9a0, 0x9a5a38, 0x6a3a28, 0x3a2018,
    0xd9b36a, 0x2b6a6a, 0xc9a227,
  ]),
  ambiente: { sound: 'night-forest' },
};
