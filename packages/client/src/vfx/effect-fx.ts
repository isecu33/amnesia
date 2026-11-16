/**
 * Secuencias de identidad de efecto (P1, docs/06 principio 2): Vislumbre vela,
 * Doble Robo ámbar, Espionaje cuervo, Ojo Compartido ojo místico, Revuelo
 * torbellino, Trueque Vidente chamán púrpura, más ventana de robo, presagio,
 * cadena rota, regalo Salvaje y efecto perdido. Solo usan casillas y jugadores
 * públicos (`publicInfo.slots`), nunca valores (I2).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { GameEvent, SlotRef } from '@totem/core';
import { DURATIONS } from '../presenter/timelines.js';
import { EFFECT_COLORS } from '../presenter/effects.js';
import { OMEN_COLORS } from '../presenter/hud-v2.js';
import { DECK_POSITION, DISCARD_POSITION, TABLE_HEIGHT } from '../scene/layout.js';
import type { Palette } from '../scene/palette.js';
import type { World } from '../scene/world.js';
import { makeChain, makeCrow, type BurstOptions, type ParticlePool } from './particles.js';
import type { ScreenFx } from './screen.js';

const TABLE_Y = TABLE_HEIGHT + 0.012;
const NIGHT = 0x1b1725;
const GREY = 0x8a8798;
const MAX_SLOTS_SCAN = 8;
/** Lo que se queda la marca sobre una casilla afectada para que los rivales la vean. */
export const SLOT_MARK_S = 1.4;

/** Piezas de `Vfx` que estas secuencias reutilizan. */
export interface FxKit {
  world: World;
  youId: string;
  p: Palette;
  add: ParticlePool;
  soft: ParticlePool;
  screen: ScreenFx;
  emit(pool: ParticlePool, at: THREE.Vector3, o: BurstOptions): void;
  ring(at: THREE.Vector3, color: number, size: number, dur: number): void;
  glowAt(at: THREE.Vector3, color: number, size: number, holdS: number, flicker?: number): void;
  puff(at: THREE.Vector3, color: number): void;
  stream(at: THREE.Vector3, durS: number, perS: number, o: BurstOptions): void;
  slam(at: THREE.Vector3, color: number, trauma: number, ringSize: number): void;
  at(delayS: number, fn: () => void): void;
  track<T extends gsap.core.Animation>(a: T): T;
  temp<T extends THREE.Object3D>(obj: T): T;
  kill(obj: THREE.Object3D): void;
  claim(obj: THREE.Object3D): void;
}

const v3 = (p: { x: number; y: number; z: number }): THREE.Vector3 =>
  new THREE.Vector3(p.x, p.y, p.z);

function slotPos(k: FxKit, r: SlotRef): THREE.Vector3 | undefined {
  return k.world.totemMesh(r.player, r.slot)?.position.clone();
}

/** Centro del altar de un jugador (media de sus tótems visibles). */
function altarCenter(k: FxKit, player: string): THREE.Vector3 | undefined {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < MAX_SLOTS_SCAN; i++) {
    const m = k.world.totemMesh(player, i);
    if (m?.visible) pts.push(m.position);
  }
  if (pts.length === 0) return undefined;
  const c = new THREE.Vector3();
  for (const q of pts) c.add(q);
  return c.multiplyScalar(1 / pts.length);
}

const slotsOf = (e: GameEvent): SlotRef[] => (e.e === 'EFFECT_RESOLVED' ? e.publicInfo.slots : []);

/** Marca pública: anillo + halo sobre cada casilla afectada (todos ven DÓNDE, nunca QUÉ). */
export function markSlots(k: FxKit, slots: readonly SlotRef[], color: number): void {
  for (const r of slots) {
    const at = slotPos(k, r);
    if (!at) continue;
    k.ring(at.clone().setY(TABLE_Y), color, 0.2, 0.6);
    k.glowAt(at.clone().setY(at.y + 0.06), color, 0.26, SLOT_MARK_S, 0.1);
  }
}

/** Vislumbre: halo de vela cálido y ascuas sobre tu tótem mirado. */
export function peekMark(k: FxKit, e: GameEvent): void {
  const c = EFFECT_COLORS.PEEK;
  markSlots(k, slotsOf(e), c);
  for (const r of slotsOf(e)) {
    const at = slotPos(k, r);
    if (at)
      k.emit(k.add, at, {
        count: 10,
        color0: c,
        color1: NIGHT,
        size: 0.016,
        speed: 0.3,
        lifeMs: 800,
        gravity: 0.3,
        spread: 0.3,
      });
  }
}

