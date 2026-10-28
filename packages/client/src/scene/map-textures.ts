/**
 * Texturas pixel de los mapas (D-014: todo se dibuja en código, sin descargas).
 * Tablero, cielo y suelo salen del descriptor; el resto de la escena vive en
 * `map-scenery.ts`.
 */
import * as THREE from 'three';
import type { MapDescriptor } from './maps/index.js';
import { hex, makeCanvas, noiseRect, pixelTexture, rng, shade } from './pixel.js';

const TABLE_S = 96;

/** Mezcla lineal de dos colores 0xRRGGBB. */
export function mix(a: number, b: number, k: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function paintPlanks(c: CanvasRenderingContext2D, m: MapDescriptor): void {
  for (let i = 0; i < 6; i++) {
    noiseRect(
      c,
      0,
      i * 16,
      TABLE_S,
      16,
      i % 2 ? m.mesa.wood : shade(m.mesa.wood, 0.92),
      m.mesa.woodDark,
      0.12,
      21 + i,
    );
    c.fillStyle = hex(m.mesa.rim);
    c.fillRect(0, i * 16, TABLE_S, 1);
  }
}

function paintIce(c: CanvasRenderingContext2D, m: MapDescriptor): void {
  noiseRect(c, 0, 0, TABLE_S, TABLE_S, m.mesa.wood, m.mesa.woodDark, 0.1, 61);
  const r = rng(62);
  // Facetas diagonales claras y grietas de 1 px.
  c.fillStyle = hex(shade(m.mesa.wood, 1.35));
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * TABLE_S);
    const y = Math.floor(r() * TABLE_S);
    const len = 8 + Math.floor(r() * 18);
    for (let k = 0; k < len; k++)
      c.fillRect((x + k) % TABLE_S, (y + Math.floor(k * 0.6)) % TABLE_S, 1, 1);
  }
  c.fillStyle = hex(m.mesa.rim);
  for (let i = 0; i < 6; i++) {
    let x = Math.floor(r() * TABLE_S);
    let y = Math.floor(r() * TABLE_S);
    for (let k = 0; k < 14; k++) {
      c.fillRect(x, y, 1, 1);
      x = (x + (r() < 0.5 ? 1 : 0) + TABLE_S) % TABLE_S;
      y = (y + (r() < 0.5 ? 1 : -1) + TABLE_S) % TABLE_S;
    }
  }
}

function paintStone(c: CanvasRenderingContext2D, m: MapDescriptor): void {
  const slab = 32;
  for (let gy = 0; gy < 3; gy++)
    for (let gx = 0; gx < 3; gx++)
      noiseRect(
        c,
        gx * slab,
        gy * slab,
        slab,
        slab,
        (gx + gy) % 2 ? m.mesa.wood : shade(m.mesa.wood, 1.12),
        m.mesa.woodDark,
        0.2,
        71 + gx + gy * 3,
      );
  c.fillStyle = hex(m.mesa.rim);
  for (let i = 0; i < 3; i++) {
    c.fillRect(i * slab, 0, 1, TABLE_S);
    c.fillRect(0, i * slab, TABLE_S, 1);
  }
  // Musgo en las juntas.
  const r = rng(72);
  c.fillStyle = hex(m.fondo.treeColors[2]);
  for (let i = 0; i < 40; i++)
    c.fillRect(
      Math.floor(r() * 3) * slab + Math.floor(r() * 4),
      Math.floor(r() * TABLE_S),
      1,
      1 + Math.floor(r() * 3),
    );
}

function paintMossyWood(c: CanvasRenderingContext2D, m: MapDescriptor): void {
  paintPlanks(c, m);
  const r = rng(81);
  c.fillStyle = hex(m.fondo.treeColors[2]);
  for (let i = 0; i < 70; i++)
    c.fillRect(Math.floor(r() * TABLE_S), Math.floor(r() * TABLE_S), 1 + Math.floor(r() * 3), 1);
}

function paintCarved(c: CanvasRenderingContext2D, m: MapDescriptor): void {
  paintPlanks(c, m);
  // Franjas de grecas en zigzag junto al borde y en el centro.
  c.fillStyle = hex(m.mesa.rune);
  for (const y of [8, TABLE_S - 10]) {
    for (let x = 0; x < TABLE_S; x += 4) {
      c.fillRect(x, y + ((x / 4) % 2) * 2, 3, 1);
      c.fillRect(x + 1, y + 1 + ((x / 4) % 2) * 2, 1, 1);
    }
  }
  c.fillStyle = hex(m.fondo.groundDetail);
  for (let x = 2; x < TABLE_S; x += 12) c.fillRect(x, 3, 2, 1);
}

const PAINTERS = {
  planks: paintPlanks,
  ice: paintIce,
  stone: paintStone,
  'mossy-wood': paintMossyWood,
  carved: paintCarved,
} as const;

