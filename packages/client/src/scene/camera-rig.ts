/**
 * CameraRig (docs/01 §11, D-042): pose «mesa» / «mis tótems», giro lateral ±30°
 * que vuelve al centro y respiración idle. El estado es puro e inmutable (se
 * testea sin WebGL); `applyRig` lo vuelca a la `PerspectiveCamera`.
 */
import type * as THREE from 'three';
import {
  CAMERA,
  MAX_YAW,
  cameraPose,
  fovForAspect,
  type CameraPoseId,
  type Vec3,
} from './layout.js';

export const POSE_TRANSITION_MS = 300;
/** Píxeles de arrastre vertical que cambian de pose. */
export const DRAG_POSE_PX = 60;
const YAW_RETURN_MS = 180;

export interface RigState {
  pose: CameraPoseId;
  /** 0 = «mesa», 1 = «mis tótems» */
  blend: number;
  yaw: number;
  dragging: boolean;
  dragStartYaw: number;
  /** el arrastre actual ya cambió de pose: no vuelve a hacerlo */
  latched: boolean;
}

export const initialRig = (): RigState => ({
  pose: 'table',
  blend: 0,
  yaw: 0,
  dragging: false,
  dragStartYaw: 0,
  latched: false,
});

export function setPose(s: RigState, pose: CameraPoseId): RigState {
  return s.pose === pose ? s : { ...s, pose };
}

export const togglePose = (s: RigState): RigState =>
  setPose(s, s.pose === 'table' ? 'totems' : 'table');

/** `dx`/`dy`: desplazamiento acumulado desde que empezó el arrastre. */
export function onDrag(
  s: RigState,
  dx: number,
  dy: number,
  widthPx: number,
  reduced: boolean,
): RigState {
  const start = s.dragging ? s : { ...s, dragging: true, dragStartYaw: s.yaw, latched: false };
  let next = start;
  if (!reduced) {
    const yaw = start.dragStartYaw - (dx / Math.max(1, widthPx)) * MAX_YAW * 2;
    next = { ...next, yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw)) };
  }
  if (!next.latched && Math.abs(dy) > DRAG_POSE_PX) {
    next = { ...setPose(next, dy > 0 ? 'totems' : 'table'), latched: true };
  }
  return next;
}

export const onRelease = (s: RigState): RigState => ({ ...s, dragging: false, latched: false });

export function stepRig(s: RigState, dtMs: number, reduced: boolean): RigState {
  const target = s.pose === 'totems' ? 1 : 0;
  if (reduced) return { ...s, blend: target, yaw: 0 };
  const stepB = dtMs / POSE_TRANSITION_MS;
  const blend =
    target > s.blend ? Math.min(target, s.blend + stepB) : Math.max(target, s.blend - stepB);
  let yaw = s.yaw;
  if (!s.dragging) {
    yaw *= Math.exp(-dtMs / YAW_RETURN_MS);
    if (Math.abs(yaw) < 1e-4) yaw = 0;
  }
  return { ...s, blend, yaw };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixV = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  z: mix(a.z, b.z, t),
});

/** Coloca la cámara: mezcla de poses suavizada + giro + respiración. */
export function applyRig(
  camera: THREE.PerspectiveCamera,
  s: RigState,
  players: number,
  aspect: number,
  timeSec: number,
  reduced: boolean,
): void {
  const t = s.blend * s.blend * (3 - 2 * s.blend);
  const a = cameraPose('table', players);
  const b = cameraPose('totems', players);
  const pos = mixV(a.position, b.position, t);
  const look = mixV(a.lookAt, b.lookAt, t);
  const breath = reduced ? 0 : Math.sin(timeSec * CAMERA.idleSpeedHz * Math.PI * 2);
  const sway = reduced ? 0 : Math.sin(timeSec * 0.11 * Math.PI * 2);
  camera.position.set(
    pos.x + sway * CAMERA.idleAmplitude * 0.6,
    pos.y + breath * CAMERA.idleAmplitude,
    pos.z,
  );
  // El giro rota la dirección de mirada alrededor del eje vertical del ojo.
  const fx = look.x - pos.x;
  const fz = look.z - pos.z;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  camera.lookAt(
    camera.position.x + fx * c + fz * sn,
    look.y + breath * CAMERA.idleAmplitude,
    camera.position.z - fx * sn + fz * c,
  );
  const fov = fovForAspect(mix(a.fov, b.fov, t), aspect);
  if (Math.abs(camera.fov - fov) > 1e-3 || Math.abs(camera.aspect - aspect) > 1e-3) {
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}

// --- sacudida de cámara (game feel) ---------------------------------------

/** Amplitud máxima (m) de la sacudida con trauma = 1. */
export const SHAKE_MAX_OFFSET = 0.035;
/** Trauma que se disipa por segundo. */
export const SHAKE_DECAY_PER_S = 1.6;
/** Frecuencia base del temblor (Hz): rápida pero legible a 60 fps. */
const SHAKE_FREQ_HZ = 17;

/** Suma trauma (0..1) saturando: impactos seguidos no se disparan. */
export const addTrauma = (trauma: number, amount: number): number =>
  Math.max(0, Math.min(1, trauma + amount));

export const decayTrauma = (trauma: number, dtMs: number): number =>
  Math.max(0, trauma - (SHAKE_DECAY_PER_S * dtMs) / 1000);

/**
 * Desplazamiento de la sacudida: trauma² (los golpes flojos casi no se notan,
 * los fuertes sí) por una suma de senos desfasados por eje — determinista, sin
 * `Math.random`, así no salta entre frames. Con `reduced` siempre cero (D-015).
 */
export function shakeOffset(trauma: number, timeSec: number, reduced: boolean): Vec3 {
  if (reduced || trauma <= 0) return { x: 0, y: 0, z: 0 };
  const a = trauma * trauma * SHAKE_MAX_OFFSET;
  const w = timeSec * SHAKE_FREQ_HZ * Math.PI * 2;
  const n = (k1: number, k2: number, p: number): number =>
    (Math.sin(w * k1 + p) + Math.sin(w * k2 + p * 1.7) * 0.5) / 1.5;
  return { x: a * n(1, 2.3, 0.3), y: a * n(1.13, 2.9, 1.9), z: a * 0.5 * n(0.87, 2.1, 4.1) };
}
