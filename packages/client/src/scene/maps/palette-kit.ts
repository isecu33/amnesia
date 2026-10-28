/**
 * Colores fijos de todas las paletas (D-044): marfil de las cartas, místico,
 * peligro y luz de vela no cambian entre mapas, y tampoco el «kit» que mantiene
 * legibles pelajes y caras de tótem. Cada mapa suma los suyos hasta 24–32.
 */
export const IVORY = 0xf2e8d5;
export const MYSTIC = 0x7be0c8;
export const DANGER = 0xe0565b;
export const CANDLE_LIGHT = 0xffb35c;
/** versiones daltónicas (docs/01 §11) */
export const MYSTIC_CB = 0x4da6ff;
export const DANGER_CB = 0xff8c1a;

export const FIXED_COLORS = [IVORY, MYSTIC, DANGER, CANDLE_LIGHT] as const;

export const PALETTE_MIN = 24;
export const PALETTE_MAX = 32;

/** Pelajes, madera, avisos y rampa de las caras: lo mínimo para no romper personajes ni cartas. */
export const PALETTE_KIT: readonly number[] = [
  IVORY,
  MYSTIC,
  DANGER,
  CANDLE_LIGHT,
  MYSTIC_CB,
  0x0b0912,
  0x2c1a12,
  0x5b3b2a,
  0x8c6239,
  0xb98a55,
  0xe8d4a8,
  0xd8682a,
  0x8e3a1a,
  0xffd23f,
  0xb48cff,
  0x8d8f94,
  0x3a9a8a,
  0x3f8f4f,
];

/** Kit + colores propios del mapa, sin repetidos y en orden estable. */
export function makePalette(own: readonly number[]): number[] {
  return [...new Set([...PALETTE_KIT, ...own])];
}