export function tableTopTexture(m: MapDescriptor): THREE.CanvasTexture {
  const { canvas, c } = makeCanvas(TABLE_S, TABLE_S);
  PAINTERS[m.mesa.material](c, m);
  // Círculo rúnico (misterio, no bar): anillo, runas y ojo central.
  const cx = TABLE_S / 2;
  c.fillStyle = hex(m.mesa.rune);
  for (let a = 0; a < 160; a++) {
    const t = (a / 160) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(t) * 26), Math.round(cx + Math.sin(t) * 26), 1, 1);
  }
  const rr = rng(5);
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * 26);
    const y = Math.round(cx + Math.sin(t) * 26);
    c.fillRect(x - 1, y - 1, 1 + Math.floor(rr() * 3), 1);
    c.fillRect(x, y, 1, 1 + Math.floor(rr() * 2));
  }
  return pixelTexture(canvas);
}

export function sideTexture(base: number, dark: number, seed: number): THREE.CanvasTexture {
  const { canvas, c } = makeCanvas(32, 8);
  noiseRect(c, 0, 0, 32, 8, base, dark, 0.25, seed);
  const tex = pixelTexture(canvas, true);
  tex.repeat.set(8, 1);
  return tex;
}

export function groundTexture(m: MapDescriptor): THREE.CanvasTexture {
  const f = m.fondo;
  const { canvas, c } = makeCanvas(32, 32);
  noiseRect(c, 0, 0, 32, 32, f.ground, f.groundAlt, 0.12, 31);
  const r = rng(32);
  c.fillStyle = hex(f.groundKind === 'grass' ? shade(f.groundAlt, 1.3) : f.groundDetail);
  switch (f.groundKind) {
    case 'grass':
    case 'moss':
      for (let i = 0; i < 10; i++) c.fillRect(Math.floor(r() * 32), Math.floor(r() * 31), 1, 2);
      break;
    case 'ice':
      // Grietas y placas claras.
      for (let i = 0; i < 5; i++) {
        let x = Math.floor(r() * 32);
        const y = Math.floor(r() * 32);
        for (let k = 0; k < 8; k++)
          c.fillRect((x += 1) % 32, (y + (k % 3 === 0 ? 1 : 0)) % 32, 1, 1);
      }
      break;
    case 'water':
      // Ondas horizontales sobre barro oscuro.
      for (let i = 0; i < 9; i++)
        c.fillRect(Math.floor(r() * 28), Math.floor(r() * 32), 2 + Math.floor(r() * 3), 1);
      c.fillStyle = hex(shade(f.ground, 0.7));
      for (let i = 0; i < 6; i++) c.fillRect(Math.floor(r() * 30), Math.floor(r() * 30), 3, 2);
      break;
    case 'sand':
      // Rizos de arena.
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(r() * 26);
        const y = Math.floor(r() * 32);
        c.fillRect(x, y, 4, 1);
        c.fillRect(x + 4, y + 1, 2, 1);
      }
      break;
  }
  const tex = pixelTexture(canvas, true);
  tex.repeat.set(26, 26);
  return tex;
}

const SKY_BANDS: Record<MapDescriptor['fondo']['skyKind'], number> = {
  stars: 6,
  cave: 5,
  dusk: 9,
  murk: 7,
};

export function skyTexture(m: MapDescriptor): THREE.CanvasTexture {
  const f = m.fondo;
  const { canvas, c } = makeCanvas(128, 64);
  const bands = SKY_BANDS[f.skyKind];
  // Degradado en bandas (sin suavizar).
  for (let y = 0; y < 64; y++) {
    const band = Math.floor((y / 63) * bands) / bands;
    c.fillStyle = hex(mix(f.sky, f.skyHorizon, band));
    c.fillRect(0, y, 128, 1);
  }
  const r = rng(77);
  if (f.skyKind === 'stars') {
    for (let i = 0; i < f.stars; i++) {
      c.fillStyle = r() < 0.2 ? '#fff3b0' : '#a9b8e8';
      c.fillRect(Math.floor(r() * 128), Math.floor(r() * 40), 1, 1);
    }
  } else if (f.skyKind === 'cave') {
    // Roca del techo: manchas oscuras y brillos de hielo.
    for (let i = 0; i < 70; i++) {
      c.fillStyle = hex(shade(f.sky, 0.6 + r() * 0.7));
      c.fillRect(Math.floor(r() * 128), Math.floor(r() * 30), 1 + Math.floor(r() * 4), 1);
    }
    c.fillStyle = hex(f.groundDetail);
    for (let i = 0; i < 18; i++) c.fillRect(Math.floor(r() * 128), Math.floor(r() * 34), 1, 1);
  } else if (f.skyKind === 'murk') {
    // Jirones de bruma horizontales.
    c.fillStyle = hex(shade(f.skyHorizon, 1.12));
    for (let i = 0; i < 26; i++)
      c.fillRect(Math.floor(r() * 120), 14 + Math.floor(r() * 46), 8 + Math.floor(r() * 18), 1);
  } else {
    // Nubes alargadas del atardecer.
    c.fillStyle = hex(shade(f.skyHorizon, 0.82));
    for (let i = 0; i < 16; i++)
      c.fillRect(Math.floor(r() * 116), 26 + Math.floor(r() * 26), 10 + Math.floor(r() * 20), 2);
  }
  return pixelTexture(canvas);
}
