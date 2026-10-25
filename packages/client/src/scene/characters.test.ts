/**
 * WP-18 · personajes (docs/01 §11, D-042): especies desde el avatar del lobby,
 * IK de dos huesos para que la mano llegue a mazo/descarte/slot, catálogo de
 * poses y regresión I2/E22 (la carta de un rival se pinta siempre por el dorso).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AVATAR_SPECIES, SPECIES, SPECIES_IDS, assignSpecies } from './species.js';
import { solveTwoBone } from './rig-math.js';
import { POSES, heldCardFace, poseForEvent } from './poses.js';
import { RIG } from './layout.js';
import type { GameEvent } from '@totem/core';

describe('especies totémicas', () => {
  it('hay seis animales originales, cada uno con silueta y color propios', () => {
    expect(SPECIES_IDS).toEqual(['owl', 'fox', 'bear', 'deer', 'snake', 'crow']);
    const furs = new Set(SPECIES_IDS.map((id) => SPECIES[id].fur));
    const silhouettes = new Set(SPECIES_IDS.map((id) => SPECIES[id].silhouette));
    expect(furs.size).toBe(6);
    expect(silhouettes.size).toBe(6);
  });

  it('cada uno de los 12 avatares del lobby apunta a una especie', () => {
    expect(AVATAR_SPECIES).toHaveLength(12);
    for (const s of AVATAR_SPECIES) expect(SPECIES_IDS).toContain(s);
  });

  it('respeta el avatar elegido y no repite especie mientras haya libres', () => {
    expect(assignSpecies([0, 1])).toEqual(['owl', 'fox']);
    const six = assignSpecies([0, 0, 0, 0, 0, 0]);
    expect(new Set(six).size).toBe(6);
    expect(six[0]).toBe('owl');
  });

  it('un avatar fuera de rango cae en una especie válida', () => {
    const [s] = assignSpecies([99]);
    expect(SPECIES_IDS).toContain(s);
  });
});

describe('IK de dos huesos (manos que alcanzan la mesa)', () => {
  const upper = RIG.upperArm;
  const fore = RIG.foreArm;

  /** Cinemática directa: el brazo cuelga en -Y; el codo gira sobre su X local. */
  const handFor = (sol: ReturnType<typeof solveTwoBone>): THREE.Vector3 => {
    const q = new THREE.Quaternion(sol.shoulder.x, sol.shoulder.y, sol.shoulder.z, sol.shoulder.w);
    const elbow = new THREE.Vector3(0, -upper, 0).applyQuaternion(q);
    const foreDir = new THREE.Vector3(0, -fore, 0).applyAxisAngle(
      new THREE.Vector3(1, 0, 0),
      sol.elbow,
    );
    return elbow.add(foreDir.applyQuaternion(q));
  };

  it('llega exactamente a un objetivo alcanzable', () => {
    for (const target of [
      { x: 0.1, y: -0.2, z: 0.35 },
      { x: -0.25, y: -0.1, z: 0.3 },
      { x: 0, y: -0.4, z: 0.1 },
    ]) {
      const sol = solveTwoBone(target, upper, fore);
      expect(sol.reached).toBe(true);
      const h = handFor(sol);
      expect(h.distanceTo(new THREE.Vector3(target.x, target.y, target.z))).toBeLessThan(1e-3);
    }
  });

  it('con un objetivo lejano estira el brazo hacia él sin romperse', () => {
    const target = { x: 0, y: -0.1, z: 2 };
    const sol = solveTwoBone(target, upper, fore);
    expect(sol.reached).toBe(false);
    const h = handFor(sol).normalize();
    const dir = new THREE.Vector3(target.x, target.y, target.z).normalize();
    expect(h.dot(dir)).toBeGreaterThan(0.99);
    expect(Number.isFinite(sol.elbow)).toBe(true);
  });

  it('el codo se dobla hacia abajo y hacia fuera, nunca hacia arriba', () => {
    const sol = solveTwoBone({ x: 0, y: -0.15, z: 0.3 }, upper, fore);
    const q = new THREE.Quaternion(sol.shoulder.x, sol.shoulder.y, sol.shoulder.z, sol.shoulder.w);
    const elbow = new THREE.Vector3(0, -upper, 0).applyQuaternion(q);
    // El codo queda por debajo de la recta hombro→mano.
    expect(elbow.y).toBeLessThan(-0.15 * (elbow.z / 0.3));
  });
});

