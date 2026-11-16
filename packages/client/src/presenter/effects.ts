/**
 * Identidad de cada efecto (docs/06 principio 2): color, icono, leitmotiv y VFX
 * propios. DATO PURO: timelines, banner, subtítulos y audio leen de aquí, así un
 * efecto nuevo se da de alta en un solo sitio y el mapeo se testea sin WebGL.
 */
import type { EffectKind, GameEvent, OmenId } from '@totem/core';

/**
 * Lo que `EFFECT_RESOLVED.effect` puede traer: el tipo del objetivo resuelto
 * (core/effects.ts), que para el Vidente distingue sus dos pasos.
 */
export type ResolvedEffect =
  'PEEK' | 'SPY' | 'SWAP' | 'SHARED_EYE' | 'RUMBLE' | 'SEER_LOOK' | 'SEER_SWAP';

const RESOLVED: readonly ResolvedEffect[] = [
  'PEEK',
  'SPY',
  'SWAP',
  'SHARED_EYE',
  'RUMBLE',
  'SEER_LOOK',
  'SEER_SWAP',
];

export const EFFECT_KINDS: readonly EffectKind[] = [
  'PEEK',
  'DOUBLE_DRAW',
  'SPY',
  'SHARED_EYE',
  'SWAP',
  'RUMBLE',
  'SEER',
];

/** `EFFECT_RESOLVED.effect` es `string` en core: se estrecha aquí, sin `=== 'SWAP'` sueltos. */
export function isResolvedEffect(s: string): s is ResolvedEffect {
  return (RESOLVED as readonly string[]).includes(s);
}

export function effectKindOf(r: ResolvedEffect): EffectKind {
  return r === 'SEER_LOOK' || r === 'SEER_SWAP' ? 'SEER' : r;
}

/** Efecto de un `EFFECT_RESOLVED`, o undefined si el servidor trae algo desconocido. */
export function resolvedOf(e: GameEvent): ResolvedEffect | undefined {
  return e.e === 'EFFECT_RESOLVED' && isResolvedEffect(e.effect) ? e.effect : undefined;
}

/** Tonos propios de cada efecto (hex), aparte de la paleta base (místico/vela/peligro). */
export const EFFECT_COLORS: Record<EffectKind, number> = {
  PEEK: 0xffb35c, // vela cálida
  DOUBLE_DRAW: 0xf2a03c, // ámbar
  SPY: 0x7be0c8, // cuervo espectral
  SHARED_EYE: 0x9fb8ff, // ojo místico
  SWAP: 0xb8b4c8, // humo
  RUMBLE: 0x8fd8a8, // torbellino
  SEER: 0xa070e0, // chamán púrpura
};

/** Icono pixel de 7×7 (# = lleno). Se pinta igual en todo el juego: nunca solo color. */
export const EFFECT_ICONS: Record<EffectKind, readonly string[]> = {
  // vela con llama
  PEEK: ['...#...', '..###..', '...#...', '..###..', '..###..', '..###..', '.#####.'],
  // dos cartas
  DOUBLE_DRAW: ['####...', '#..#...', '#.####.', '#.#..#.', '###..#.', '..#..#.', '..####.'],
  // cuervo
  SPY: ['.......', '##...##', '.##.##.', '..###..', '..#.#..', '.......', '.......'],
  // ojo
  SHARED_EYE: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
  // flechas cruzadas
  SWAP: ['#....#.', '.#..#..', '..##...', '..##...', '.#..#..', '#....#.', '.......'],
  // espiral
  RUMBLE: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.#####', '.......'],
  // ojo + flechas
  SEER: ['..###..', '.#.#.#.', '..###..', '.......', '#.....#', '.#...#.', '#.....#'],
};

/** Icono pixel de cada presagio: Conejo (Prisa), Tortuga (Calma), Luciérnaga (Destello). */
export const OMEN_ICONS: Record<OmenId, readonly string[]> = {
  HASTE: ['.#.#...', '.#.#...', '.###...', '#####..', '######.', '.####..', '.#..#..'],
  CALM: ['.......', '..###..', '.#####.', '#######', '.#.#.#.', '.......', '.......'],
  FLASH: ['#.....#', '.#...#.', '...#...', '..###..', '...#...', '.#...#.', '#.....#'],
};