/** Espionaje: el espiado (y todos) ven un cuervo posarse sobre SU casilla. */
export function spyMark(k: FxKit, e: GameEvent): void {
  if (e.e !== 'EFFECT_RESOLVED') return;
  const c = EFFECT_COLORS.SPY;
  markSlots(k, e.publicInfo.slots, c);
  // El actor ya vio el vuelo entero con su vista privada.
  if (e.player === k.youId) return;
  const r = e.publicInfo.slots[0];
  const to = r ? slotPos(k, r) : undefined;
  if (!to) return;
  const crow = k.temp(makeCrow(c));
  crow.position.copy(v3(DISCARD_POSITION).setY(DISCARD_POSITION.y + 0.2));
  const wings = crow.children.filter((w) => w.name.startsWith('wing')).map((w) => w.rotation);
  const flap = k.track(
    gsap.fromTo(wings, { x: -0.7 }, { x: 0.7, duration: 0.11, yoyo: true, repeat: -1 }),
  );
  const perch = to.clone().setY(to.y + 0.14);
  k.track(
    gsap
      .timeline({
        onComplete: () => {
          flap.kill();
          k.kill(crow);
        },
      })
      .to(crow.position, { x: perch.x, y: perch.y, z: perch.z, duration: 0.45, ease: 'power2.out' })
      .to(crow.position, { y: perch.y + 0.4, duration: 0.5, ease: 'power2.in' }, 0.9),
  );
}

/** Ojo Compartido: un ojo místico se abre sobre las dos casillas, unidas por un hilo. */
export function sharedEye(k: FxKit, e: GameEvent): void {
  const slots = slotsOf(e);
  const c = EFFECT_COLORS.SHARED_EYE;
  markSlots(k, slots, c);
  const pts = slots.map((r) => slotPos(k, r)).filter((q): q is THREE.Vector3 => !!q);
  for (const q of pts) k.ring(q.clone().setY(q.y + 0.1), c, 0.12, 0.9);
  if (pts.length < 2) return;
  const line = k.temp(
    makeChain(
      pts.map((q) => q.clone().setY(q.y + 0.1)),
      c,
    ),
  );
  const mat = line.material as THREE.LineBasicMaterial;
  k.track(
    gsap
      .timeline({ onComplete: () => k.kill(line) })
      .fromTo(mat, { opacity: 0 }, { opacity: 0.9, duration: 0.2 })
      .to(mat, { opacity: 0, duration: 0.6 }, SLOT_MARK_S - 0.4),
  );
}

/** Revuelo: torbellino entre dos casillas de cualesquiera altares; los tótems giran. */
export function rumble(k: FxKit, e: GameEvent): void {
  const slots = slotsOf(e);
  const c = EFFECT_COLORS.RUMBLE;
  markSlots(k, slots, c);
  const pts = slots.map((r) => slotPos(k, r)).filter((q): q is THREE.Vector3 => !!q);
  const [a, b] = pts;
  if (!a || !b) return;
  const d = DURATIONS.rumble / 1000;
  for (const r of slots) {
    const m = k.world.totemMesh(r.player, r.slot);
    if (!m) continue;
    k.claim(m);
    const y0 = m.position.y;
    k.track(
      gsap
        .timeline()
        .to(m.position, { y: y0 + 0.08, duration: d * 0.3, ease: 'power2.out' })
        .to(
          m.rotation,
          { y: m.rotation.y + Math.PI * 4, duration: d * 0.8, ease: 'power2.inOut' },
          0,
        )
        .to(m.position, { y: y0, duration: d * 0.3, ease: 'bounce.out' }, d * 0.65),
    );
  }
  const mid = a.clone().lerp(b, 0.5);
  const radius = Math.max(0.06, a.distanceTo(b) / 2);
  const kk = { t: 0 };
  k.track(
    gsap.to(kk, {
      t: 1,
      duration: d * 0.9,
      ease: 'none',
      onUpdate: () => {
        const ang = kk.t * Math.PI * 6;
        const rr = radius * (1 - kk.t * 0.6);
        for (const side of [0, Math.PI]) {
          k.soft.spawn({
            pos: new THREE.Vector3(
              mid.x + Math.cos(ang + side) * rr,
              TABLE_Y + 0.03 + kk.t * 0.25,
              mid.z + Math.sin(ang + side) * rr,
            ),
            vel: new THREE.Vector3(0, 0.08, 0),
            lifeMs: 600,
            size0: 0.025,
            size1: 0.045,
            color0: c,
            color1: NIGHT,
            gravity: 0.05,
            drag: 1,
          });
        }
      },
    }),
  );
}

/** Trueque Vidente, paso 1: ojo de chamán púrpura y chispas que suben del tótem mirado. */
export function seerLook(k: FxKit, e: GameEvent): void {
  const c = EFFECT_COLORS.SEER;
  markSlots(k, slotsOf(e), c);
  for (const r of slotsOf(e)) {
    const at = slotPos(k, r);
    if (at)
      k.stream(at, 0.8, 12, {
        count: 2,
        color0: c,
        color1: NIGHT,
        size: 0.018,
        speed: 0.25,
        lifeMs: 700,
        gravity: 0.5,
        radius: 0.04,
      });
  }
}

