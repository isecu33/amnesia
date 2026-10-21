/**
 * Arbitraje de escritura sobre el transform de la escena (D-040).
 *
 * La escena tiene DOS escritores: la reconciliación de datos (`World.update`,
 * que traduce `PlayerView` a posiciones) y las timelines GSAP de `vfx/sequences`.
 * Sin arbitraje el primero pisa al segundo en cada frame —`mesh.position.set()`
 * justo antes del `render()`— y las animaciones simplemente no se ven, que es
 * exactamente lo que pasaba: todo el WP-11 estaba visualmente muerto.
 *
 * Fuente de verdad: `gsap.getTweensOf(target)`, que ya devuelve la tween en el
 * mismo momento en que se crea. NO se usa `gsap.isTweening()`, que devuelve
 * `false` entre la creación y el primer tick — justo la ventana en la que el
 * bucle de render pisaría. Así ninguna secuencia tiene que acordarse de pedir
 * permiso: basta con animar.
 *
 * El bloqueo explícito (`lockTransform`) queda para animaciones que no pasan por
 * GSAP (interpolaciones a mano en el bucle de render, por ejemplo).
 */
import gsap from 'gsap';
import type * as THREE from 'three';

export type TransformChannel = 'position' | 'rotation' | 'scale';

type Counters = Partial<Record<TransformChannel, number>>;

const locks = new Map<THREE.Object3D, Counters>();
/** Se incrementa en cada liberación: permite re-reconciliar solo cuando hace falta. */
let releases = 0;

export function lockTransform(obj: THREE.Object3D, channels: readonly TransformChannel[]): void {
  let counters = locks.get(obj);
  if (!counters) {
    counters = {};
    locks.set(obj, counters);
  }
  for (const c of channels) counters[c] = (counters[c] ?? 0) + 1;
}

export function unlockTransform(obj: THREE.Object3D, channels: readonly TransformChannel[]): void {
  const counters = locks.get(obj);
  if (!counters) return;
  for (const c of channels) {
    const n = (counters[c] ?? 0) - 1;
    if (n > 0) counters[c] = n;
    else delete counters[c];
  }
  if (Object.keys(counters).length === 0) locks.delete(obj);
  releases++;
}

function tweening(target: object): boolean {
  return gsap.getTweensOf(target).length > 0;
}

/** ¿Hay alguien animando este canal ahora mismo? */
export function isTransformLocked(obj: THREE.Object3D, channel: TransformChannel): boolean {
  if ((locks.get(obj)?.[channel] ?? 0) > 0) return true;
  return tweening(obj[channel]);
}

/** ¿Está el objeto animándose en algún canal (incluido el objeto entero)? */
export function isTransformBusy(obj: THREE.Object3D): boolean {
  if (locks.has(obj)) return true;
  return tweening(obj) || tweening(obj.position) || tweening(obj.rotation) || tweening(obj.scale);
}

/**
 * Sello de liberaciones. Cuando cambia, la escena puede haberse quedado desalineada
 * respecto a la vista (la tween terminó donde le dio la gana) y hay que reconciliar.
 */
export function releaseSeq(): number {
  return releases + gsap.globalTimeline.getChildren(true, true, false).length;
}

/** Suelta todo (desmontaje de la escena): ninguna tween sobrevive al `dispose`. */
export function clearTransformLocks(): void {
  if (locks.size === 0) return;
  locks.clear();
  releases++;
}

/** Solo para diagnóstico y tests: cuántos objetos tienen algún canal bloqueado. */
export function lockedObjectCount(): number {
  return locks.size;
}
