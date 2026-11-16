/**
 * Fondo pixel de las pantallas previas a la partida (D-042): noche de bosque,
 * mesa de madera, velas y siluetas de los animales. Se pinta por capas sobre
 * lienzos diminutos del mismo tamaño que se apilan y desplazan en parallax
 * (`ui/title/backdrop-loop.ts`). Las capas estáticas se pintan una vez; las
 * animadas (`stars`, `fx`) son funciones puras del tiempo: mismo `t`, mismo píxel.
 */
import { SPECIES_IDS, type SpeciesId } from './species.js';
import { portraitGrid } from './portrait.js';
import { hex, noiseRect, rng, shade } from './pixel.js';
import { PALETTE } from './palette.js';

export const BACKDROP_W = 192;
export const BACKDROP_H = 108;

/** Capas de atrás adelante; `depth` = cuánto se mueven con el parallax (0 = fija). */
export const BACKDROP_LAYERS = [
  { id: 'sky', depth: 0.1, animated: false },
  { id: 'stars', depth: 0.15, animated: true },
  { id: 'far', depth: 0.35, animated: false },
  { id: 'near', depth: 0.6, animated: false },
  { id: 'table', depth: 0.85, animated: false },
  { id: 'fx', depth: 1, animated: true },
] as const;
export type BackdropLayerId = (typeof BACKDROP_LAYERS)[number]['id'];

const P = PALETTE;
/** Cielo: de casi negro (arriba) al fondo de la paleta y un violeta de horizonte. */
const SKY_BANDS = [0.5, 0.68, 1, 1.32, 1.72].map((f) => shade(P.bg, f));
const NIGHT = shade(P.bg, 0.5);
const WOOD_DEEP = shade(P.woodDark, 0.67);
const WOOD_SEAM = shade(P.woodDark, 0.38);
const MOON_RIM = shade(P.ivory, 0.84);
const WAX = shade(P.ivory, 0.95);
const WAX_SHADOW = shade(P.woodLight, 1.3);
const FLAME_CORE = 0xfff0c0;
const TABLE_TOP = 72;
const FOREST_BASE = 66;
const MOON = { x: 148, y: 14, r2: 33 };
const CANDLES = [44, 146] as const;
const STAR_COUNT = 46;
const STAR_ROWS = 38;
const FIREFLY_COUNT = 14;
/** El fx avanza a saltos (estética pixel): un fotograma lógico cada FX_STEP_MS. */
export const FX_STEP_MS = 90;

/** Pinta una cuadrícula de retrato ampliada `scale` veces y tintada (silueta). */
function stamp(
  c: CanvasRenderingContext2D,
  id: SpeciesId,
  x: number,
  y: number,
  scale: number,
  dim: number,
): void {
  portraitGrid(id).forEach((row, gy) =>
    row.forEach((cell, gx) => {
      if (cell === null) return;
      c.fillStyle = hex(shade(cell, dim));
      c.fillRect(x + gx * scale, y + gy * scale, scale, scale);
    }),
  );
}

function paintSky(c: CanvasRenderingContext2D): void {
  // Bandas con una fila de tramado entre cada una.
  const bandH = Math.ceil(TABLE_TOP / SKY_BANDS.length);
  SKY_BANDS.forEach((col, i) => {
    c.fillStyle = hex(col);
    c.fillRect(0, i * bandH, BACKDROP_W, bandH);
    if (i > 0) {
      c.fillStyle = hex(SKY_BANDS[i - 1] as number);
      for (let x = i % 2; x < BACKDROP_W; x += 2) c.fillRect(x, i * bandH, 1, 1);
    }
  });
  // Luna creciente con halo circular tramado (sin rectángulos: solo píxeles de luna y halo).
  c.fillStyle = 'rgba(242,232,213,0.07)';
  for (let y = -12; y <= 12; y++)
    for (let x = -12; x <= 12; x++) {
      const d = x * x + y * y;
      if (d <= MOON.r2 || d > 144 || (x + y) % 2 !== 0) continue;
      c.fillRect(MOON.x + x, MOON.y + y, 1, 1);
    }
  for (let y = -6; y <= 6; y++)
    for (let x = -6; x <= 6; x++) {
      const d = x * x + y * y;
      if (d > MOON.r2) continue;
      // Mordisco de la fase creciente: se deja el cielo a la vista en vez de taparlo con un recuadro.
      if (x >= 3 && x <= 7 && y >= -3 && y <= 1) continue;
      c.fillStyle = hex(d > 22 ? MOON_RIM : P.ivory);
      c.fillRect(MOON.x + x, MOON.y + y, 1, 1);
    }
}

