/** El mazo de 52 tótems — docs/01 §2 (NORMATIVO). */
import type { Card, CardValue, EffectKind } from './types.js';

/** [valor, copias] exactamente como la tabla de docs/01 §2. */
export const DECK_COMPOSITION: readonly (readonly [CardValue, number])[] = [
  [0, 2],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 4],
  [7, 4],
  [8, 4],
  [9, 4],
  [10, 4],
  [11, 4],
  [12, 4],
  [13, 2],
] as const;

export const DECK_SIZE = 52;

export const CARD_NAMES: Readonly<Record<CardValue, string>> = {
  0: 'Luciérnaga',
  1: 'Ratón',
  2: 'Conejo',
  3: 'Tortuga',
  4: 'Ciervo',
  5: 'Cabra',
  6: 'Jabalí',
  7: 'Búho',
  8: 'Búho Real',
  9: 'Cuervo',
  10: 'Cuervo Blanco',
  11: 'Serpiente',
  12: 'Zorro',
  13: 'Chamán Oscuro',
};

/** Efecto al descartar directamente tras robar del mazo (docs/01 §5). */
export function effectOf(value: CardValue): EffectKind | undefined {
  if (value === 7 || value === 8) return 'PEEK';
  if (value === 9 || value === 10) return 'SPY';
  if (value === 11 || value === 12) return 'SWAP';
  return undefined;
}

/** Mazo ordenado con ids "c00".."c51". */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const [value, copies] of DECK_COMPOSITION) {
    for (let i = 0; i < copies; i++) {
      cards.push({ id: `c${String(cards.length).padStart(2, '0')}`, value });
    }
  }
  return cards;
}
