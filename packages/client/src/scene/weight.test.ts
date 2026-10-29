/** D-045 · «peso» de reach/toss/slap: solo puesta en escena, nunca bloquea. */
import { describe, expect, it } from 'vitest';
import { WEIGHT, WEIGHT_MAX_MS, weightFor, type PoseId } from './poses.js';
import { beatFor } from '../presenter/timelines.js';
import type { GameEvent } from '@totem/core';

describe('peso al jugar carta', () => {
  it('lo tienen reach, toss y slap y ninguna otra pose', () => {
    expect(Object.keys(WEIGHT).sort()).toEqual(['reach', 'slap', 'toss']);
    for (const p of ['idle', 'turn', 'point', 'cheer'] as PoseId[])
      expect(weightFor(p, false)).toBeUndefined();
  });

  it('es pequeño: la retirada con retardo cabe bajo el tope', () => {
    for (const w of Object.values(WEIGHT)) {
      expect(w.retractMs).toBeGreaterThan(0);
      expect(w.retractMs).toBeLessThanOrEqual(WEIGHT_MAX_MS);
    }
  });

  it('«reducir movimiento» lo desactiva', () => {
    expect(weightFor('reach', true)).toBeUndefined();
    expect(weightFor('toss', true)).toBeUndefined();
    expect(weightFor('slap', true)).toBeUndefined();
    expect(weightFor('slap', false)).toBeDefined();
  });

  it('no toca la duración de los beats: el Descarte Rápido no se retrasa', () => {
    const match = { e: 'MATCH_OK' } as unknown as GameEvent;
    const discard = { e: 'DISCARDED_DRAWN' } as unknown as GameEvent;
    expect(beatFor(match).durationMs).toBe(700);
    expect(beatFor(discard).durationMs).toBe(500);
  });
});
