import { describe, expect, it } from 'vitest';
import {
  CAMERA,
  DECK_POSITION,
  DISCARD_POSITION,
  MAX_SLOTS,
  distance,
  seatPosition,
  slotPositions,
} from './layout.js';
import { faceColor, patternFor, paletteFor } from './palette.js';

describe('WP-09 · geometría de la mesa (docs/01 §11)', () => {
  it('tus 8 slots, huecos incluidos, tienen siempre posición propia', () => {
    for (let n = 1; n <= MAX_SLOTS; n++) {
      const ps = slotPositions(n, 0, 4, { own: true });
      expect(ps).toHaveLength(n);
      for (const p of ps) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('los slots propios van de izquierda a derecha y no se solapan', () => {
    const ps = slotPositions(MAX_SLOTS, 0, 4, { own: true });
    const xs = ps.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (let i = 1; i < ps.length; i++) {
      expect(distance(ps[i - 1]!, ps[i]!)).toBeGreaterThan(0.06); // ancho de tótem
    }
  });

  it('los slots propios caen delante de la cámara (parte inferior de la pantalla)', () => {
    const ps = slotPositions(MAX_SLOTS, 0, 4, { own: true });
    for (const p of ps) {
      expect(p.z).toBeGreaterThan(CAMERA.position.z); // entre cámara y centro
      expect(p.z).toBeLessThan(0);
      expect(distance(p, CAMERA.position)).toBeLessThan(1.2);
    }
  });

  it('los asientos se reparten sin solaparse para 2..6 jugadores', () => {
    for (let n = 2; n <= 6; n++) {
      const seats = Array.from({ length: n }, (_, i) => seatPosition(i, n));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(distance(seats[i]!, seats[j]!), `n=${n}`).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('mazo y descarte están en el centro, separados', () => {
    expect(distance(DECK_POSITION, DISCARD_POSITION)).toBeGreaterThan(0.25);
    expect(Math.hypot(DECK_POSITION.x, DECK_POSITION.z)).toBeLessThan(0.4);
  });
});

describe('WP-15 · accesibilidad del color (docs/01 §11)', () => {
  it('cada valor tiene un patrón distinto, no solo color', () => {
    const patterns = new Set(Array.from({ length: 14 }, (_, v) => patternFor(v)));
    expect(patterns.size).toBe(14);
  });

  it('el modo daltónico cambia los colores de acierto y peligro', () => {
    expect(paletteFor(true).mystic).not.toBe(paletteFor(false).mystic);
    expect(paletteFor(true).danger).not.toBe(paletteFor(false).danger);
  });

  it('la rampa de caras es monótona y está acotada', () => {
    for (let v = 0; v <= 13; v++) expect(faceColor(v, false)).toMatch(/^hsl\(/);
    expect(faceColor(-5, false)).toBe(faceColor(0, false));
    expect(faceColor(99, false)).toBe(faceColor(13, false));
  });
});
