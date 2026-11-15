import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GameEvent } from '@totem/core';
import { ParticlePool, burstSpecs } from './particles.js';
import { FLASH_MAX, FLASH_MIN_INTERVAL_MS, ScreenFx, TINT_MAX } from './screen.js';
import { SHAKE_MAX_OFFSET, addTrauma, decayTrauma, shakeOffset } from '../scene/camera-rig.js';
import { SCREEN_FX_UNIFORMS } from '../scene/postfx.js';
import { beatFor } from '../presenter/timelines.js';
import { RECIPES } from '../audio/audio.js';

const origin = new THREE.Vector3(0, 1, 0);

describe('ParticlePool (1 draw call para todas las partículas)', () => {
  it('nace, vive y muere según su vida', () => {
    const pool = new ParticlePool(16, true);
    for (const s of burstSpecs(origin, {
      count: 5,
      color0: 0xffffff,
      size: 0.02,
      speed: 1,
      lifeMs: 100,
    }))
      pool.spawn(s);
    expect(pool.alive).toBe(5);
    pool.update(50);
    expect(pool.alive).toBeGreaterThan(0);
    pool.update(200);
    expect(pool.alive).toBe(0);
  });

  it('lleno, recicla en anillo sin crecer', () => {
    const pool = new ParticlePool(8, false);
    for (const s of burstSpecs(origin, {
      count: 20,
      color0: 0,
      size: 0.02,
      speed: 1,
      lifeMs: 1000,
    }))
      pool.spawn(s);
    expect(pool.alive).toBe(8);
    expect(pool.points.geometry.getAttribute('position').count).toBe(8);
  });

  it('spread 0 dispara hacia arriba; la gravedad hace caer', () => {
    const specs = burstSpecs(origin, {
      count: 30,
      color0: 0,
      size: 0.02,
      speed: 1,
      lifeMs: 100,
      spread: 0,
    });
    for (const s of specs) expect(s.vel.y).toBeGreaterThan(0);
  });

  it('clear apaga todo', () => {
    const pool = new ParticlePool(4, true);
    for (const s of burstSpecs(origin, { count: 4, color0: 0, size: 0.02, speed: 1, lifeMs: 1000 }))
      pool.spawn(s);
    pool.clear();
    expect(pool.alive).toBe(0);
  });
});

describe('ScreenFx (destello seguro + viñeta + trauma)', () => {
  it('el destello se recorta a FLASH_MAX y decae a 0', () => {
    const fx = new ScreenFx();
    fx.impact({ color: 0xff0000, flash: 5 });
    expect(fx.flash).toBe(FLASH_MAX);
    fx.step(1000);
    expect(fx.flash).toBe(0);
  });

  it('nunca destella a más de 3 Hz', () => {
    const fx = new ScreenFx();
    fx.impact({ color: 0xffffff, flash: 0.3 });
    fx.step(FLASH_MIN_INTERVAL_MS / 2);
    const before = fx.flash;
    fx.impact({ color: 0xffffff, flash: 0.3 });
    expect(fx.flash).toBe(before);
    fx.step(FLASH_MIN_INTERVAL_MS);
    fx.impact({ color: 0xffffff, flash: 0.3 });
    expect(fx.flash).toBeCloseTo(0.3);
  });

  it('la viñeta se mantiene, se apaga y se recorta a TINT_MAX', () => {
    const fx = new ScreenFx();
    fx.tintPulse(0x00ff00, 9, 100, 100);
    expect(fx.tint).toBe(TINT_MAX);
    fx.step(80);
    expect(fx.tint).toBe(TINT_MAX);
    fx.step(70);
    expect(fx.tint).toBeGreaterThan(0);
    expect(fx.tint).toBeLessThan(TINT_MAX);
    fx.step(200);
    expect(fx.tint).toBe(0);
  });

  it('D-015: con menos movimiento no hay destello ni trauma, pero sí viñeta', () => {
    const fx = new ScreenFx(true);
    fx.impact({ color: 0xffffff, flash: 0.3, trauma: 1 });
    expect(fx.flash).toBe(0);
    expect(fx.trauma).toBe(0);
    fx.tintPulse(0xff0000, 0.4, 100, 100);
    expect(fx.tint).toBeCloseTo(0.4);
  });

  it('apply vuelca a los uniformes compartidos del postproceso (sRGB, sin linealizar)', () => {
    const fx = new ScreenFx();
    fx.tintPulse(0xff0000, 0.5, 100, 100);
    fx.apply();
    expect(SCREEN_FX_UNIFORMS.uTint.value).toBeCloseTo(0.5);
    expect(SCREEN_FX_UNIFORMS.uTintColor.value.toArray()).toEqual([1, 0, 0]);
    fx.reset();
    expect(SCREEN_FX_UNIFORMS.uTint.value).toBe(0);
  });
});

describe('sacudida de cámara (camera-rig)', () => {
  it('el trauma satura en 1 y se disipa', () => {
    expect(addTrauma(0.8, 0.8)).toBe(1);
    expect(decayTrauma(1, 10_000)).toBe(0);
  });

  it('acotada por SHAKE_MAX_OFFSET, nula sin trauma o con menos movimiento', () => {
    for (let t = 0; t < 2; t += 0.037) {
      const o = shakeOffset(1, t, false);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
    }
    expect(shakeOffset(0, 1, false)).toEqual({ x: 0, y: 0, z: 0 });
    expect(shakeOffset(1, 1, true)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('es determinista (sin Math.random): mismo t, mismo offset', () => {
    expect(shakeOffset(0.7, 0.42, false)).toEqual(shakeOffset(0.7, 0.42, false));
  });
});

describe('beats nuevos: suenan y brillan sin alterar el ritmo de la cola', () => {
  const extras: GameEvent[] = [
    { e: 'CHAIN_LINK', player: 'A', link: 2, bonus: 1 },
    { e: 'EFFECT_STOLEN', thief: 'A', owner: 'B', effect: 'PEEK' },
    { e: 'DECK_RESHUFFLED', deckCount: 20 },
    { e: 'GAME_ENDED', winner: 'A', totals: {} },
  ];
  it.each(extras)('$e', (e) => {
    const b = beatFor(e);
    expect(b.durationMs).toBe(0);
    expect(b.vfx).toBeTruthy();
    expect(RECIPES[b.sfx!]).toBeTruthy();
  });

  it('castigo y rechazo tienen VFX y mantienen su duración', () => {
    expect(beatFor({ e: 'PENALTY_CARD', player: 'A', slot: 0 })).toMatchObject({
      durationMs: 300,
      vfx: 'penalty',
    });
    expect(beatFor({ e: 'MATCH_REJECTED', player: 'A', reason: 'tooLate' })).toMatchObject({
      durationMs: 200,
      vfx: 'reject',
    });
  });
});
