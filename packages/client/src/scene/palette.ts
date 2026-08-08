/** Paleta y tipografías — docs/01 §12. Con variante daltónica (docs/01 §11). */
export interface Palette {
  bg: number;
  woodDark: number;
  woodLight: number;
  candle: number;
  mystic: number;
  danger: number;
  ivory: number;
}

export const PALETTE: Palette = {
  bg: 0x1b1725,
  woodDark: 0x6e4b2a,
  woodLight: 0x8c6239,
  candle: 0xffb35c,
  mystic: 0x7be0c8,
  danger: 0xe0565b,
  ivory: 0xf2e8d5,
};

/** Daltónico: azul/naranja en vez de verde/rojo, siempre con patrón + número. */
export const PALETTE_CB: Palette = {
  ...PALETTE,
  mystic: 0x4da6ff,
  danger: 0xff8c1a,
};

export const paletteFor = (colorBlind: boolean): Palette => (colorBlind ? PALETTE_CB : PALETTE);

/** Rampa de 14 tonos para las caras de los tótems (valor 0..13). */
export function faceColor(value: number, colorBlind: boolean): string {
  const t = Math.max(0, Math.min(13, value)) / 13;
  // 0 = frío (bueno), 13 = cálido (malo). En daltónico se abre el rango de luminancia.
  const hue = colorBlind ? 210 - t * 40 : 170 - t * 170;
  const light = colorBlind ? 78 - t * 45 : 62 - t * 14;
  return `hsl(${hue}, ${colorBlind ? 55 : 45}%, ${light}%)`;
}

/** Patrón de textura por valor: nunca solo color (requisito duro de accesibilidad). */
export const FACE_PATTERNS = [
  'dots1',
  'dots2',
  'dots3',
  'dots4',
  'bars1',
  'bars2',
  'bars3',
  'cross',
  'grid',
  'rings',
  'zigzag',
  'triangles',
  'diamonds',
  'star',
] as const;
export const patternFor = (value: number): string =>
  FACE_PATTERNS[Math.max(0, Math.min(13, value))] as string;
