// IK en espacio mundo sobre huesos de Mixamo, aplicada encima del clip del
// AnimationMixer cada frame. Prototipo (oso-preview); no depende del rig propio.
import * as THREE from 'three';

const _parentQ = new THREE.Quaternion();
const _worldQ = new THREE.Quaternion();
const _targetQ = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Fija la orientación en mundo de `bone`, mezclada con su pose actual según `weight`. */
export function setWorldQuaternion(bone: THREE.Object3D, target: THREE.Quaternion, weight: number): void {
  if (weight <= 0 || !bone.parent) return;
  bone.parent.getWorldQuaternion(_parentQ);
  bone.getWorldQuaternion(_worldQ);
  if (_worldQ.dot(target) < 0) _targetQ.set(-target.x, -target.y, -target.z, -target.w);
  else _targetQ.copy(target);
  _worldQ.slerp(_targetQ, Math.min(1, weight));
  bone.quaternion.copy(_parentQ.invert().multiply(_worldQ));
  bone.updateMatrixWorld(true);
}

/** Rota `bone` en mundo por `delta`, mezclado con su pose actual según `weight`. */
export function rotateWorld(bone: THREE.Object3D, delta: THREE.Quaternion, weight: number): void {
  if (weight <= 0) return;
  bone.getWorldQuaternion(_q);
  setWorldQuaternion(bone, _q.premultiply(delta), weight);
}

/** Gira `bone` para que su eje local hacia `from` apunte a `to` (ambos en mundo). */
export function aimWorld(
  bone: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  weight: number,
): void {
  const origin = bone.getWorldPosition(_a);
  const d0 = _b.subVectors(from, origin).normalize();
  const d1 = _c.subVectors(to, origin).normalize();
  rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(d0, d1), weight);
}

export interface ArmChain {
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand: THREE.Object3D;
}

/** Extensión máxima permitida: evita el codo bloqueado (hiperextensión visual). */
const MAX_EXTENSION = 0.985;

/**
 * IK analítica de dos huesos: coloca la muñeca en `target` con el codo hacia
 * `pole` (dirección en mundo). Devuelve la extensión relativa (distancia /
 * longitud del brazo) para depurar alcances.
 */
export function solveArm(arm: ArmChain, target: THREE.Vector3, pole: THREE.Vector3, weight: number): number {
  const s = arm.upper.getWorldPosition(new THREE.Vector3());
  const e = arm.fore.getWorldPosition(new THREE.Vector3());
  const h = arm.hand.getWorldPosition(new THREE.Vector3());
  const upperLen = s.distanceTo(e);
  const foreLen = e.distanceTo(h);
  const toT = new THREE.Vector3().subVectors(target, s);
  const ratio = toT.length() / (upperLen + foreLen);
  if (weight <= 0) return ratio;

  const dist = THREE.MathUtils.clamp(toT.length(), 1e-3, (upperLen + foreLen) * MAX_EXTENSION);
  const dir = toT.normalize();
  const cosA = (upperLen ** 2 + dist ** 2 - foreLen ** 2) / (2 * upperLen * dist);
  const angA = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = s
    .clone()
    .addScaledVector(dir, upperLen * Math.cos(angA))
    .addScaledVector(perp, upperLen * Math.sin(angA));

  aimWorld(arm.upper, e, elbow, weight);
  aimWorld(arm.fore, arm.hand.getWorldPosition(new THREE.Vector3()), target, weight);
  return ratio;
}

/**
 * Orienta la mano en mundo y reparte `share` del giro axial (pronosupinación)
 * al antebrazo, que gira sobre su propio eje sin mover la muñeca; así la
 * muñeca no se retuerce como un caramelo.
 */
export function orientHand(arm: ArmChain, target: THREE.Quaternion, share: number, weight: number): void {
  if (weight <= 0) return;
  const elbow = arm.fore.getWorldPosition(_a);
  const wrist = arm.hand.getWorldPosition(_b);
  const axis = _d.subVectors(wrist, elbow).normalize();
  // delta = target · actual⁻¹, y su componente "twist" alrededor del eje del antebrazo.
  const current = arm.hand.getWorldQuaternion(new THREE.Quaternion());
  const delta = target.clone().multiply(current.invert());
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const proj = axis.dot(_c.set(delta.x, delta.y, delta.z));
  const twist = new THREE.Quaternion(axis.x * proj, axis.y * proj, axis.z * proj, delta.w).normalize();
  const partial = new THREE.Quaternion().slerp(twist, share * Math.min(1, weight));
  rotateWorld(arm.fore, partial, 1);
  setWorldQuaternion(arm.hand, target, weight);
}

/**
 * Fija el ángulo de cada falange de `chain` (Index1..Index4, el último solo
 * como punta) respecto al eje +Y de la mano, girando sobre el +X de la mano.
 * Se mide el ángulo real cada frame, así es independiente del clip.
 */
export function setFingerCurl(
  hand: THREE.Object3D,
  chain: readonly THREE.Object3D[],
  angles: readonly number[],
  weight: number,
): void {
  if (weight <= 0) return;
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const invHand = handQ.clone().invert();
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(handQ);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let i = 0; i < chain.length - 1; i++) {
    const bone = chain[i]!;
    const target = angles[i];
    if (target === undefined) break;
    bone.getWorldPosition(p0);
    chain[i + 1]!.getWorldPosition(p1);
    const local = p1.sub(p0).applyQuaternion(invHand);
    const current = Math.atan2(local.z, local.y);
    const delta = (target - current) * Math.min(1, weight);
    rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, delta), 1);
  }
}
