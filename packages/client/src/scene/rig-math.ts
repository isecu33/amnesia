/**
 * IK analítica de dos huesos para las marionetas (D-042). Marco local del
 * hombro: el brazo en reposo cuelga en -Y y el codo gira sobre su X local.
 * Pura: se testea sin WebGL.
 */
import * as THREE from 'three';
import type { Vec3 } from './layout.js';

export interface TwoBoneSolution {
  /** rotación del hombro (cuaternión) */
  shoulder: { x: number; y: number; z: number; w: number };
  /** flexión del codo en radianes sobre la X local */
  elbow: number;
  /** false si el objetivo estaba fuera de alcance y el brazo solo apunta */
  reached: boolean;
}

const DOWN = new THREE.Vector3(0, -1, 0);

export function solveTwoBone(
  target: Vec3,
  upper: number,
  fore: number,
  pole: Vec3 = { x: 0, y: -1, z: -0.2 },
): TwoBoneSolution {
  const t = new THREE.Vector3(target.x, target.y, target.z);
  const len = t.length();
  const maxLen = upper + fore - 1e-4;
  const minLen = Math.abs(upper - fore) + 1e-4;
  const reached = len <= maxLen && len >= minLen;
  const L = Math.min(maxLen, Math.max(minLen, len));
  const dir = len > 1e-6 ? t.clone().divideScalar(len) : DOWN.clone();

  // Dirección del polo perpendicular a la recta hombro→mano (hacia donde va el codo).
  const p = new THREE.Vector3(pole.x, pole.y, pole.z);
  const perp = p.sub(dir.clone().multiplyScalar(p.dot(dir)));
  if (perp.lengthSq() < 1e-8) perp.set(0, 0, -1).sub(dir.clone().multiplyScalar(-dir.z));
  perp.normalize();

  const cosA = (upper * upper + L * L - fore * fore) / (2 * upper * L);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const u = dir
    .clone()
    .multiplyScalar(Math.cos(a))
    .add(perp.clone().multiplyScalar(Math.sin(a)));
  const hand = dir.clone().multiplyScalar(L);
  const w = hand.sub(u.clone().multiplyScalar(upper)).normalize();

  const cosB = Math.max(-1, Math.min(1, u.dot(w)));
  const elbow = Math.acos(cosB);
  // Base del hombro: Y = -u; Z = -(componente de w perpendicular a u).
  const yAxis = u.clone().negate();
  const zAxis = u.clone().multiplyScalar(cosB).sub(w);
  if (zAxis.lengthSq() < 1e-8) zAxis.copy(perp).negate();
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return { shoulder: { x: q.x, y: q.y, z: q.z, w: q.w }, elbow, reached };
}
