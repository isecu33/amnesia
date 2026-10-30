import type { TKey } from '../i18n/index.js';
import type { SpeciesId } from '../scene/species.js';

/** Clave i18n del nombre de cada animal (Home y sala). */
export const SPECIES_NAME: Record<SpeciesId, TKey> = {
  owl: 'totemOwl',
  fox: 'totemFox',
  bear: 'totemBear',
  deer: 'totemDeer',
  snake: 'totemSnake',
  crow: 'totemCrow',
};
