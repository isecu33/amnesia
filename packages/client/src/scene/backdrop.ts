/**
 * Fondo pixel de las pantallas de inicio y sala: noche de bosque, mesa de madera,
 * velas y las siluetas de los animales sentados (D-042). Código puro sobre un
 * lienzo diminuto que se amplía sin suavizado.
 */
import { SPECIES_IDS, type SpeciesId } from './species.js';
import { portraitGrid } from './portrait.js';
import { hex, noiseRect, rng, shade } from './pixel.js';

export const BACKDROP_W = 192;
export const BACKDROP_H = 108;

const SKY_BANDS = [0x0d0a16, 0x120e1e, 0x1b1725, 0x241d31, 0x2f2540];
const WOOD = [0x4a321d, 0x6e4b2a, 0x8c6239];
const CANDLE = 0xffb35c;
const MYSTIC = 0x7be0c8;
const TABLE_TOP = 72;

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

function candle(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = hex(0xe8d4a8);
  c.fillRect(x, y, 3, 9);
  c.fillStyle = hex(0xb89a6a);
  c.fillRect(x + 2, y, 1, 9);
  c.fillStyle = hex(CANDLE);
  c.fillRect(x + 1, y - 3, 1, 3);
  c.fillStyle = hex(0xfff0c0);
  c.fillRect(x + 1, y - 2, 1, 1);
  // halo escalonado
  for (let r = 1; r <= 3; r++) {
    c.fillStyle = `rgba(255,179,92,${0.1 / r})`;
    c.fillRect(x - r * 3, y - 3 - r * 2, 3 + r * 6, 6 + r * 4);
  }
}

export function paintBackdrop(c: CanvasRenderingContext2D, seed = 7): void {
  c.imageSmoothingEnabled = false;
  const r = rng(seed);

  // Cielo: bandas con una fila de tramado entre cada una.
  const bandH = Math.ceil(TABLE_TOP / SKY_BANDS.length);
  SKY_BANDS.forEach((col, i) => {
    c.fillStyle = hex(col);
    c.fillRect(0, i * bandH, BACKDROP_W, bandH);
    if (i > 0) {
      c.fillStyle = hex(SKY_BANDS[i - 1] as number);
      for (let x = i % 2; x < BACKDROP_W; x += 2) c.fillRect(x, i * bandH, 1, 1);
    }
  });

  // Estrellas.
  for (let i = 0; i < 46; i++) {
    c.fillStyle = hex(r() < 0.25 ? MYSTIC : 0xf2e8d5);
    c.fillRect(Math.floor(r() * BACKDROP_W), Math.floor(r() * 38), 1, 1);
  }

  // Luna.
  const mx = 148;
  const my = 14;
  for (let y = -6; y <= 6; y++)
    for (let x = -6; x <= 6; x++) {
      if (x * x + y * y > 33) continue;
      c.fillStyle = hex(x * x + y * y > 22 ? 0xcdbf9a : 0xf2e8d5);
      c.fillRect(mx + x, my + y, 1, 1);
    }
  c.fillStyle = hex(SKY_BANDS[2] as number);
  c.fillRect(mx + 3, my - 3, 5, 5);

  // Bosque en dos capas de pinos.
  for (const [layer, base, col] of [
    [0, 62, 0x14101c],
    [1, 70, 0x0d0a16],
  ] as const) {
    for (let x = -4; x < BACKDROP_W + 6; x += 9 + layer * 3) {
      const h = 14 + Math.floor(r() * 12) + layer * 4;
      c.fillStyle = hex(col);
      for (let k = 0; k < h; k++) {
        const w = Math.max(1, Math.floor((k / h) * 6) + 1);
        c.fillRect(x - w, base - h + k, w * 2 + 1, 1);
      }
      c.fillRect(x, base, 1, 4);
    }
  }
  c.fillStyle = hex(0x0d0a16);
  c.fillRect(0, 66, BACKDROP_W, TABLE_TOP - 66);

  // Siluetas de los animales sentados, con la mesa delante.
  const seats: [SpeciesId, number, number][] = [
    [SPECIES_IDS[0] as SpeciesId, 14, 36],
    [SPECIES_IDS[2] as SpeciesId, 70, 28],
    [SPECIES_IDS[3] as SpeciesId, 122, 34],
    [SPECIES_IDS[5] as SpeciesId, 160, 40],
  ];
  for (const [id, x, y] of seats) {
    stamp(c, id, x, y, 2, 0.34);
    // cuerpo
    c.fillStyle = hex(shade(0x3a2c24, 0.55));
    c.fillRect(x - 2, y + 32, 36, 12);
  }

  // Mesa: tablones con vetas y borde iluminado.
  noiseRect(
    c,
    0,
    TABLE_TOP,
    BACKDROP_W,
    BACKDROP_H - TABLE_TOP,
    WOOD[0] as number,
    WOOD[1] as number,
    0.18,
    seed,
  );
  for (let x = 0; x < BACKDROP_W; x += 24) {
    c.fillStyle = hex(0x2a1c10);
    c.fillRect(x, TABLE_TOP, 1, BACKDROP_H - TABLE_TOP);
  }
  c.fillStyle = hex(WOOD[2] as number);
  c.fillRect(0, TABLE_TOP, BACKDROP_W, 1);
  c.fillStyle = hex(WOOD[0] as number);
  for (let x = 0; x < BACKDROP_W; x += 2) c.fillRect(x, TABLE_TOP + 1, 1, 1);

  // Círculo ritual en el centro de la mesa.
  c.fillStyle = hex(MYSTIC);
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    if (a % 3 === 0) continue;
    c.fillRect(Math.round(96 + Math.cos(t) * 40), Math.round(92 + Math.sin(t) * 9), 1, 1);
  }

  candle(c, 44, TABLE_TOP + 6);
  candle(c, 146, TABLE_TOP + 6);
}