/** Ventana de robo: pulsos del color del efecto sobre el descarte mientras dura. */
export function stealOpen(k: FxKit, e: GameEvent, windowMs: number): void {
  if (e.e !== 'STEAL_WINDOW_OPENED') return;
  const c = EFFECT_COLORS[e.effect];
  const at = v3(DISCARD_POSITION).setY(TABLE_Y);
  const pulses = 3;
  const gap = windowMs / 1000 / pulses;
  for (let i = 0; i < pulses; i++) k.at(i * gap, () => k.ring(at, c, 0.32 - i * 0.06, gap));
  k.glowAt(at.clone().setY(TABLE_Y + 0.05), c, 0.34, windowMs / 1000, 0.2);
}

/** Cadena rota: chispas grises que caen sin fuerza. */
export function chainBroken(k: FxKit): void {
  k.emit(k.soft, v3(DISCARD_POSITION), {
    count: 14,
    color0: GREY,
    color1: NIGHT,
    size: 0.02,
    speed: 0.3,
    lifeMs: 700,
    gravity: -1.5,
    spread: 0.6,
  });
}

/** Presagio: halo del color del presagio sobre el descarte. */
export function omen(k: FxKit, e: GameEvent): void {
  if (e.e !== 'OMEN_CHANGED') return;
  const at = v3(DISCARD_POSITION).setY(TABLE_Y + 0.04);
  if (!e.omen) return k.puff(at, GREY);
  const c = OMEN_COLORS[e.omen];
  k.ring(at.clone().setY(TABLE_Y), c, 0.4, 0.9);
  k.glowAt(at, c, 0.4, 1.2, 0.15);
}

/** Doble Robo: dos halos ámbar sobre el altar del jugador (marcador pendiente). */
export function doubleDraw(k: FxKit, e: GameEvent): void {
  if (e.e !== 'DOUBLE_DRAW_PENDING') return;
  const at = altarCenter(k, e.player);
  if (!at) return;
  const c = EFFECT_COLORS.DOUBLE_DRAW;
  for (const dx of [-0.04, 0.04])
    k.glowAt(at.clone().add(new THREE.Vector3(dx, 0.12, 0)), c, 0.2, 1, 0.1);
  k.ring(at.clone().setY(TABLE_Y), c, 0.3, 0.7);
}

export function doubleDrawClear(k: FxKit, e: GameEvent): void {
  if (e.e !== 'DOUBLE_DRAW_CLEARED') return;
  const at = altarCenter(k, e.player);
  if (at) k.puff(at.setY(at.y + 0.06), EFFECT_COLORS.DOUBLE_DRAW);
}

/** Tus dos cartas del Doble Robo: dos destellos ámbar sobre el mazo. */
export function doubleDrew(k: FxKit): void {
  const at = v3(DECK_POSITION).setY(TABLE_Y + 0.08);
  const c = EFFECT_COLORS.DOUBLE_DRAW;
  k.glowAt(at.clone().add(new THREE.Vector3(-0.03, 0, 0)), c, 0.18, 0.6);
  k.at(0.12, () => k.glowAt(at.clone().add(new THREE.Vector3(0.03, 0, 0)), c, 0.18, 0.5));
}

/** La carta rechazada cae al descarte (E32: sin efecto, matchable). */
export function doubleDrawReject(k: FxKit): void {
  k.at(0.3, () => k.slam(v3(DISCARD_POSITION), EFFECT_COLORS.DOUBLE_DRAW, 0.1, 0.18));
}

/** Salvaje: estela mística del hueco del acertante al hueco abierto del rival. */
export function wildGift(k: FxKit, e: GameEvent): void {
  if (e.e !== 'WILD_GIFT') return;
  const from = slotPos(k, { player: e.from, slot: e.fromSlot }) ?? altarCenter(k, e.from);
  const to = slotPos(k, { player: e.to, slot: e.toSlot }) ?? altarCenter(k, e.to);
  if (!from || !to) return;
  const c = k.p.mystic;
  const kk = { t: 0 };
  k.track(
    gsap.to(kk, {
      t: 1,
      duration: DURATIONS.wildGift / 1000,
      ease: 'power1.inOut',
      onUpdate: () => {
        const q = from.clone().lerp(to, kk.t);
        q.y += Math.sin(kk.t * Math.PI) * 0.25;
        k.add.spawn({
          pos: q,
          vel: new THREE.Vector3(0, 0.04, 0),
          lifeMs: 400,
          size0: 0.02,
          size1: 0.004,
          color0: c,
          color1: NIGHT,
          gravity: 0,
          drag: 2,
        });
      },
      onComplete: () => k.ring(to.clone().setY(TABLE_Y), c, 0.18, 0.4),
    }),
  );
}

/** Efecto perdido u omitido: soplo gris suave sobre el descarte. */
export function fizzle(k: FxKit): void {
  k.puff(v3(DISCARD_POSITION).setY(TABLE_Y + 0.03), GREY);
}
