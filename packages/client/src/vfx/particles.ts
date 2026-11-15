/**
 * Partículas pixel: un `ParticlePool` por modo de mezcla = UNA draw call para
 * todas las chispas/polvo en pantalla (presupuesto docs/02 §5.3). Cada partícula
 * es un cuadrado de tamaño entero en píxeles internos (estética pixel D-042) con
 * color y tamaño interpolados a lo largo de su vida. Sin librerías (WP-11).
 */
import * as THREE from 'three';
import { pixelGlowCanvas, pixelTexture } from '../scene/pixel.js';

export interface ParticleSpec {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  lifeMs: number;
  /** tamaño en metros al nacer / al morir */
  size0: number;
  size1: number;
  /** color hex al nacer / al morir */
  color0: number;
  color1: number;
  /** m/s² (negativo = cae) */
  gravity: number;
  /** fracción de velocidad que se pierde por segundo (0..1) */
  drag: number;
}

/** Peldaños de opacidad: el desvanecido también es pixel-art. */
const ALPHA_STEPS = 4;

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aSize * uScale / max(0.001, -mv.z);
    gl_PointSize = aAlpha <= 0.0 ? 0.0 : max(1.0, floor(s + 0.5));
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = ceil(vAlpha * ${ALPHA_STEPS.toFixed(1)}) / ${ALPHA_STEPS.toFixed(1)};
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

interface Slot {
  alive: boolean;
  age: number;
  spec: ParticleSpec;
  c0: THREE.Color;
  c1: THREE.Color;
}

export class ParticlePool {
  readonly points: THREE.Points;
  private readonly slots: Slot[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private cursor = 0;
  private readonly tmpV = new THREE.Vector2();

  constructor(
    readonly capacity: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
    // Escala de pantalla real del objetivo en que se pinta (render pixel interno).
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const rt = renderer.getRenderTarget();
      const h = rt ? rt.height : renderer.getDrawingBufferSize(this.tmpV).y;
      const proj = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5] ?? 1;
      const u = mat.uniforms['uScale'];
      if (u) u.value = h * proj * 0.5;
    };
  }

  get alive(): number {
    return this.slots.reduce((n, s) => n + (s.alive ? 1 : 0), 0);
  }

  /** Si el pool está lleno se recicla la partícula más antigua (anillo). */
  spawn(spec: ParticleSpec): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const slot: Slot = {
      alive: true,
      age: 0,
      spec: { ...spec, pos: spec.pos.clone(), vel: spec.vel.clone() },
      c0: new THREE.Color(spec.color0),
      c1: new THREE.Color(spec.color1),
    };
    this.slots[i] = slot;
    this.write(i, slot, 0);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s?.alive) continue;
      s.age += dtMs;
      const k = s.age / s.spec.lifeMs;
      if (k >= 1) {
        s.alive = false;
        this.alpha[i] = 0;
        continue;
      }
      const sp = s.spec;
      sp.vel.y += sp.gravity * dt;
      sp.vel.multiplyScalar(Math.max(0, 1 - sp.drag * dt));
      sp.pos.addScaledVector(sp.vel, dt);
      this.write(i, s, k);
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha'])
      (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    for (const s of this.slots) if (s) s.alive = false;
    this.alpha.fill(0);
    (this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }

  private write(i: number, s: Slot, k: number): void {
    const p = s.spec.pos;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = s.c0.r + (s.c1.r - s.c0.r) * k;
    this.col[i * 3 + 1] = s.c0.g + (s.c1.g - s.c0.g) * k;
    this.col[i * 3 + 2] = s.c0.b + (s.c1.b - s.c0.b) * k;
    this.size[i] = s.spec.size0 + (s.spec.size1 - s.spec.size0) * k;
    // Brillo pleno el primer 40 % de vida y luego se apaga.
    this.alpha[i] = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
  }
}

// --- emisores --------------------------------------------------------------

export interface BurstOptions {
  count: number;
  color0: number;
  color1?: number;
  size: number;
  /** tamaño final relativo (por defecto 0,4: las chispas se encogen) */
  shrink?: number;
  speed: number;
  lifeMs: number;
  gravity?: number;
  drag?: number;
  /** 0 = chorro vertical, 1 = hemisferio, 2 = esfera completa */
  spread?: number;
  /** radio de nacimiento alrededor del origen */
  radius?: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Especificaciones de una explosión radial (sin estado, testeable). */
export function burstSpecs(origin: THREE.Vector3, o: BurstOptions): ParticleSpec[] {
  const spread = o.spread ?? 1;
  const out: ParticleSpec[] = [];
  for (let i = 0; i < o.count; i++) {
    const a = Math.random() * Math.PI * 2;
    // Elevación: spread 0 → casi vertical; 1 → hemisferio; 2 → esfera.
    const minEl = spread >= 2 ? -Math.PI / 2 : Math.PI / 2 - (Math.PI / 2) * Math.min(1, spread);
    const el = rand(minEl, Math.PI / 2);
    const v = o.speed * rand(0.45, 1);
    const r = o.radius ?? 0;
    out.push({
      pos: origin.clone().add(new THREE.Vector3(rand(-r, r), rand(-r, r) * 0.3, rand(-r, r))),
      vel: new THREE.Vector3(
        Math.cos(a) * Math.cos(el) * v,
        Math.sin(el) * v,
        Math.sin(a) * Math.cos(el) * v,
      ),
      lifeMs: o.lifeMs * rand(0.6, 1),
      size0: o.size * rand(0.7, 1.2),
      size1: o.size * (o.shrink ?? 0.4),
      color0: o.color0,
      color1: o.color1 ?? o.color0,
      gravity: o.gravity ?? -1.4,
      drag: o.drag ?? 1.5,
    });
  }
  return out;
}

// --- piezas de malla -------------------------------------------------------

let glowTex: THREE.Texture | undefined;
/** Textura de halo pixelado compartida (se crea perezosamente, nunca se libera). */
export function glowTexture(): THREE.Texture {
  glowTex ??= pixelTexture(pixelGlowCanvas(16, 4));
  return glowTex;
}

/** Halo aditivo (luz de vela, destello de impacto). */
export function makeGlow(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  s.scale.setScalar(size);
  s.renderOrder = 21;
  return s;
}

/** Onda expansiva plana sobre la mesa. */
export function makeShockwave(color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 32, 1),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 18;
  return m;
}

/** Cuervo espectral pixel: cajas (cuerpo, cabeza, pico, alas) — silueta > detalle. */
export function makeCrow(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  box(0.07, 0.035, 0.035, 0, 0, 0); // cuerpo
  box(0.03, 0.03, 0.03, 0.045, 0.012, 0); // cabeza
  box(0.02, 0.008, 0.01, 0.07, 0.01, 0); // pico
  box(0.03, 0.006, 0.02, -0.045, 0.004, 0); // cola
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.012, s * 0.017);
    pivot.name = s < 0 ? 'wingL' : 'wingR';
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.07), mat);
    wing.position.z = s * 0.035;
    pivot.add(wing);
    g.add(pivot);
  }
  return g;
}

/** Cadena de luz: polilínea cerrada que une los tótems del cantor de ¡ÚLTIMA!. */
export function makeChain(points: THREE.Vector3[], color: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  line.renderOrder = 21;
  return line;
}

/** Libera geometría y materiales de un objeto temporal de VFX (no la textura compartida). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    // El Sprite comparte una geometría global de three: no se libera.
    if (!(o instanceof THREE.Sprite)) m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) mat.dispose();
  });
}
