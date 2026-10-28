/**
 * Decorado instanciado de cada mapa (D-044): árboles/formaciones, rocas y un
 * elemento extra (estalactitas, pilares, juncos, tótems). Todo es geometría
 * low-poly con color por vértice y un `InstancedMesh` por familia, para respetar
 * el presupuesto de draw calls (docs/02 §5.3).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDescriptor } from './maps/index.js';

type Rand = () => number;

function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const g = mergeGeometries(
    parts.map((p) => p.toNonIndexed()),
    false,
  );
  for (const p of parts) p.dispose();
  if (!g) throw new Error(name);
  return g;
}

// --- geometrías de «árbol» (el color de la instancia multiplica estos tintes) ---

function pines(): THREE.BufferGeometry {
  const parts = [
    paint(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5).translate(0, 0.4, 0), 0x6e4b2a),
  ];
  const tiers: [number, number, number, number][] = [
    [0.9, 1.1, 1.05, 0xffffff],
    [0.7, 0.95, 1.6, 0xd8e8d0],
    [0.45, 0.8, 2.1, 0xb8d0b0],
  ];
  for (const [r, h, y, tint] of tiers)
    parts.push(paint(new THREE.ConeGeometry(r, h, 6).translate(0, y, 0), tint));
  return merge(parts, 'pinos');
}

function stalagmites(): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.ConeGeometry(0.24, 1.5, 5).translate(0, 0.75, 0), 0xffffff),
      paint(new THREE.ConeGeometry(0.15, 0.95, 5).translate(0.3, 0.47, 0.12), 0xd8e4f0),
      paint(new THREE.ConeGeometry(0.1, 0.6, 4).translate(-0.22, 0.3, -0.1), 0xb8c8dc),
    ],
    'estalagmitas',
  );
}

function jungleTree(): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.CylinderGeometry(0.09, 0.15, 2.4, 6).translate(0, 1.2, 0), 0xc08a58),
      paint(
        new THREE.IcosahedronGeometry(0.85, 0).scale(1, 0.55, 1).translate(0, 2.6, 0),
        0xffffff,
      ),
      paint(
        new THREE.IcosahedronGeometry(0.55, 0).scale(1, 0.6, 1).translate(0.55, 2.2, 0.2),
        0xd8f0d0,
      ),
    ],
    'árbol de selva',
  );
}

function deadTree(): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.CylinderGeometry(0.04, 0.11, 1.9, 5).translate(0, 0.95, 0), 0xffffff),
      paint(new THREE.ConeGeometry(0.035, 0.7, 4).rotateZ(-0.9).translate(0.28, 1.45, 0), 0xe0e8e0),
      paint(
        new THREE.ConeGeometry(0.03, 0.55, 4).rotateZ(0.8).translate(-0.22, 1.2, 0.05),
        0xe0e8e0,
      ),
      paint(
        new THREE.IcosahedronGeometry(0.28, 0).scale(1.2, 0.5, 1.2).translate(0, 1.95, 0),
        0xb0c8a0,
      ),
    ],
    'árbol muerto',
  );
}

function mesaRock(): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.CylinderGeometry(0.95, 1.1, 1.5, 6).translate(0, 0.75, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.88, 0.95, 1.1, 6).translate(0, 2.05, 0), 0xd8b0a0),
      paint(new THREE.CylinderGeometry(1.02, 0.88, 0.5, 6).translate(0, 2.85, 0), 0xf0c8a8),
    ],
    'mesa de roca',
  );
}

const SCENERY = {
  pines,
  stalagmites,
  jungle: jungleTree,
  'dead-trees': deadTree,
  mesas: mesaRock,
} as const;

function rockGeometry(kind: MapDescriptor['fondo']['rockKind']): THREE.BufferGeometry {
  switch (kind) {
    case 'crystal':
      return new THREE.OctahedronGeometry(0.18, 0).scale(0.7, 2.4, 0.7).translate(0, 0.3, 0);
    case 'ruin':
      return new THREE.BoxGeometry(0.34, 0.24, 0.28).translate(0, 0.1, 0);
    default:
      return new THREE.DodecahedronGeometry(0.22, 0);
  }
}

// --- extras instanciados con color propio por vértice ---

function stalactite(a: number, b: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.16, 1.5, 5).rotateX(Math.PI).translate(0, -0.75, 0);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = new THREE.Color(pos.getY(i) < -1 ? b : a);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function pillar(a: number, b: number): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.BoxGeometry(0.5, 0.2, 0.5).translate(0, 0.1, 0), b),
      paint(new THREE.BoxGeometry(0.34, 1.7, 0.34).translate(0, 1.05, 0), a),
      paint(new THREE.BoxGeometry(0.52, 0.18, 0.52).translate(0, 2, 0), b),
    ],
    'pilar',
  );
}

function reeds(a: number, b: number): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.CylinderGeometry(0.014, 0.022, 0.8, 3).translate(0, 0.4, 0), a),
      paint(new THREE.CylinderGeometry(0.012, 0.02, 1.0, 3).translate(0.07, 0.5, 0.03), a),
      paint(new THREE.CylinderGeometry(0.012, 0.02, 0.65, 3).translate(-0.06, 0.33, -0.04), a),
      paint(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 4).translate(0.07, 1.02, 0.03), b),
    ],
    'juncos',
  );
}

function totemPole(a: number, b: number): THREE.BufferGeometry {
  return merge(
    [
      paint(new THREE.BoxGeometry(0.46, 0.55, 0.46).translate(0, 0.28, 0), a),
      paint(new THREE.BoxGeometry(0.5, 0.18, 0.5).translate(0, 0.64, 0), b),
      paint(new THREE.BoxGeometry(0.44, 0.55, 0.44).translate(0, 1.0, 0), a),
      paint(new THREE.BoxGeometry(0.86, 0.14, 0.12).translate(0, 1.15, 0), b),
      paint(new THREE.BoxGeometry(0.5, 0.18, 0.5).translate(0, 1.36, 0), b),
      paint(new THREE.BoxGeometry(0.42, 0.5, 0.42).translate(0, 1.7, 0), a),
      paint(new THREE.ConeGeometry(0.27, 0.3, 4).rotateY(Math.PI / 4).translate(0, 2.1, 0), b),
    ],
    'tótem',
  );
}

export interface Scenery {
  meshes: THREE.InstancedMesh[];
}

interface Place {
  min: number;
  range: number;
  scale: [number, number];
  /** estiramiento vertical extra (aleatorio dentro de [1, 1+stretch]) */
  stretch?: number;
  tilt?: number;
  y?: number;
}

