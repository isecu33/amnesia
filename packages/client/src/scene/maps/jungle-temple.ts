/** Mapa 3: templo en la selva, piedra con musgo y ruinas (D-044). */
import type { MapDescriptor } from './types.js';
import { CANDLE_LIGHT, makePalette } from './palette-kit.js';

export const JUNGLE_TEMPLE: MapDescriptor = {
  id: 'jungle-temple',
  mesa: {
    shape: 'hex',
    material: 'stone',
    wood: 0x5f6b55,
    woodDark: 0x3a4636,
    rim: 0x3a4636,
    rune: 0x3a9a8a,
    stool: 0x3a4636,
  },
  fondo: {
    scenery: 'jungle',
    skyKind: 'dusk',
    groundKind: 'moss',
    sky: 0x1d3b3a,
    skyHorizon: 0x3f6b4a,
    ground: 0x1b4a2c,
    groundAlt: 0x2f7a3a,
    groundDetail: 0x9acd5c,
    trees: 36,
    treeRing: { min: 4.6, range: 5 },
    treeColors: [0x1b4a2c, 0x2f7a3a, 0x5aa04a],
    trunk: 0x6b4a2a,
    rockKind: 'ruin',
    rocks: 14,
    rock: 0x5f6b55,
    accent: { kind: 'pillars', count: 7, colors: [0x8f9b7e, 0x5f6b55] },
    motes: { count: 44, color: 0x9acd5c, size: 0.05, mode: 'orbit' },
    celestial: { color: 0xffd23f, size: 1.6, x: 7, y: 8 },
    stars: 0,
    fog: { color: 0x2a4a3c, near: 4.5, far: 12 },
  },
  luces: {
    ambient: { color: 0x3f6b4a, intensity: 0.8 },
    hemi: { sky: 0x8f9b7e, ground: 0x1b4a2c, intensity: 0.9 },
    moon: { color: 0xf6d9a0, intensity: 1.2 },
    candle: { color: CANDLE_LIGHT, intensity: 2.2, distance: 2.6 },
  },
  paleta: makePalette([
    0x0f2a1c, 0x1b4a2c, 0x2f7a3a, 0x5aa04a, 0x9acd5c, 0x3a4636, 0x5f6b55, 0x8f9b7e, 0x1d3b3a,
    0x3f6b4a, 0xc9a227, 0x6b4a2a,
  ]),
  ambiente: { sound: 'night-forest' },
};
