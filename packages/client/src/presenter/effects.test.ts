/** P1 · un efecto = una identidad (docs/06 principio 2), sin valores (I2). */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@totem/core';
import {
  EFFECT_COLORS,
  EFFECT_ICONS,
  EFFECT_KINDS,
  OMEN_ICONS,
  effectKindOf,
  isResolvedEffect,
  type ResolvedEffect,
} from './effects.js';
import { EFFECT_MOTIF, RESOLVED_BEATS, beatFor } from './timelines.js';
import { RECIPES } from '../audio/audio.js';

const RESOLVED: ResolvedEffect[] = [
  'PEEK',
  'SPY',
  'SWAP',
  'SHARED_EYE',
  'RUMBLE',
  'SEER_LOOK',
  'SEER_SWAP',
];
const resolved = (effect: string): GameEvent => ({
  e: 'EFFECT_RESOLVED',
  player: 'A',
  effect,
  publicInfo: {
    slots: [
      { player: 'A', slot: 0 },
      { player: 'B', slot: 2 },
    ],
  },
});

describe('identidad de efecto', () => {
  it('cada EFFECT_RESOLVED tiene su propia secuencia VFX y sonido', () => {
    const vfx = RESOLVED.map((k) => beatFor(resolved(k)).vfx);
    expect(vfx.every(Boolean)).toBe(true);
    expect(new Set(vfx).size).toBe(RESOLVED.length);
    for (const k of RESOLVED) expect(RECIPES[RESOLVED_BEATS[k].sfx], k).toBeTruthy();
  });

  it('los trueques mueven tótems (duración), las miradas no bloquean la cola', () => {
    for (const k of ['SWAP', 'RUMBLE', 'SEER_SWAP'] as const)
      expect(beatFor(resolved(k)).durationMs, k).toBeGreaterThan(0);
    for (const k of ['PEEK', 'SPY', 'SHARED_EYE', 'SEER_LOOK'] as const)
      expect(beatFor(resolved(k)).durationMs, k).toBe(0);
  });

  it('un efecto desconocido no rompe nada', () => {
    expect(isResolvedEffect('NOPE')).toBe(false);
    expect(beatFor(resolved('NOPE')).durationMs).toBe(0);
    expect(beatFor(resolved('NOPE')).vfx).toBeUndefined();
  });

  it('el Vidente se nombra por su efecto en los dos pasos', () => {
    expect(effectKindOf('SEER_LOOK')).toBe('SEER');
    expect(effectKindOf('SEER_SWAP')).toBe('SEER');
    expect(effectKindOf('SPY')).toBe('SPY');
  });

  it('leitmotiv, color e icono distintos por efecto', () => {
    const motifs = EFFECT_KINDS.map((k) => EFFECT_MOTIF[k]);
    expect(new Set(motifs).size).toBe(EFFECT_KINDS.length);
    const notes = motifs.map((m) => RECIPES[m].notes.join(','));
    expect(new Set(notes).size).toBe(EFFECT_KINDS.length);
    for (const m of motifs) expect(RECIPES[m].notes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(EFFECT_KINDS.map((k) => EFFECT_COLORS[k])).size).toBe(EFFECT_KINDS.length);
    expect(new Set(EFFECT_KINDS.map((k) => EFFECT_ICONS[k].join('|'))).size).toBe(
      EFFECT_KINDS.length,
    );
  });

  it('los iconos pixel son rejillas 7×7 (efectos y presagios)', () => {
    for (const rows of [...Object.values(EFFECT_ICONS), ...Object.values(OMEN_ICONS)]) {
      expect(rows).toHaveLength(7);
      for (const r of rows) expect(r).toMatch(/^[#.]{7}$/);
    }
  });
});

describe('beats de los eventos v2 que no tenían ninguno', () => {
  const cases: GameEvent[] = [
    { e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'RUMBLE', deadlineTick: 1 },
    { e: 'EFFECT_STOLEN', thief: 'B', owner: 'A', effect: 'SPY' },
    { e: 'CHAIN_LINK', player: 'A', link: 2, bonus: -1 },
    { e: 'CHAIN_BROKEN', links: 3 },
    { e: 'OMEN_CHANGED', omen: 'HASTE' },
    { e: 'DOUBLE_DRAW_PENDING', player: 'A' },
    { e: 'DOUBLE_DRAW_REJECTED', player: 'A', value: 4 },
    { e: 'DOUBLE_DREW_VALUES', to: 'A', values: [3, 9] },
    { e: 'WILD_GIFT', from: 'A', fromSlot: 0, to: 'B', toSlot: 1 },
    { e: 'EFFECT_SKIPPED', player: 'A', reason: 'timeout' },
    { e: 'DOUBLE_DRAW_CLEARED', player: 'A', reason: 'lost' },
  ];
  it.each(cases)('$e suena y se ve', (e) => {
    const b = beatFor(e);
    expect(b.vfx).toBeTruthy();
    expect(b.sfx && RECIPES[b.sfx]).toBeTruthy();
  });

  it('la ventana de robo suena con el leitmotiv de SU efecto y el tic', () => {
    const b = beatFor({ e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'SEER', deadlineTick: 1 });
    expect(b).toMatchObject({
      durationMs: 0,
      sfx: 'motifSeer',
      sfx2: 'stealTick',
      vfx: 'stealOpen',
    });
  });

  it('el presagio que se disipa no suena, pero se ve', () => {
    const b = beatFor({ e: 'OMEN_CHANGED', omen: null });
    expect(b.sfx).toBeUndefined();
    expect(b.vfx).toBe('omen');
  });
});
