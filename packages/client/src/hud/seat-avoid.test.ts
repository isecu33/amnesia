import { describe, expect, it } from 'vitest';
import {
  avoidBottom,
  avoidBottomAll,
  faceBoxes,
  placePlate,
  SEAT_AVOID_GAP_PX,
} from './seat-avoid.js';

const plate = { left: 500, top: 10, right: 900, bottom: 113 };

describe('avoidBottom', () => {
  it('baja bajo la placa la etiqueta que la pisa (asiento de enfrente)', () => {
    expect(avoidBottom(700, 100, 120, 27, plate)).toBe(113 + SEAT_AVOID_GAP_PX + 27);
  });

  it('no mueve etiquetas laterales ni las que ya están debajo', () => {
    expect(avoidBottom(200, 100, 120, 27, plate)).toBe(100);
    expect(avoidBottom(700, 200, 120, 27, plate)).toBe(200);
  });

  it('sin placa no hace nada', () => {
    expect(avoidBottom(700, 100, 120, 27, undefined)).toBe(100);
  });
});

describe('faceBoxes', () => {
  it('2 jugadores: una cara centrada en el tercio superior', () => {
    const [f] = faceBoxes(2, 812, 375);
    expect(f).toBeDefined();
    const cx = ((f?.left ?? 0) + (f?.right ?? 0)) / 2;
    expect(cx).toBeCloseTo(406, -1);
    expect((f?.bottom ?? 999) < 375 / 3).toBe(true);
  });

  it('una cara por rival y viewport degenerado no rompe', () => {
    expect(faceBoxes(4, 812, 375)).toHaveLength(3);
    expect(faceBoxes(4, 0, 0)).toEqual([]);
  });
});

describe('placePlate: la placa de turno no tapa caras', () => {
  const full = { w: 170, h: 30 };
  const compact = { w: 56, h: 30 };
  const noOverlap = (x: number, w: number, f: { left: number; right: number }): boolean =>
    x + w + SEAT_AVOID_GAP_PX <= f.left || x >= f.right + SEAT_AVOID_GAP_PX;

  it('sin caras en la esquina, en la esquina', () => {
    expect(placePlate([], full, compact, 812, 8)).toEqual({ x: 8, y: 8, compact: false });
  });

  it.each([2, 3, 4, 5, 6])('%i jugadores a 812×375: no pisa ninguna cara', (n) => {
    const faces = faceBoxes(n, 812, 375);
    const p = placePlate(faces, full, compact, 812, 8);
    const w = p.compact ? compact.w : full.w;
    for (const f of faces) expect(noOverlap(p.x, w, f), `n=${n} x=${p.x}`).toBe(true);
  });

  it('si no cabe la completa cae a compacta', () => {
    const wall = [{ left: 0, top: 0, right: 400, bottom: 80 }];
    expect(placePlate(wall, full, compact, 420, 8).compact).toBe(true);
  });
});

describe('avoidBottomAll', () => {
  it('encadena zonas: bajar bajo la primera puede chocar con la segunda', () => {
    const a = { left: 0, top: 0, right: 200, bottom: 50 };
    const b = { left: 0, top: 56, right: 200, bottom: 100 };
    expect(avoidBottomAll(100, 40, 80, 20, [a, b])).toBe(100 + SEAT_AVOID_GAP_PX + 20);
  });
});