describe('poses ligadas a los eventos (docs/01 §11)', () => {
  it('hay pose para cada animación del catálogo', () => {
    for (const p of [
      'idle',
      'turn',
      'reach',
      'hold',
      'toss',
      'point',
      'slap',
      'flinch',
      'ultima',
      'cheer',
      'slump',
    ] as const) {
      expect(POSES[p]).toBeDefined();
    }
  });

  it('cada evento público de un rival dispara su animación', () => {
    const ev = (e: GameEvent): string | undefined => poseForEvent(e, 'r1')?.pose;
    expect(ev({ e: 'TURN_STARTED', player: 'r1', orbit: 1, deadlineTick: 0 })).toBe('turn');
    expect(ev({ e: 'DREW', player: 'r1', source: 'deck' })).toBe('reach');
    expect(ev({ e: 'DREW', player: 'r1', source: 'discard' })).toBe('reach');
    expect(ev({ e: 'DISCARDED_DRAWN', player: 'r1', value: 4 })).toBe('toss');
    expect(ev({ e: 'SWAPPED_DRAWN', player: 'r1', slot: 2, discardedValue: 4 })).toBe('reach');
    expect(ev({ e: 'MATCH_OK', player: 'r1', slot: 1, value: 4 })).toBe('slap');
    expect(ev({ e: 'MATCH_FAIL', player: 'r1', slot: 1, value: 4, penalty: 'card' })).toBe(
      'flinch',
    );
    expect(ev({ e: 'ULTIMA_CALLED', player: 'r1' })).toBe('ultima');
    expect(
      ev({
        e: 'EFFECT_RESOLVED',
        player: 'r1',
        effect: 'SPY',
        publicInfo: { slots: [{ player: 'r2', slot: 0 }] },
      }),
    ).toBe('point');
    // Eventos de otros jugadores no mueven a r1.
    expect(ev({ e: 'DREW', player: 'r2', source: 'deck' })).toBeUndefined();
  });

  it('el golpe del Descarte Rápido es corto: nunca tapa la ventana de match', () => {
    expect(POSES.slap.durationMs).toBeLessThanOrEqual(250);
  });

  it('la reacción final depende de si ganó la ronda', () => {
    const scored: GameEvent = {
      e: 'ROUND_SCORED',
      scores: { r1: { round: 2, total: 2 }, r2: { round: 20, total: 20 } },
    };
    expect(poseForEvent(scored, 'r1')?.pose).toBe('cheer');
    expect(poseForEvent(scored, 'r2')?.pose).toBe('slump');
  });
});

describe('I2/E22 · la carta en la mano de un rival nunca enseña su valor', () => {
  it('un rival que roba del mazo la sostiene por el dorso', () => {
    expect(heldCardFace({ owner: 'r1', you: 'me', drawn: { source: 'deck' } })).toBe('back');
  });

  it('aunque el cliente conociera un valor, la carta de un rival se pinta por el dorso', () => {
    expect(heldCardFace({ owner: 'r1', you: 'me', drawn: { source: 'discard', value: 9 } })).toBe(
      'back',
    );
  });

  it('solo tu propia carta en mano puede verse de cara, y solo si sabes su valor', () => {
    expect(heldCardFace({ owner: 'me', you: 'me', drawn: { source: 'deck', value: 3 } })).toBe(3);
    expect(heldCardFace({ owner: 'me', you: 'me', drawn: { source: 'deck' } })).toBe('back');
  });
});
