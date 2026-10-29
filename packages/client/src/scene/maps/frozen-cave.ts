/** Mapa 2: cueva helada de cristales y estalactitas (D-044). */
import type { MapDescriptor } from './types.js';
import { CANDLE_LIGHT, makePalette } from './palette-kit.js';

export const FROZEN_CAVE: MapDescriptor = {
  id: 'frozen-cave',
  mesa: {
    shape: 'octagon',
    material: 'ice',
    wood: 0x7fb0d0,
    woodDark: 0x4a78a0,
    rim: 0x2b4a6e,
    rune: 0x1d3d52,
    stool: 0x2b4a6e,
  },
  fondo: {
    scenery: 'stalagmites',
    skyKind: 'cave',
    groundKind: 'ice',
    sky: 0x0e1a2b,
    skyHorizon: 0x1a2f4a,
    ground: 0x24384a,
    groundAlt: 0x35506a,
    groundDetail: 0x7fb0d0,
    trees: 40,
    treeRing: { min: 4.2, range: 5 },
    treeColors: [0x4a78a0, 0x7fb0d0, 0x2b4a6e],
    trunk: 0x24384a,
    rockKind: 'crystal',
    rocks: 16,
    rock: 0x9a8fc4,
    accent: { kind: 'stalactites', count: 34, colors: [0x6d8aa8, 0xbfe3f2] },
    motes: { count: 50, color: 0xe8f6fb, size: 0.045, mode: 'fall' },
    celestial: { color: 0xbfe3f2, size: 0, x: 0, y: 0 },
    stars: 0,
    fog: { color: 0x0e1a2b, near: 4.5, far: 13 },
  },
  luces: {
    ambient: { color: 0x35506a, intensity: 0.85 },
    hemi: { sky: 0x7fb0d0, ground: 0x1a2f4a, intensity: 0.9 },
    moon: { color: 0xbfe3f2, intensity: 1.0 },
    candle: { color: CANDLE_LIGHT, intensity: 2.2, distance: 2.6 },
  },
  paleta: makePalette([
    0x0e1a2b, 0x1a2f4a, 0x2b4a6e, 0x4a78a0, 0x7fb0d0, 0xbfe3f2, 0xe8f6fb, 0x35506a, 0x24384a,
    0x6d8aa8, 0x9a8fc4, 0x1d3d52,
  ]),
  ambiente: { sound: 'night-forest' },
};
