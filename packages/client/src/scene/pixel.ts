/**
 * Utilidades de pixel-art (D-042): lienzos diminutos, texturas con
 * `NearestFilter` y sin mipmaps, fuente de dígitos 3×5 y ruido determinista.
 * Todo generado por código (D-014): cero descargas.
 */
import * as THREE from 'three';

export function makeCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('sin contexto 2d');
  c.imageSmoothingEnabled = false;
  return { canvas, c };
}

/** Textura «píxel visible»: nearest en ambos sentidos y sin mipmaps. */
export function pixelTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Ruido determinista (mulberry32): las texturas salen iguales en cada carga. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Multiplica un color por `f` (oscurecer < 1 < aclarar), saturando. */
export function shade(n: number, f: number): number {
  const ch = (s: number): number => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Rellena un rectángulo con dos tonos al azar: el «grano» de un pixel-art. */
export function noiseRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: number,
  alt: number,
  density: number,
  seed: number,
): void {
  const r = rng(seed);
  c.fillStyle = hex(base);
  c.fillRect(x, y, w, h);
  c.fillStyle = hex(alt);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (r() < density) c.fillRect(x + i, y + j, 1, 1);
}

/** Dígitos 3×5 (1 = píxel encendido). Legibles a cualquier escala entera. */
const DIGITS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001111',
};

/** Ancho en píxeles de `text` a escala `s` (3 px por dígito + 1 de separación). */
export const pixelTextWidth = (text: string, s: number): number => (text.length * 4 - 1) * s;

export function drawPixelNumber(
  c: CanvasRenderingContext2D,
  text: string,
  cx: number,
  top: number,
  s: number,
  color: string,
  outline?: string,
): void {
  const x0 = Math.round(cx - pixelTextWidth(text, s) / 2);
  const paint = (dx: number, dy: number, fill: string): void => {
    c.fillStyle = fill;
    [...text].forEach((ch, k) => {
      const bits = DIGITS[ch];
      if (!bits) return;
      for (let i = 0; i < 15; i++) {
        if (bits[i] !== '1') continue;
        const px = x0 + k * 4 * s + (i % 3) * s + dx;
        const py = top + Math.floor(i / 3) * s + dy;
        c.fillRect(px, py, s, s);
      }
    });
  };
  if (outline)
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      paint(dx, dy, outline);
  paint(0, 0, color);
}

/** Umbraliza el alfa: sin bordes suavizados, solo píxeles enteros. */
export function crispAlpha(c: CanvasRenderingContext2D, w: number, h: number): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = (d[i] ?? 0) > 110 ? 255 : 0;
  c.putImageData(img, 0, 0);
}