function placeRing(
  mesh: THREE.InstancedMesh,
  count: number,
  r: Rand,
  p: Place,
  tint?: (i: number) => number,
): void {
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.12;
    const d = p.min + r() * p.range;
    const s = p.scale[0] + r() * (p.scale[1] - p.scale[0]);
    const tilt = p.tilt ?? 0;
    e.set((r() - 0.5) * tilt, r() * 6, (r() - 0.5) * tilt);
    q.setFromEuler(e);
    mtx.compose(
      new THREE.Vector3(Math.sin(a) * d, p.y ?? 0, Math.cos(a) * d),
      q,
      new THREE.Vector3(s, s * (1 + r() * (p.stretch ?? 0.5)), s),
    );
    mesh.setMatrixAt(i, mtx);
    if (tint) mesh.setColorAt(i, col.setHex(tint(i)));
  }
}

/** Crea el decorado del mapa; `keep` registra lo que habrá que liberar. */
export function buildScenery(
  m: MapDescriptor,
  r: Rand,
  keep: <T extends { dispose(): void }>(x: T) => T,
): Scenery {
  const f = m.fondo;
  const meshes: THREE.InstancedMesh[] = [];
  const lambert = (opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial =>
    keep(new THREE.MeshLambertMaterial({ flatShading: true, ...opts }));

  const trees = new THREE.InstancedMesh(
    keep(SCENERY[f.scenery]()),
    lambert({ vertexColors: true }),
    f.trees,
  );
  const tall = f.scenery === 'mesas';
  placeRing(
    trees,
    f.trees,
    r,
    {
      min: f.treeRing.min,
      range: f.treeRing.range,
      scale: tall ? [0.9, 1.8] : [0.9, 1.8],
      stretch: tall ? 1.1 : 0.5,
      tilt: f.scenery === 'dead-trees' ? 0.28 : 0,
    },
    (i) => f.treeColors[i % 3] ?? f.ground,
  );
  meshes.push(trees);

  const rocks = new THREE.InstancedMesh(
    keep(rockGeometry(f.rockKind)),
    lambert({ color: f.rock }),
    f.rocks,
  );
  placeRing(rocks, f.rocks, r, {
    min: 2.4,
    range: 2.2,
    scale: [0.5, 1.8],
    stretch: -0.4,
    tilt: 0.3,
    y: 0.05,
  });
  meshes.push(rocks);

  const [ca, cb] = f.accent.colors;
  const accent = f.accent;
  if (accent.kind !== 'none' && accent.count > 0) {
    const geo = {
      stalactites: () => stalactite(ca, cb),
      pillars: () => pillar(ca, cb),
      reeds: () => reeds(ca, cb),
      totems: () => totemPole(ca, cb),
    }[accent.kind]();
    const mesh = new THREE.InstancedMesh(keep(geo), lambert({ vertexColors: true }), accent.count);
    switch (accent.kind) {
      case 'stalactites':
        placeRing(mesh, accent.count, r, {
          min: 2.6,
          range: 5.5,
          scale: [0.7, 1.7],
          stretch: 0.8,
          y: 4.6,
        });
        break;
      case 'pillars':
        placeRing(mesh, accent.count, r, {
          min: 3.4,
          range: 3.2,
          scale: [0.8, 1.4],
          stretch: -0.5,
          tilt: 0.12,
        });
        break;
      case 'reeds':
        placeRing(mesh, accent.count, r, {
          min: 2.4,
          range: 4.2,
          scale: [0.8, 1.5],
          stretch: 0.4,
          tilt: 0.3,
        });
        break;
      case 'totems':
        placeRing(mesh, accent.count, r, { min: 4.2, range: 3.4, scale: [0.9, 1.5], stretch: 0.3 });
        break;
    }
    meshes.push(mesh);
  }
  for (const mesh of meshes) mesh.frustumCulled = false;
  return { meshes };
}
