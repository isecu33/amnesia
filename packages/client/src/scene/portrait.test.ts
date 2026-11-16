/** Retratos pixel de los animales totémicos y logo (pantallas de inicio y sala). */
import { describe, expect, it } from 'vitest';
import {
  LOGO_POP_MS,
  LOGO_STAGGER_MS,
  LOGO_TEXT,
  PORTRAIT_SIZE,
  blinkGrid,
  letterOffset,
  logoBitmap,
  portraitGrid,
} from './portrait.js';
import { SPECIES_IDS } from './species.js';

const flat = (g: ReturnType<typeof portraitGrid>): string =>
  g.map((row) => row.map((c) => (c === null ? '.' : c.toString(16))).join(',')).join('/');

describe('retratos de los animales', () => {
  it('son cuadrículas de 16×16', () => {
    for (const id of SPECIES_IDS) {
      const g = portraitGrid(id);
      expect(g).toHaveLength(PORTRAIT_SIZE);
      expect(g.every((row) => row.length === PORTRAIT_SIZE)).toBe(true);
    }
  });

  it('los seis se distinguen entre sí por silueta y color', () => {
    const all = SPECIES_IDS.map((id) => flat(portraitGrid(id)));
    expect(new Set(all).size).toBe(SPECIES_IDS.length);
    const shapes = SPECIES_IDS.map((id) =>
      portraitGrid(id)
        .map((row) => row.map((c) => (c === null ? '.' : '#')).join(''))
        .join('/'),
    );
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(5);
  });

  it('son deterministas', () => {
    for (const id of SPECIES_IDS) expect(flat(portraitGrid(id))).toBe(flat(portraitGrid(id)));
  });

  it('tienen cabeza dibujada y no ocupan solo el borde', () => {
    for (const id of SPECIES_IDS) {
      const painted = portraitGrid(id)
        .flat()
        .filter((c) => c !== null).length;
      expect(painted).toBeGreaterThan(70);
      expect(painted).toBeLessThan(PORTRAIT_SIZE * PORTRAIT_SIZE);
    }
  });

  it('la cara es simétrica salvo el rasgo del animal (ojos a la misma altura)', () => {
    for (const id of SPECIES_IDS) {
      const g = portraitGrid(id);
      const eyeRows = g
        .map((row, y) => ({ y, n: row.filter((c, x) => c !== null && c === row[15 - x]).length }))
        .filter((r) => r.n >= 8);
      expect(eyeRows.length).toBeGreaterThan(4);
    }
  });
});

describe('logo en bitmap', () => {
  it('dibuja el nombre del juego con acento', () => {
    expect(LOGO_TEXT).toBe('TÓTEM');
    const b = logoBitmap();
    expect(b.height).toBeGreaterThan(7);
    expect(b.width).toBeGreaterThan(5 * 5);
    expect(b.rows.every((r) => r.length === b.width)).toBe(true);
    expect(b.rows.join('').includes('#')).toBe(true);
  });
});

describe('animación de retratos y logo (P3)', () => {
  it('el parpadeo solo toca las filas de los ojos', () => {
    for (const id of SPECIES_IDS) {
      const open = portraitGrid(id);
      const shut = blinkGrid(id);
      open.forEach((row, y) => {
        if (y === 7 || y === 8) return;
        expect(shut[y]).toEqual(row);
      });
      expect(shut).not.toEqual(open);
    }
  });

  it('las letras entran en orden, rebotan y quedan en reposo', () => {
    expect(Number.isNaN(letterOffset(2, 0))).toBe(true);
    expect(letterOffset(0, 0)).toBeLessThan(0);
    const settled = 4 * LOGO_STAGGER_MS + LOGO_POP_MS;
    for (let i = 0; i < 5; i++) {
      const dy = letterOffset(i, settled);
      expect(Number.isInteger(dy)).toBe(true);
      expect(Math.abs(dy)).toBeLessThanOrEqual(1);
    }
  });
});
