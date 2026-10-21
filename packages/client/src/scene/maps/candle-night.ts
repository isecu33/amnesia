/** Mapa 1: claro de bosque nocturno con velas (docs/01 §12). */
import type { MapDescriptor } from './types.js';

export const CANDLE_NIGHT: MapDescriptor = {
  id: 'candle-night',
  mesa: {
    shape: 'round',
    wood: 0x8c6239,
    woodDark: 0x6e4b2a,
    rim: 0x43301c,
    rune: 0x7be0c8,
    stool: 0x43301c,
  },
  fondo: {
    kind: 'forest',
    sky: 0x1b1725,
    skyHorizon: 0x3b3352,
    ground: 0x12301f,
    groundAlt: 0x225a32,
    trees: 46,
    treeColors: [0x12301f, 0x225a32, 0x1d4a48],
    trunk: 0x2c1a12,
    rocks: 14,
    rock: 0x4e4a78,
    fireflies: 40,
    firefly: 0xfff3b0,
    moon: 0xf2e8d5,
    fog: { color: 0x1b1725, near: 4, far: 12 },
  },
  luces: {
    ambient: { color: 0x4e4a78, intensity: 0.9 },
    hemi: { sky: 0x6b6aa8, ground: 0x2c1a12, intensity: 0.8 },
    moon: { color: 0xa9b8e8, intensity: 0.9 },
    candle: { color: 0xffb35c, intensity: 3.2, distance: 3.6 },
  },
  // 32 colores: noche, madera, vela, místico, bosque, pelajes y avisos.
  paleta: [
    0x0b0912, 0x1b1725, 0x2a2438, 0x3b3352, 0x4e4a78, 0x6b6aa8, 0xa9b8e8, 0xf2e8d5, 0x2c1a12,
    0x43301c, 0x6e4b2a, 0x8c6239, 0xb98a55, 0xe8d4a8, 0xffb35c, 0xffd23f, 0xfff3b0, 0xd8682a,
    0x8e3a1a, 0xe0565b, 0x7a2838, 0x7be0c8, 0x3a9a8a, 0x1d4a48, 0x12301f, 0x225a32, 0x3f8f4f,
    0x8fc25a, 0xd8d27a, 0x5b3b2a, 0xb48cff, 0x4da6ff,
  ],
  ambiente: { sound: 'night-forest' },
};
