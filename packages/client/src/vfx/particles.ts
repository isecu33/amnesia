/** Partículas con puntos propios: sin librerías nuevas (docs/03 WP-11). */
import * as THREE from 'three';

export interface BurstOptions {
  count: number;
  color: number;
  size: number;
  speed: number;
  lifeMs: number;
  gravity?: number;
  spread?: number;
}

export class Burst {
  readonly points: THREE.Points;
  private readonly velocities: Float32Array;
  private elapsed = 0;
  private readonly opts: Required<BurstOptions>;

  constructor(origin: THREE.Vector3, opts: BurstOptions) {
    this.opts = { gravity: -1.4, spread: 1, ...opts };
    const positions = new Float32Array(opts.count * 3);
    this.velocities = new Float32Array(opts.count * 3);
    for (let i = 0; i < opts.count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI * 0.5;
      this.velocities[i * 3] = Math.cos(a) * Math.cos(b) * opts.speed * this.opts.spread;
      this.velocities[i * 3 + 1] = Math.sin(b) * opts.speed;
      this.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(b) * opts.speed * this.opts.spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: opts.color,
        size: opts.size,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  }

  /** Devuelve false cuando el burst ha muerto. */
  update(dtMs: number): boolean {
    this.elapsed += dtMs;
    const dt = dtMs / 1000;
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      this.velocities[i * 3 + 1] = (this.velocities[i * 3 + 1] ?? 0) + this.opts.gravity * dt;
      arr[i * 3] = (arr[i * 3] ?? 0) + (this.velocities[i * 3] ?? 0) * dt;
      arr[i * 3 + 1] = (arr[i * 3 + 1] ?? 0) + (this.velocities[i * 3 + 1] ?? 0) * dt;
      arr[i * 3 + 2] = (arr[i * 3 + 2] ?? 0) + (this.velocities[i * 3 + 2] ?? 0) * dt;
    }
    attr.needsUpdate = true;
    const life = this.elapsed / this.opts.lifeMs;
    (this.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - life);
    return life < 1;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Cuervo espectral: cono estilizado con alas planas — silueta > detalle. */
export function makeCrow(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.13, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
  );
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.05),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    wing.position.z = s * 0.045;
    wing.rotation.x = Math.PI / 2;
    wing.name = s < 0 ? 'wingL' : 'wingR';
    g.add(wing);
  }
  return g;
}

/** Zarcillos de humo para el Trueque Ciego. */
export function makeSmoke(color: number, count = 60): THREE.Points {
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color,
      size: 0.05,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
}
