/** D-045 · iconos pixel de las reacciones: propios, distintos y con la paleta fija. */
import { describe, expect, it } from 'vitest';
import { EMOTE_ICON_COUNT, EMOTE_ICON_SIZE, EMOTE_PALETTE, emoteIconRects } from './emote-icons.js';

const key = (id: number): string =>
  emoteIconRects(id)
    .map((r) => `${r.x},${r.y},${r.w},${r.h},${r.color}`)
    .join('|');

describe('iconos de reacción', () => {
  it('hay uno por cada uno de los 6 ids del protocolo', () => {
    expect(EMOTE_ICON_COUNT).toBe(6);
  });

  it('todos son distintos entre sí', () => {
    const all = new Set(Array.from({ length: EMOTE_ICON_COUNT }, (_, id) => key(id)));
    expect(all.size).toBe(EMOTE_ICON_COUNT);
  });

  it('caben en el lienzo y solo usan la paleta fija de la UI', () => {
    const palette = new Set<string>(Object.values(EMOTE_PALETTE));
    for (let id = 0; id < EMOTE_ICON_COUNT; id++) {
      const rects = emoteIconRects(id);
      expect(rects.length).toBeGreaterThan(3);
      for (const r of rects) {
        expect(palette.has(r.color)).toBe(true);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(EMOTE_ICON_SIZE);
        expect(r.y + r.h).toBeLessThanOrEqual(EMOTE_ICON_SIZE);
      }
    }
  });

  it('un id fuera de rango no rompe: cae en el saludo', () => {
    expect(emoteIconRects(99)).toBe(emoteIconRects(0));
  });
});
