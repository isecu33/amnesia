/**
 * Animales totémicos de los personajes (docs/01 §11, D-042). Datos puros: la
 * geometría vive en `characters.ts`. Diseños propios, sin parecido buscado con
 * ningún juego: cada uno se reconoce por su silueta (rasgo de la cabeza) y color.
 */
import { AVATAR_SPECIES, SPECIES_IDS, type SpeciesId } from '@totem/protocol';

export { AVATAR_SPECIES, SPECIES_IDS, type SpeciesId };

export interface Species {
  id: SpeciesId;
  /** rasgo de silueta que lo distingue a distancia */
  silhouette: 'tufts' | 'pointy-ears' | 'round-ears' | 'antlers' | 'hood' | 'beak';
  fur: number;
  furDark: number;
  belly: number;
  eye: number;
  /** máscara / pintura ritual en la cara */
  mark: number;
  /** escala del cuerpo: el oso es ancho, la serpiente estrecha */
  bulk: number;
  headScale: number;
  /** atuendo tribal (tela, cuero, vendas y metal); solo las especies vestidas lo llevan */
  garb?: { cloth: number; leather: number; wrap: number; metal: number };
}

export const SPECIES: Record<SpeciesId, Species> = {
  owl: {
    id: 'owl',
    silhouette: 'tufts',
    fur: 0x8a6a4a,
    furDark: 0x5a4030,
    belly: 0xe8d4a8,
    eye: 0xffd23f,
    mark: 0xf2e8d5,
    bulk: 1.05,
    headScale: 1.1,
  },
  fox: {
    id: 'fox',
    silhouette: 'pointy-ears',
    fur: 0xd8682a,
    furDark: 0x8e3a1a,
    belly: 0xf6e7d0,
    eye: 0x7be0c8,
    mark: 0x2a1c18,
    bulk: 0.92,
    headScale: 1,
  },
  bear: {
    id: 'bear',
    silhouette: 'round-ears',
    fur: 0x5b3b2c,
    furDark: 0x36211a,
    belly: 0x7d5642,
    eye: 0x14101c,
    mark: 0x7a5d4c,
    bulk: 1.25,
    headScale: 1.15,
    garb: { cloth: 0x4b5430, leather: 0x4a2a22, wrap: 0xbdae9d, metal: 0x8d8f94 },
  },
  deer: {
    id: 'deer',
    silhouette: 'antlers',
    fur: 0xb98a55,
    furDark: 0x7a5530,
    belly: 0xf2e8d5,
    eye: 0x2a1c18,
    mark: 0x7be0c8,
    bulk: 0.95,
    headScale: 0.95,
  },
  snake: {
    id: 'snake',
    silhouette: 'hood',
    fur: 0x3f8f4f,
    furDark: 0x225a32,
    belly: 0xd8d27a,
    eye: 0xe0565b,
    mark: 0xd8d27a,
    bulk: 0.85,
    headScale: 0.95,
  },
  crow: {
    id: 'crow',
    silhouette: 'beak',
    fur: 0x2c2a44,
    furDark: 0x18162a,
    belly: 0x4e4a78,
    eye: 0xb48cff,
    mark: 0xffb35c,
    bulk: 0.95,
    headScale: 1,
  },
};

/** Lo que ofrece Home: un retrato por animal y el índice de avatar que lo representa. */
export const AVATAR_CHOICES: { avatar: number; species: SpeciesId }[] = SPECIES_IDS.map(
  (species) => ({ species, avatar: AVATAR_SPECIES.indexOf(species) }),
);

/**
 * Respaldo para bots y sesiones antiguas (D-045): una especie por asiento, en
 * orden; respeta el avatar y, si ya está cogida, toma la siguiente libre. Con
 * servidor v2 cada asiento trae su `species` y esto solo cubre los que no.
 */
export function assignSpecies(
  avatars: readonly number[],
  reserved: readonly (SpeciesId | undefined)[] = [],
): SpeciesId[] {
  const taken = new Set<SpeciesId>(reserved.flatMap((s) => (s ? [s] : [])));
  return avatars.map((avatar, i) => {
    const fixed = reserved[i];
    if (fixed) return fixed;
    const preferred = AVATAR_SPECIES[avatar] ?? SPECIES_IDS[0];
    const start = SPECIES_IDS.indexOf(preferred);
    for (let k = 0; k < SPECIES_IDS.length; k++) {
      const s = SPECIES_IDS[(start + k) % SPECIES_IDS.length];
      if (s && !taken.has(s)) {
        taken.add(s);
        return s;
      }
    }
    return preferred; // más de 6 asientos: imposible por reglas (docs/01 §9)
  });
}

/** Especie de cada asiento de la sala: la reservada en el servidor o, si falta, el respaldo. */
export function seatSpecies(
  seats: readonly { avatar: number; species?: SpeciesId }[],
): SpeciesId[] {
  return assignSpecies(
    seats.map((s) => s.avatar),
    seats.map((s) => s.species),
  );
}
