import { describe, expect, it } from 'vitest';
import { avoidBottom, SEAT_AVOID_GAP_PX } from './seat-avoid.js';

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
