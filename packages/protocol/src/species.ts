/**
 * Elenco de animales de las marionetas (D-042, D-045). Vive en el protocolo
 * porque el servidor reserva uno por jugador y el cliente lo dibuja.
 */
import { z } from 'zod';

export const SPECIES_IDS = ['owl', 'fox', 'bear', 'deer', 'snake', 'crow'] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];
export const SpeciesIdSchema = z.enum(SPECIES_IDS);

/**
 * Los 12 índices de avatar que acepta `hello` (0–11) → especie. Los más
 * antiguos eran emojis; se mantienen para sesiones guardadas y como preferencia
 * inicial al entrar en la sala.
 */
export const AVATAR_SPECIES: readonly SpeciesId[] = [
  'owl',
  'fox',
  'snake',
  'bear',
  'bear',
  'deer',
  'deer',
  'deer',
  'fox',
  'crow',
  'owl',
  'crow',
];

/** Especie preferida de un avatar; un índice desconocido cae en la primera. */
export function speciesOfAvatar(avatar: number): SpeciesId {
  return AVATAR_SPECIES[avatar] ?? SPECIES_IDS[0];
}

/**
 * Primera especie libre empezando por `preferred` y dando la vuelta al elenco;
 * `undefined` si están todas cogidas (imposible con ≤ 6 asientos).
 */
export function firstFreeSpecies(
  taken: ReadonlySet<SpeciesId>,
  preferred: SpeciesId = SPECIES_IDS[0],
): SpeciesId | undefined {
  const start = SPECIES_IDS.indexOf(preferred);
  for (let k = 0; k < SPECIES_IDS.length; k++) {
    const s = SPECIES_IDS[(start + k) % SPECIES_IDS.length];
    if (s && !taken.has(s)) return s;
  }
  return undefined;
}
