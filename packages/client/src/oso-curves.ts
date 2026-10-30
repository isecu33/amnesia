// Pistas de keyframes puras para el gesto del oso (oso-preview). Interpolación
// PCHIP (Fritsch–Butland): C1 y monótona entre claves, así una trayectoria que
// baja hasta la mesa nunca la atraviesa por overshoot de la spline; el overshoot
// que se quiera se pone como clave explícita.
import * as THREE from 'three';

export type Key<T> = readonly [time: number, value: T];

/** Pendientes PCHIP en cada clave; extremos con pendiente 0 (arranque/parada suaves). */
function pchipSlopes(ts: readonly number[], ys: readonly number[]): number[] {
  const n = ts.length;
  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const h0 = ts[k]! - ts[k - 1]!;
    const h1 = ts[k + 1]! - ts[k]!;
    const d0 = (ys[k]! - ys[k - 1]!) / h0;
    const d1 = (ys[k + 1]! - ys[k]!) / h1;
    if (d0 * d1 <= 0) continue;
    const w1 = 2 * h1 + h0;
    const w2 = h1 + 2 * h0;
    m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  return m;
}

/** Curva escalar muestreable; fuera del rango se mantiene la clave extrema. */
export class ScalarTrack {
  private readonly ts: number[];
  private readonly ys: number[];
  private readonly ms: number[];

  constructor(keys: readonly Key<number>[]) {
    if (keys.length === 0) throw new Error('pista sin claves');
    this.ts = keys.map((k) => k[0]);
    this.ys = keys.map((k) => k[1]);
    for (let i = 1; i < this.ts.length; i++) {
      if (!(this.ts[i]! > this.ts[i - 1]!))
        throw new Error(`claves no crecientes en t=${this.ts[i]}`);
    }
    this.ms = pchipSlopes(this.ts, this.ys);
  }

  at(t: number): number {
    const { ts, ys, ms } = this;
    const last = ts.length - 1;
    if (t <= ts[0]!) return ys[0]!;
    if (t >= ts[last]!) return ys[last]!;
    let i = 0;
    while (t > ts[i + 1]!) i++;
    const h = ts[i + 1]! - ts[i]!;
    const s = (t - ts[i]!) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * ys[i]! +
      (s3 - 2 * s2 + s) * h * ms[i]! +
      (-2 * s3 + 3 * s2) * ys[i + 1]! +
      (s3 - s2) * h * ms[i + 1]!
    );
  }
}

/** Vector 3D: una curva PCHIP por componente. */
export class VecTrack {
  private readonly axes: [ScalarTrack, ScalarTrack, ScalarTrack];

  constructor(keys: readonly Key<THREE.Vector3>[]) {
    this.axes = [
      new ScalarTrack(keys.map(([t, v]) => [t, v.x] as const)),
      new ScalarTrack(keys.map(([t, v]) => [t, v.y] as const)),
      new ScalarTrack(keys.map(([t, v]) => [t, v.z] as const)),
    ];
  }

  at(t: number): THREE.Vector3 {
    return new THREE.Vector3(this.axes[0].at(t), this.axes[1].at(t), this.axes[2].at(t));
  }
}

/**
 * Orientaciones: se interpola con PCHIP el ángulo recorrido acumulado y se hace
 * slerp dentro del tramo que le toca. Así la velocidad angular real es continua
 * aunque los tramos vecinos giren cantidades muy distintas (interpolar el índice
 * de clave daba saltos de velocidad), y dos claves iguales dan un tramo quieto
 * al que se llega frenando.
 */
export class QuatTrack {
  private readonly arc: ScalarTrack;
  private readonly qs: THREE.Quaternion[];
  private readonly cum: number[];

  constructor(keys: readonly Key<THREE.Quaternion>[]) {
    this.qs = keys.map(([, q]) => q.clone());
    this.cum = [0];
    for (let i = 1; i < this.qs.length; i++) {
      const prev = this.qs[i - 1]!;
      const q = this.qs[i]!;
      // Mismo hemisferio entre vecinas para que el slerp tome el camino corto.
      if (prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      this.cum.push(this.cum[i - 1]! + prev.angleTo(q));
    }
    this.arc = new ScalarTrack(keys.map(([t], i) => [t, this.cum[i]!] as const));
  }

  at(t: number): THREE.Quaternion {
    const a = this.arc.at(t);
    const last = this.qs.length - 1;
    let i = 0;
    while (i < last - 1 && a > this.cum[i + 1]!) i++;
    const span = this.cum[i + 1]! - this.cum[i]!;
    if (last === 0 || span <= 1e-9)
      return this.qs[Math.min(i + (a > this.cum[i]! ? 1 : 0), last)]!.clone();
    const k = THREE.MathUtils.clamp((a - this.cum[i]!) / span, 0, 1);
    return this.qs[i]!.clone().slerp(this.qs[i + 1]!, k);
  }
}

/** Base ortonormal de la mano: dedos (+Y local) y normal de la palma (+Z local). */
export function handBasis(fingers: THREE.Vector3, palm: THREE.Vector3): THREE.Quaternion {
  const y = fingers.clone().normalize();
  const z = palm.clone().addScaledVector(y, -palm.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