interface Star {
  x: number;
  y: number;
  mystic: boolean;
  phase: number;
}
function stars(seed: number): Star[] {
  const r = rng(seed * 31 + 1);
  return Array.from({ length: STAR_COUNT }, () => ({
    mystic: r() < 0.25,
    x: Math.floor(r() * BACKDROP_W),
    y: Math.floor(r() * STAR_ROWS),
    phase: Math.floor(r() * 64),
  }));
}

/** Estrellas que titilan: cada una se apaga/brilla en su propio ciclo escalonado. */
function paintStars(c: CanvasRenderingContext2D, t: number, seed: number): void {
  c.clearRect(0, 0, BACKDROP_W, BACKDROP_H);
  const frame = Math.floor(t / FX_STEP_MS);
  for (const s of stars(seed)) {
    const k = (frame + s.phase) % 40;
    if (k === 0) continue; // apagada un instante
    const bright = k < 3;
    c.fillStyle = hex(s.mystic ? P.mystic : P.ivory);
    c.globalAlpha = bright ? 1 : 0.55 + (s.phase % 3) * 0.15;
    c.fillRect(s.x, s.y, 1, 1);
    if (bright && s.phase % 4 === 0) {
      c.globalAlpha = 0.45;
      c.fillRect(s.x - 1, s.y, 1, 1);
      c.fillRect(s.x + 1, s.y, 1, 1);
      c.fillRect(s.x, s.y - 1, 1, 1);
      c.fillRect(s.x, s.y + 1, 1, 1);
    }
  }
  c.globalAlpha = 1;
}

function pines(
  c: CanvasRenderingContext2D,
  r: () => number,
  base: number,
  col: number,
  gap: number,
  extra: number,
): void {
  c.fillStyle = hex(col);
  for (let x = -6; x < BACKDROP_W + 8; x += gap) {
    const h = 14 + Math.floor(r() * 12) + extra;
    for (let k = 0; k < h; k++) {
      const w = Math.max(1, Math.floor((k / h) * 6) + 1);
      c.fillRect(x - w, base - h + k, w * 2 + 1, 1);
    }
    c.fillRect(x, base, 1, 4);
  }
}

function paintFar(c: CanvasRenderingContext2D, seed: number): void {
  pines(c, rng(seed + 11), 62, shade(P.bg, 0.75), 9, 0);
}

function paintNear(c: CanvasRenderingContext2D, seed: number): void {
  pines(c, rng(seed + 23), 70, NIGHT, 12, 4);
  c.fillStyle = hex(NIGHT);
  c.fillRect(0, FOREST_BASE, BACKDROP_W, TABLE_TOP - FOREST_BASE);
  // Siluetas de los animales sentados, con la mesa delante.
  const seats: [SpeciesId, number, number][] = [
    [SPECIES_IDS[0] as SpeciesId, 14, 36],
    [SPECIES_IDS[2] as SpeciesId, 70, 28],
    [SPECIES_IDS[3] as SpeciesId, 122, 34],
    [SPECIES_IDS[5] as SpeciesId, 160, 40],
  ];
  for (const [id, x, y] of seats) {
    stamp(c, id, x, y, 2, 0.34);
    c.fillStyle = hex(shade(P.woodDark, 0.33));
    c.fillRect(x - 2, y + 32, 36, 12);
  }
}

