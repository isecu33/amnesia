/**
 * Retratos pixel de los animales totémicos y logo del juego (pantallas de inicio y
 * sala, D-042). Todo se dibuja por código sobre cuadrículas diminutas y se amplía
 * sin suavizado: cero emojis, cero assets descargados (D-014). La cuadrícula es
 * pura (testeable sin canvas); `drawPortrait` solo la pinta.
 */
import { SPECIES, type Species, type SpeciesId } from './species.js';
import { hex, shade } from './pixel.js';

export const PORTRAIT_SIZE = 16;
/** Texto del logo; la Ó lleva acento. */
export const LOGO_TEXT = 'TÓTEM';

type Cell = number | null;
export type PortraitGrid = Cell[][];

const BLACK = 0x14101c;
const TONGUE = 0xe0565b;

/** Máscara de la cabeza: rango de columnas ocupadas por fila. */
const HEAD_ROWS: Record<number, [number, number]> = {
  4: [4, 11],
  5: [3, 12],
  6: [2, 13],
  7: [2, 13],
  8: [2, 13],
  9: [2, 13],
  10: [2, 13],
  11: [2, 13],
  12: [3, 12],
  13: [4, 11],
};
/** La serpiente tiene la capucha más ancha y alta. */
const HOOD_ROWS: Record<number, [number, number]> = {
  3: [5, 10],
  4: [3, 12],
  5: [2, 13],
  6: [1, 14],
  7: [1, 14],
  8: [1, 14],
  9: [1, 14],
  10: [1, 14],
  11: [2, 13],
  12: [3, 12],
  13: [5, 10],
};

function blank(): PortraitGrid {
  return Array.from({ length: PORTRAIT_SIZE }, () => Array<Cell>(PORTRAIT_SIZE).fill(null));
}

function paint(g: PortraitGrid, x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= PORTRAIT_SIZE || y >= PORTRAIT_SIZE) return;
  (g[y] as Cell[])[x] = c;
}
/** Pinta el píxel y su reflejo (la cara es simétrica). */
function pair(g: PortraitGrid, x: number, y: number, c: number): void {
  paint(g, x, y, c);
  paint(g, PORTRAIT_SIZE - 1 - x, y, c);
}
function rect(g: PortraitGrid, x0: number, y0: number, x1: number, y1: number, c: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pair(g, x, y, c);
}

function head(g: PortraitGrid, s: Species, rows: Record<number, [number, number]>): void {
  for (const [ys, [x0, x1]] of Object.entries(rows)) {
    const y = Number(ys);
    for (let x = x0; x <= x1; x++) paint(g, x, y, s.fur);
  }
  // Contorno: todo píxel de la cabeza con algún vecino fuera de ella.
  const inside = (x: number, y: number): boolean => {
    const r = rows[y];
    return r !== undefined && x >= r[0] && x <= r[1];
  };
  for (const [ys, [x0, x1]] of Object.entries(rows)) {
    const y = Number(ys);
    for (let x = x0; x <= x1; x++) {
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) paint(g, x, y, s.furDark);
    }
  }
}

function eyes(g: PortraitGrid, s: Species, slit = false): void {
  rect(g, 4, 7, 5, 8, s.eye);
  pair(g, 5, 8, slit ? BLACK : BLACK); // pupila
  if (slit) pair(g, 5, 7, BLACK);
  pair(g, 4, 7, shade(s.eye, 1.25)); // brillo
}

