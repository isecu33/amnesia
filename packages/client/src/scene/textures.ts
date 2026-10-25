/**
 * Texturas generadas por código (sin assets externos hasta F6, docs/01 §12).
 * Requisito duro de accesibilidad: silueta + NÚMERO GRANDE + patrón en cada cara.
 */
import * as THREE from 'three';
import { faceColor, patternFor } from './palette.js';
import { crispAlpha, drawPixelNumber, makeCanvas, noiseRect, pixelTexture } from './pixel.js';

const cache = new Map<string, THREE.CanvasTexture>();

/** Siluetas mínimas por valor (docs/01 §2): trazo simple, legible a 64 px. */
const ANIMAL: Record<number, (c: CanvasRenderingContext2D) => void> = {
  0: (c) => circle(c, 128, 96, 26),
  1: (c) => ear(c, 1),
  2: (c) => ear(c, 2),
  3: (c) => shell(c),
  4: (c) => antlers(c),
  5: (c) => horns(c),
  6: (c) => tusks(c),
  7: (c) => owl(c, false),
  8: (c) => owl(c, true),
  9: (c) => bird(c, false),
  10: (c) => bird(c, true),
  11: (c) => snake(c),
  12: (c) => fox(c),
  13: (c) => shaman(c),
};

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function ear(c: CanvasRenderingContext2D, n: number): void {
  circle(c, 128, 108, 30);
  for (let i = 0; i < 2; i++) {
    c.beginPath();
    c.ellipse(108 + i * 40, 74, 10, 22 * n, 0, 0, Math.PI * 2);
    c.fill();
  }
}
function shell(c: CanvasRenderingContext2D): void {
  circle(c, 128, 104, 32);
  c.strokeStyle = '#1b1725';
  c.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(128, 104, 10 + i * 9, 0, Math.PI * 2);
    c.stroke();
  }
}
function antlers(c: CanvasRenderingContext2D): void {
  circle(c, 128, 112, 24);
  c.lineWidth = 7;
  c.strokeStyle = c.fillStyle as string;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(128 + s * 14, 92);
    c.lineTo(128 + s * 34, 58);
    c.moveTo(128 + s * 24, 74);
    c.lineTo(128 + s * 44, 70);
    c.stroke();
  }
}
function horns(c: CanvasRenderingContext2D): void {
  circle(c, 128, 112, 24);
  c.lineWidth = 8;
  c.strokeStyle = c.fillStyle as string;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(128 + s * 26, 78, 20, 0, Math.PI, s < 0);
    c.stroke();
  }
}
function tusks(c: CanvasRenderingContext2D): void {
  circle(c, 128, 110, 28);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(128 + s * 16, 128);
    c.lineTo(128 + s * 30, 96);
    c.lineTo(128 + s * 22, 130);
    c.fill();
  }
}
function owl(c: CanvasRenderingContext2D, royal: boolean): void {
  circle(c, 128, 108, 32);
  c.save();
  c.fillStyle = '#1b1725';
  circle(c, 114, 102, 9);
  circle(c, 142, 102, 9);
  c.restore();
  if (royal) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(128 + s * 22, 84);
      c.lineTo(128 + s * 34, 62);
      c.lineTo(128 + s * 12, 74);
      c.fill();
    }
  }
}
function bird(c: CanvasRenderingContext2D, white: boolean): void {
  c.save();
  if (white) c.fillStyle = '#f2e8d5';
  c.beginPath();
  c.moveTo(96, 120);
  c.quadraticCurveTo(128, 62, 168, 112);
  c.quadraticCurveTo(136, 104, 96, 120);
  c.fill();
  c.beginPath();
  c.moveTo(168, 112);
  c.lineTo(186, 108);
  c.lineTo(168, 120);
  c.fill();
  c.restore();
}
function snake(c: CanvasRenderingContext2D): void {
  c.lineWidth = 12;
  c.strokeStyle = c.fillStyle as string;
  c.beginPath();
  c.moveTo(92, 130);
  c.bezierCurveTo(128, 84, 96, 78, 150, 70);
  c.stroke();
  circle(c, 156, 68, 10);
}
function fox(c: CanvasRenderingContext2D): void {
  c.beginPath();
  c.moveTo(128, 138);
  c.lineTo(96, 84);
  c.lineTo(112, 92);
  c.lineTo(128, 66);
  c.lineTo(144, 92);
  c.lineTo(160, 84);
  c.closePath();
  c.fill();
}
function shaman(c: CanvasRenderingContext2D): void {
  c.beginPath();
  c.moveTo(128, 62);
  c.lineTo(160, 108);
  c.lineTo(128, 146);
  c.lineTo(96, 108);
  c.closePath();
  c.fill();
  c.save();
  c.fillStyle = '#1b1725';
  circle(c, 128, 104, 10);
  c.restore();
}

// --- atlas de cartas pixel (D-042) -------------------------------------------

/** Celda de carta: 32×44 px. 14 caras + dorso + carta en blanco en una rejilla 4×4. */
export const CARD_CELL = { w: 32, h: 44, cols: 4, rows: 4 } as const;
export const BACK_CELL = 14;
export const BLANK_CELL = 15;

