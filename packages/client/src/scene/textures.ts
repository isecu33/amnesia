/**
 * Texturas generadas por código (sin assets externos hasta F6, docs/01 §12).
 * Requisito duro de accesibilidad: silueta + NÚMERO GRANDE + patrón en cada cara.
 */
import * as THREE from 'three';
import { faceColor, patternFor } from './palette.js';

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

function drawPattern(c: CanvasRenderingContext2D, pattern: string): void {
  c.save();
  c.globalAlpha = 0.18;
  c.fillStyle = '#1b1725';
  c.strokeStyle = '#1b1725';
  c.lineWidth = 3;
  const step = 24;
  switch (pattern) {
    case 'bars1':
    case 'bars2':
    case 'bars3': {
      const k = Number(pattern.slice(-1));
      for (let x = 0; x < 256; x += step / k) c.fillRect(x, 0, 4, 256);
      break;
    }
    case 'grid':
    case 'cross':
      for (let x = 0; x < 256; x += step) c.fillRect(x, 0, 3, 256);
      for (let y = 0; y < 256; y += step) c.fillRect(0, y, 256, 3);
      break;
    case 'rings':
      for (let r = 12; r < 160; r += 18) {
        c.beginPath();
        c.arc(128, 128, r, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    case 'zigzag':
      for (let y = 0; y < 256; y += 22) {
        c.beginPath();
        for (let x = 0; x <= 256; x += 16) c.lineTo(x, y + ((x / 16) % 2 ? 10 : 0));
        c.stroke();
      }
      break;
    case 'triangles':
      for (let y = 0; y < 256; y += 32)
        for (let x = 0; x < 256; x += 32) {
          c.beginPath();
          c.moveTo(x, y + 24);
          c.lineTo(x + 12, y + 4);
          c.lineTo(x + 24, y + 24);
          c.fill();
        }
      break;
    case 'diamonds':
      for (let y = 0; y < 256; y += 32)
        for (let x = 0; x < 256; x += 32) {
          c.beginPath();
          c.moveTo(x + 12, y);
          c.lineTo(x + 24, y + 12);
          c.lineTo(x + 12, y + 24);
          c.lineTo(x, y + 12);
          c.fill();
        }
      break;
    case 'star':
      for (let y = 16; y < 256; y += 48)
        for (let x = 16; x < 256; x += 48) {
          c.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = i % 2 ? 4 : 11;
            c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          c.fill();
        }
      break;
    default: {
      const n = Number(pattern.slice(-1)) || 1;
      for (let y = 12; y < 256; y += 40 / n)
        for (let x = 12; x < 256; x += 40 / n) circle(c, x, y, 3);
    }
  }
  c.restore();
}

/** Cara de un tótem: color + patrón + silueta + número grande. */
export function faceTexture(value: number, colorBlind: boolean): THREE.CanvasTexture {
  const key = `face-${value}-${colorBlind ? 'cb' : 'n'}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('sin contexto 2d');
  c.fillStyle = '#f2e8d5';
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = faceColor(value, colorBlind);
  c.fillRect(8, 8, 240, 240);
  drawPattern(c, patternFor(value));

  c.fillStyle = '#1b1725';
  (ANIMAL[value] ?? ANIMAL[0])?.(c);

  // Número grande: requisito duro (nunca solo color).
  c.font = 'bold 84px Inter, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#1b1725';
  c.fillText(String(value), 128, 198);
  c.font = 'bold 34px Inter, system-ui, sans-serif';
  c.fillText(String(value), 34, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Dorso común a todos los tótems. */
export function backTexture(): THREE.CanvasTexture {
  const key = 'back';
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('sin contexto 2d');
  c.fillStyle = '#43301c';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#6e4b2a';
  c.lineWidth = 6;
  c.strokeRect(16, 16, 224, 224);
  c.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(128, 128, 22 + i * 16, 0, Math.PI * 2);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
