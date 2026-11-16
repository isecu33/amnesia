/** WP P2 · reacciones, emotes, plan de clips y capa procedural del rig. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GameEvent } from '@totem/core';
import {
  EMOTE_POSES,
  MAX_CLIP_SPEED,
  POSES,
  clipPlan,
  cueForEvent,
  missingClips,
  poseForEmote,
  poseForEvent,
  reactionForEvent,
} from './poses.js';
import { clampGaze, layerOnBone } from './rig-math.js';
import { GLANCE_MAX_S, GLANCE_MIN_S, nextGlanceDelayS, pickGlanceClip } from './idle.js';

const effect = (kind: string, who: string, target: string): GameEvent => ({
  e: 'EFFECT_RESOLVED',
  player: who,
  effect: kind,
  publicInfo: { slots: [{ player: target, slot: 1 }] },
});

describe('gesto distinto por efecto', () => {
  it('cada efecto del actor tiene su pose', () => {
    const pose = (k: string): string | undefined => poseForEvent(effect(k, 'a', 'b'), 'a')?.pose;
    expect(pose('PEEK')).toBe('peek');
    expect(pose('SPY')).toBe('spy');
    expect(pose('SWAP')).toBe('swap');
    expect(pose('RUMBLE')).toBe('swap');
    expect(pose('SEER')).toBe('seer');
    expect(pose('DOUBLE_DRAW')).toBe('point');
  });
});

describe('reactionForEvent', () => {
  it('el objetivo de un efecto se sobresalta mirando al actor; un tercero no', () => {
    expect(reactionForEvent(effect('SPY', 'a', 'b'), 'b')).toEqual({
      pose: 'startle',
      target: { kind: 'player', player: 'a' },
    });
    expect(reactionForEvent(effect('SPY', 'a', 'b'), 'c')).toBeUndefined();
    expect(reactionForEvent(effect('SPY', 'a', 'b'), 'a')).toBeUndefined();
  });

  it('PRIVATE_REVEAL: el espiado se sobresalta, sin usar el valor (I2)', () => {
    const e: GameEvent = { e: 'PRIVATE_REVEAL', to: 'a', player: 'b', slot: 0, value: 7, ttlMs: 1 };
    const cue = reactionForEvent(e, 'b');
    expect(cue?.pose).toBe('startle');
    expect(JSON.stringify(cue)).not.toContain('7');
    expect(reactionForEvent(e, 'a')).toBeUndefined();
  });

  it('robo de efecto: el dueño se sobresalta y el ladrón golpea', () => {
    const e: GameEvent = { e: 'EFFECT_STOLEN', thief: 't', owner: 'o', effect: 'SPY' };
    expect(reactionForEvent(e, 'o')?.pose).toBe('startle');
    expect(reactionForEvent(e, 't')?.pose).toBe('slap');
  });

  it('penalización y fallos', () => {
    expect(reactionForEvent({ e: 'PENALTY_CARD', player: 'a', slot: 0 }, 'a')?.pose).toBe('sigh');
    const fail: GameEvent = { e: 'MATCH_FAIL', player: 'a', slot: 2, value: 3, penalty: 'card' };
    expect(reactionForEvent(fail, 'a')).toBeUndefined(); // lo cubre flinch
    expect(cueForEvent(fail, 'a')?.pose).toBe('flinch');
    expect(reactionForEvent(fail, 'b')?.pose).toBe('glance');
    expect(reactionForEvent({ ...fail, owner: 'b' }, 'b')?.pose).toBe('startle');
  });

  it('MATCH_OK de otros: mirada al hueco; ULTIMA: todos miran al que llama', () => {
    const ok: GameEvent = { e: 'MATCH_OK', player: 'a', slot: 1, value: 3 };
    expect(reactionForEvent(ok, 'b')).toEqual({
      pose: 'glance',
      target: { kind: 'slot', player: 'a', slot: 1 },
    });
    expect(reactionForEvent(ok, 'a')).toBeUndefined();
    const u: GameEvent = { e: 'ULTIMA_CALLED', player: 'a' };
    expect(reactionForEvent(u, 'b')?.target).toEqual({ kind: 'player', player: 'a' });
    expect(cueForEvent(u, 'a')?.pose).toBe('ultima');
  });

  it('fin de partida: ganador celebra, el resto se hunde', () => {
    const g: GameEvent = { e: 'GAME_ENDED', winner: 'a', totals: { a: 1, b: 9 } };
    expect(cueForEvent(g, 'a')?.pose).toBe('cheer');
    expect(cueForEvent(g, 'b')?.pose).toBe('slump');
  });
});

describe('emotes', () => {
  it('seis emotes con pose propia; fuera de rango saluda', () => {
    expect(EMOTE_POSES).toHaveLength(6);
    for (const p of EMOTE_POSES) expect(POSES[p]).toBeDefined();
    expect(poseForEmote(1).pose).toBe('laugh');
    expect(poseForEmote(99).pose).toBe('wave');
  });
});

describe('plan de clips', () => {
  it('acelera las poses rápidas sin pasar del tope', () => {
    const slap = clipPlan('slap', { reduced: false });
    expect(slap?.clip).toBe('coger_carta');
    expect(slap?.timeScale).toBeGreaterThan(2);
    expect(slap?.timeScale).toBeLessThanOrEqual(MAX_CLIP_SPEED);
    expect(clipPlan('peek', { reduced: false })?.timeScale).toBeGreaterThanOrEqual(1);
  });

  it('solo el agarre del mazo/descarte se queda sosteniendo la carta', () => {
    expect(clipPlan('reach', { reduced: false, grabbing: true })?.hold).toBe(true);
    expect(clipPlan('reach', { reduced: false, grabbing: false })?.hold).toBe(false);
    expect(clipPlan('toss', { reduced: false })?.hold).toBe(false);
  });

  it('la mirada elige clip por lado; sin clip para poses sin gesto; reducir = nada', () => {
    expect(clipPlan('glance', { reduced: false, side: 'right' })?.clip).toBe('mirar_der');
    expect(clipPlan('glance', { reduced: false, side: 'left' })?.clip).toBe('mirar_izq');
    expect(clipPlan('cheer', { reduced: false })).toBeUndefined();
    expect(clipPlan('slap', { reduced: true })).toBeUndefined();
  });

  it('detecta clips que faltan', () => {
    expect(missingClips(['reposo', 'coger_carta', 'mirar_izq', 'mirar_der'])).toEqual([]);
    expect(missingClips(['reposo'])).toEqual(['coger_carta', 'mirar_izq', 'mirar_der']);
  });
});

describe('capa procedural del rig', () => {
  it('layerOnBone gira en ejes del personaje aunque el padre esté rotado', () => {
    const parent = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    const out = layerOnBone(
      new THREE.Quaternion(),
      new THREE.Quaternion(),
      parent,
      delta,
      new THREE.Quaternion(),
    );
    // Mundo del hueso = P·out debe ser D·P (0,4 rad sobre el eje Y del personaje).
    const world = parent.clone().multiply(out);
    expect(world.angleTo(delta.clone().multiply(parent))).toBeLessThan(1e-6);
  });

  it('con delta identidad deja el hueso intacto', () => {
    const bone = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
    const out = layerOnBone(
      new THREE.Quaternion(),
      bone,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1),
      new THREE.Quaternion(),
      new THREE.Quaternion(),
    );
    expect(out.angleTo(bone)).toBeLessThan(1e-6);
  });

  it('el cuello tiene tope', () => {
    expect(clampGaze(5, -5)).toEqual({ yaw: 0.7, pitch: -0.4 });
    expect(clampGaze(0.1, 0.1)).toEqual({ yaw: 0.1, pitch: 0.1 });
  });
});

describe('miradas de reposo del rig', () => {
  it('cada 6–12 s y a un lado aleatorio', () => {
    expect(nextGlanceDelayS(() => 0)).toBe(GLANCE_MIN_S);
    expect(nextGlanceDelayS(() => 1)).toBe(GLANCE_MAX_S);
    expect(pickGlanceClip(() => 0.1)).toBe('mirar_izq');
    expect(pickGlanceClip(() => 0.9)).toBe('mirar_der');
  });
});