function paintTable(c: CanvasRenderingContext2D, seed: number): void {
  noiseRect(c, 0, TABLE_TOP, BACKDROP_W, BACKDROP_H - TABLE_TOP, WOOD_DEEP, P.woodDark, 0.18, seed);
  for (let x = 0; x < BACKDROP_W; x += 24) {
    c.fillStyle = hex(WOOD_SEAM);
    c.fillRect(x, TABLE_TOP, 1, BACKDROP_H - TABLE_TOP);
  }
  c.fillStyle = hex(P.woodLight);
  c.fillRect(0, TABLE_TOP, BACKDROP_W, 1);
  c.fillStyle = hex(WOOD_DEEP);
  for (let x = 0; x < BACKDROP_W; x += 2) c.fillRect(x, TABLE_TOP + 1, 1, 1);
  // Círculo ritual en el centro de la mesa.
  c.fillStyle = hex(P.mystic);
  for (let a = 0; a < 64; a++) {
    if (a % 3 === 0) continue;
    const ang = (a / 64) * Math.PI * 2;
    c.fillRect(Math.round(96 + Math.cos(ang) * 40), Math.round(92 + Math.sin(ang) * 9), 1, 1);
  }
  // Cuerpo de las velas (la llama vive en `fx`).
  for (const x of CANDLES) {
    const y = TABLE_TOP + 6;
    c.fillStyle = hex(WAX);
    c.fillRect(x, y, 3, 9);
    c.fillStyle = hex(WAX_SHADOW);
    c.fillRect(x + 2, y, 1, 9);
  }
}

/** Ruido entero determinista por (fotograma, semilla): sin estado entre llamadas. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function flame(c: CanvasRenderingContext2D, x: number, frame: number, i: number): void {
  const y = TABLE_TOP + 6;
  const n = hash(frame, i);
  const h = 2 + Math.floor(n * 3); // 2..4 px
  const lean = n > 0.82 ? 1 : n < 0.1 ? -1 : 0;
  // Halo escalonado que respira con la llama.
  for (let r = 1; r <= 3; r++) {
    c.fillStyle = `rgba(255,179,92,${(0.07 + n * 0.05) / r})`;
    c.fillRect(x - r * 3, y - 3 - r * 2, 3 + r * 6, 6 + r * 4);
  }
  c.fillStyle = hex(P.candle);
  c.fillRect(x + 1, y - h, 1, h);
  if (lean !== 0) c.fillRect(x + 1 + lean, y - h, 1, 1);
  c.fillStyle = hex(FLAME_CORE);
  c.fillRect(x + 1, y - 2, 1, 1);
}

/** Luciérnagas: deriva lenta en lazo + parpadeo; cálidas cerca de la mesa, místicas arriba. */
function fireflies(c: CanvasRenderingContext2D, t: number, seed: number): void {
  const r = rng(seed * 7 + 3);
  const frame = Math.floor(t / FX_STEP_MS);
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const bx = r() * BACKDROP_W;
    const by = 40 + r() * 40;
    const speed = 0.00025 + r() * 0.0004;
    const phase = r() * Math.PI * 2;
    const blink = (frame + Math.floor(phase * 10)) % 28;
    if (blink > 20) continue;
    const x = Math.round(bx + Math.sin(t * speed + phase) * 10);
    const y = Math.round(by + Math.cos(t * speed * 1.3 + phase) * 5);
    const col = by > 62 ? P.candle : P.mystic;
    c.fillStyle = hex(col);
    c.globalAlpha = blink < 4 ? 0.5 : 1;
    c.fillRect(x, y, 1, 1);
    c.globalAlpha = 0.18;
    c.fillRect(x - 1, y - 1, 3, 3);
  }
  c.globalAlpha = 1;
}

function paintFx(c: CanvasRenderingContext2D, t: number, seed: number): void {
  c.clearRect(0, 0, BACKDROP_W, BACKDROP_H);
  const frame = Math.floor(t / FX_STEP_MS);
  CANDLES.forEach((x, i) => flame(c, x, frame, i + seed));
  fireflies(c, t, seed);
}

/** Pinta una capa en un lienzo de BACKDROP_W×BACKDROP_H. `t` solo afecta a las animadas. */
export function paintLayer(
  c: CanvasRenderingContext2D,
  id: BackdropLayerId,
  t = 0,
  seed = 7,
): void {
  c.imageSmoothingEnabled = false;
  switch (id) {
    case 'sky':
      return paintSky(c);
    case 'stars':
      return paintStars(c, t, seed);
    case 'far':
      return paintFar(c, seed);
    case 'near':
      return paintNear(c, seed);
    case 'table':
      return paintTable(c, seed);
    case 'fx':
      return paintFx(c, t, seed);
  }
}
