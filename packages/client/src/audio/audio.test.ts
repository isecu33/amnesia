import { describe, expect, it } from 'vitest';
import { RECIPES } from './audio.js';
import { beatFor } from '../presenter/timelines.js';
import type { GameEvent } from '@totem/core';

describe('WP-11/14 · checklist de juice (docs/01 §11)', () => {
  it('cada acción de la tabla tiene animación Y sonido', () => {
    const acciones: GameEvent[] = [
      { e: 'DREW', player: 'A', source: 'deck' },
      { e: 'DISCARDED_DRAWN', player: 'A', value: 1 },
      { e: 'SWAPPED_DRAWN', player: 'A', slot: 0, discardedValue: 1 },
      { e: 'PRIVATE_REVEAL', to: 'A', player: 'A', slot: 0, value: 7, ttlMs: 3000 },
      { e: 'PRIVATE_REVEAL', to: 'A', player: 'B', slot: 0, value: 9, ttlMs: 3000 },
      { e: 'EFFECT_RESOLVED', player: 'A', effect: 'SWAP', publicInfo: { slots: [] } },
      { e: 'MATCH_OK', player: 'A', slot: 0, value: 4 },
      { e: 'MATCH_FAIL', player: 'A', slot: 0, value: 4, penalty: 'card' },
      { e: 'ULTIMA_CALLED', player: 'A' },
      { e: 'ROUND_REVEAL', hands: {} },
    ];
    for (const e of acciones) {
      const b = beatFor(e);
      expect(b.vfx, `${e.e} sin animación`).toBeTruthy();
      expect(b.sfx, `${e.e} sin sonido`).toBeTruthy();
      expect(RECIPES[b.sfx!], `${e.e} sin receta de audio`).toBeTruthy();
      expect(b.durationMs).toBeGreaterThan(0);
    }
  });

  it('todas las recetas de audio son válidas', () => {
    for (const [id, r] of Object.entries(RECIPES)) {
      expect(r.notes.length, id).toBeGreaterThan(0);
      expect(r.gain).toBeGreaterThan(0);
      expect(r.gain).toBeLessThanOrEqual(0.35);
      expect(r.noteMs).toBeGreaterThan(0);
    }
  });
});