export function portraitGrid(id: SpeciesId): PortraitGrid {
  const s = SPECIES[id];
  const g = blank();

  switch (s.silhouette) {
    case 'tufts': {
      pair(g, 3, 2, s.furDark);
      rect(g, 3, 3, 4, 3, s.fur);
      pair(g, 3, 3, s.furDark);
      head(g, s, HEAD_ROWS);
      rect(g, 3, 6, 6, 9, s.mark); // disco facial
      eyes(g, s);
      rect(g, 7, 9, 7, 10, s.eye); // pico
      rect(g, 7, 11, 7, 11, shade(s.eye, 0.7));
      rect(g, 5, 12, 6, 12, s.belly);
      break;
    }
    case 'pointy-ears': {
      pair(g, 3, 1, s.mark);
      pair(g, 3, 2, s.mark);
      rect(g, 4, 2, 4, 3, s.fur);
      rect(g, 3, 3, 3, 3, s.fur);
      rect(g, 5, 3, 5, 3, s.fur);
      head(g, s, HEAD_ROWS);
      eyes(g, s);
      rect(g, 3, 10, 6, 12, s.belly); // mejillas claras
      rect(g, 6, 9, 6, 9, s.belly);
      rect(g, 7, 10, 7, 10, s.mark); // nariz
      rect(g, 7, 12, 7, 12, s.furDark);
      break;
    }
    case 'round-ears': {
      rect(g, 2, 3, 4, 3, s.furDark);
      rect(g, 2, 4, 3, 4, s.fur);
      pair(g, 3, 4, s.belly);
      head(g, s, HEAD_ROWS);
      rect(g, 3, 3, 3, 3, s.furDark);
      eyes(g, s);
      rect(g, 5, 9, 7, 12, s.belly); // hocico ancho
      rect(g, 7, 10, 7, 10, BLACK); // nariz
      rect(g, 7, 12, 7, 12, s.furDark);
      pair(g, 7, 5, s.mark); // marca dorada en la frente
      break;
    }
    case 'antlers': {
      rect(g, 4, 0, 4, 3, s.belly);
      rect(g, 3, 2, 3, 2, s.belly);
      rect(g, 2, 1, 2, 1, s.belly);
      rect(g, 3, 0, 3, 0, shade(s.belly, 0.8));
      head(g, s, HEAD_ROWS);
      eyes(g, s);
      rect(g, 5, 10, 7, 12, s.belly);
      rect(g, 7, 10, 7, 10, BLACK);
      pair(g, 7, 5, s.mark); // marca en la frente
      pair(g, 2, 6, s.furDark); // orejas
      break;
    }
    case 'hood': {
      head(g, s, HOOD_ROWS);
      pair(g, 2, 8, s.mark); // dibujo de la capucha
      pair(g, 3, 9, s.mark);
      pair(g, 2, 10, s.mark);
      pair(g, 3, 5, shade(s.fur, 1.25));
      eyes(g, s, true);
      rect(g, 5, 10, 7, 12, s.belly);
      rect(g, 7, 12, 7, 13, TONGUE);
      rect(g, 6, 14, 6, 14, TONGUE);
      paint(g, 9, 14, TONGUE);
      break;
    }
    case 'beak': {
      pair(g, 6, 3, s.furDark);
      rect(g, 7, 2, 7, 3, s.furDark);
      head(g, s, HEAD_ROWS);
      eyes(g, s);
      rect(g, 6, 9, 7, 10, s.mark); // pico
      rect(g, 7, 11, 7, 11, shade(s.mark, 0.75));
      pair(g, 4, 11, s.belly);
      break;
    }
  }
  return g;
}

/** Pinta un retrato en un canvas ya dimensionado a `PORTRAIT_SIZE`². */
export function drawPortrait(c: CanvasRenderingContext2D, id: SpeciesId): void {
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  portraitGrid(id).forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === null) return;
      c.fillStyle = hex(cell);
      c.fillRect(x, y, 1, 1);
    }),
  );
}

// --- logo --------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};
const ACCENT = ['...#.', '..#..'];
const GLYPH_W = 5;

export interface LogoBitmap {
  width: number;
  height: number;
  /** filas de `#` (pintado) y `.` (vacío) */
  rows: string[];
}

export function logoBitmap(): LogoBitmap {
  const letters = [...LOGO_TEXT.normalize('NFD')].filter((ch) => ch !== '́');
  const accented = new Set<number>();
  const base = [...LOGO_TEXT.normalize('NFD')];
  let idx = -1;
  for (const ch of base) {
    if (ch === '́') accented.add(idx);
    else idx++;
  }
  const height = ACCENT.length + 7;
  const rows: string[] = Array.from({ length: height }, () => '');
  letters.forEach((ch, i) => {
    const glyph = GLYPHS[ch] ?? GLYPHS['T']!;
    for (let y = 0; y < height; y++) {
      const accentRow = y < ACCENT.length ? ACCENT[y] : undefined;
      const row =
        y < ACCENT.length
          ? accented.has(i)
            ? accentRow!
            : '.'.repeat(GLYPH_W)
          : glyph[y - ACCENT.length]!;
      rows[y] += (i > 0 ? '.' : '') + row;
    }
  });
  return { width: rows[0]!.length, height, rows };
}

/** Pinta el logo; `colors` da el relleno y la sombra (un píxel abajo-derecha). */
export function drawLogo(
  c: CanvasRenderingContext2D,
  colors: { fill: string; shadow: string },
): void {
  const b = logoBitmap();
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, b.width + 1, b.height + 1);
  const each = (fn: (x: number, y: number) => void): void =>
    b.rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && fn(x, y)));
  c.fillStyle = colors.shadow;
  each((x, y) => c.fillRect(x + 1, y + 1, 1, 1));
  c.fillStyle = colors.fill;
  each((x, y) => c.fillRect(x, y, 1, 1));
}