/** Patrón pixel por valor (nunca solo color, docs/01 §11). */
function pixelPattern(c: CanvasRenderingContext2D, x0: number, y0: number, value: number): void {
  const pattern = patternFor(value);
  c.fillStyle = 'rgba(27,23,37,0.28)';
  for (let y = 0; y < 38; y++)
    for (let x = 0; x < 26; x++) {
      const on = pattern.startsWith('dots')
        ? x % (6 - Number(pattern.slice(-1))) === 0 && y % 5 === 0
        : pattern.startsWith('bars')
          ? x % (7 - Number(pattern.slice(-1)) * 2) === 0
          : pattern === 'grid' || pattern === 'cross'
            ? x % 5 === 0 || y % 5 === 0
            : pattern === 'rings'
              ? Math.round(Math.hypot(x - 13, y - 19)) % 4 === 0
              : pattern === 'zigzag'
                ? (y + Math.abs((x % 6) - 3)) % 6 === 0
                : pattern === 'triangles'
                  ? y % 6 >= Math.abs((x % 6) - 3) * 2 && y % 6 === 5
                  : pattern === 'diamonds'
                    ? Math.abs((x % 6) - 3) + Math.abs((y % 6) - 3) === 2
                    : (x + y) % 7 === 0 && x % 2 === 0;
      if (on) c.fillRect(x0 + 3 + x, y0 + 3 + y, 1, 1);
    }
}

function drawFaceCell(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  value: number,
  cb: boolean,
): void {
  const { w, h } = CARD_CELL;
  c.fillStyle = '#1b1725';
  c.fillRect(x0, y0, w, h);
  c.fillStyle = '#f2e8d5';
  c.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
  c.fillStyle = faceColor(value, cb);
  c.fillRect(x0 + 3, y0 + 3, w - 6, h - 6);
  pixelPattern(c, x0, y0, value);
  // Icono: la silueta vectorial reducida y umbralizada a píxeles enteros.
  const icon = makeCanvas(32, 22);
  icon.c.imageSmoothingEnabled = true;
  icon.c.translate(16, 11);
  icon.c.scale(0.22, 0.22);
  icon.c.translate(-128, -104);
  icon.c.fillStyle = '#1b1725';
  (ANIMAL[value] ?? ANIMAL[0])?.(icon.c);
  crispAlpha(icon.c, 32, 22);
  c.drawImage(icon.canvas, x0, y0 + 3);
  // Número grande: requisito duro (nunca solo color).
  const s = 3;
  drawPixelNumber(c, String(value), x0 + w / 2, y0 + 24, s, '#1b1725', '#f2e8d5');
}

function drawBackCell(c: CanvasRenderingContext2D, x0: number, y0: number): void {
  const { w, h } = CARD_CELL;
  c.fillStyle = '#1b1725';
  c.fillRect(x0, y0, w, h);
  noiseRect(c, x0 + 1, y0 + 1, w - 2, h - 2, 0x43301c, 0x2c1a12, 0.18, 7);
  c.fillStyle = '#8c6239';
  c.fillRect(x0 + 3, y0 + 3, w - 6, 1);
  c.fillRect(x0 + 3, y0 + h - 4, w - 6, 1);
  c.fillRect(x0 + 3, y0 + 3, 1, h - 6);
  c.fillRect(x0 + w - 4, y0 + 3, 1, h - 6);
  // Ojo rúnico: el mismo dorso para todas (I2: el dorso no dice nada).
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  c.fillStyle = '#7be0c8';
  for (let a = 0; a < 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(t) * 9), Math.round(cy + Math.sin(t) * 9), 1, 1);
  }
  c.fillStyle = '#ffb35c';
  c.fillRect(cx - 4, cy - 1, 8, 2);
  c.fillRect(cx - 2, cy - 2, 4, 4);
  c.fillStyle = '#1b1725';
  c.fillRect(cx - 1, cy - 1, 2, 2);
}

/** Atlas único para TODAS las cartas de la mesa: un solo `InstancedMesh`. */
export function cardAtlas(colorBlind: boolean): THREE.CanvasTexture {
  const key = `atlas-${colorBlind ? 'cb' : 'n'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { w, h, cols, rows } = CARD_CELL;
  const { canvas, c } = makeCanvas(w * cols, h * rows);
  for (let v = 0; v <= 13; v++)
    drawFaceCell(c, (v % cols) * w, Math.floor(v / cols) * h, v, colorBlind);
  drawBackCell(c, (BACK_CELL % cols) * w, Math.floor(BACK_CELL / cols) * h);
  c.fillStyle = '#2a2438';
  c.fillRect((BLANK_CELL % cols) * w, Math.floor(BLANK_CELL / cols) * h, w, h);
  const tex = pixelTexture(canvas);
  cache.set(key, tex);
  return tex;
}

/** Gradient map de 3 bandas para MeshToonMaterial (docs/02 §5.3). */
export function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([70, 150, 245]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  return tex;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
