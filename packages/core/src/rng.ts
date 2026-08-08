/**
 * RNG determinista — docs/02 §3.7.
 * mulberry32(hash(seed, rngCounter)); el contador vive en el estado, así que
 * todo el azar es serializable y reproducible.
 */

export function hashSeed(seed: number, counter: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (counter + 0x6d2b79f5), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(a: number): number {
  let t = (a + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Un número en [0,1) y el contador siguiente. Puro. */
export function nextFloat(seed: number, counter: number): [number, number] {
  return [mulberry32(hashSeed(seed, counter)), counter + 1];
}

/** Entero en [0, maxExclusive). */
export function nextInt(seed: number, counter: number, maxExclusive: number): [number, number] {
  const [f, c] = nextFloat(seed, counter);
  return [Math.floor(f * maxExclusive), c];
}

/** Fisher-Yates puro: devuelve una copia barajada y el contador siguiente. */
export function shuffle<T>(items: readonly T[], seed: number, counter: number): [T[], number] {
  const out = items.slice();
  let c = counter;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, nc] = nextInt(seed, c, i + 1);
    c = nc;
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return [out, c];
}

/** Elige un elemento de forma determinista. Lanza si el array está vacío. */
export function pick<T>(items: readonly T[], seed: number, counter: number): [T, number] {
  if (items.length === 0) throw new Error('pick() sobre un array vacío');
  const [i, c] = nextInt(seed, counter, items.length);
  return [items[i] as T, c];
}
