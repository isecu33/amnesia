import { describe, expect, it } from 'vitest';
import { MAP_IDS } from '@totem/protocol';
import { DEFAULT_MAP, MAPS, getMap, paletteForMap, selectMap } from './index.js';
import {
  DANGER,
  DANGER_CB,
  FIXED_COLORS,
  MYSTIC,
  MYSTIC_CB,
  PALETTE_MAX,
  PALETTE_MIN,
} from './palette-kit.js';

describe('registro de mapas (D-044)', () => {
  it('hay un descriptor por cada id del protocolo, con su propio id', () => {
    expect(Object.keys(MAPS).sort()).toEqual([...MAP_IDS].sort());
    for (const id of MAP_IDS) expect(MAPS[id].id).toBe(id);
  });

  it('el mapa por defecto es el nocturno con velas', () => {
    expect(DEFAULT_MAP).toBe('candle-night');
  });

  it.each(MAP_IDS)('%s: paleta de 24–32 colores únicos con los cuatro colores fijos', (id) => {
    const p = MAPS[id].paleta;
    expect(p.length).toBeGreaterThanOrEqual(PALETTE_MIN);
    expect(p.length).toBeLessThanOrEqual(PALETTE_MAX);
    expect(new Set(p).size).toBe(p.length);
    for (const c of FIXED_COLORS) expect(p).toContain(c);
  });

  it.each(MAP_IDS)(
    '%s: la luz de vela es la común y los colores del entorno están en la paleta',
    (id) => {
      const m = MAPS[id];
      expect(m.luces.candle.color).toBe(MAPS['candle-night'].luces.candle.color);
      const own = [
        m.mesa.wood,
        m.mesa.woodDark,
        m.mesa.rim,
        m.fondo.sky,
        m.fondo.skyHorizon,
        m.fondo.ground,
        m.fondo.groundAlt,
        ...m.fondo.treeColors,
      ];
      for (const c of own) expect(m.paleta, `0x${c.toString(16)}`).toContain(c);
    },
  );
});

describe('selectMap: selección pura de mapa y paleta', () => {
  it('un id válido devuelve su mapa', () => {
    for (const id of MAP_IDS) expect(selectMap(id, false).map.id).toBe(id);
  });

  it('id desconocido, vacío o «random» sin resolver caen al mapa por defecto', () => {
    for (const id of [undefined, '', 'random', 'castle'])
      expect(selectMap(id, false).map.id).toBe(DEFAULT_MAP);
    expect(getMap('constructor').id).toBe(DEFAULT_MAP);
  });

  it('la variante daltónica cambia solo místico y peligro, en todos los mapas', () => {
    for (const id of MAP_IDS) {
      const normal = selectMap(id, false).palette;
      const cb = selectMap(id, true).palette;
      expect(cb).toHaveLength(normal.length);
      expect(cb).not.toContain(DANGER);
      expect(cb).toContain(DANGER_CB);
      expect(cb).not.toContain(MYSTIC);
      expect(cb).toContain(MYSTIC_CB);
      normal.forEach((c, i) => {
        if (c !== MYSTIC && c !== DANGER) expect(cb[i]).toBe(c);
      });
    }
  });

  it('paletteForMap devuelve una copia', () => {
    const m = getMap('frozen-cave');
    const p = paletteForMap(m, false);
    p.push(0);
    expect(m.paleta).not.toContain(0);
  });
});
