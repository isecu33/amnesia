/**
 * Convierte un `MapDescriptor` (docs/01 §12) en geometría low-poly con texturas
 * pixel. Todo repetido va instanciado (árboles, rocas, velas) para el
 * presupuesto de ≤ 80 draw calls (docs/02 §5.3).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDescriptor } from './maps/index.js';
import {
  CANDLE_POSITION,
  TABLE_HEIGHT,
  characterAnchors,
  tableRadius,
  type Vec3,
} from './layout.js';
import { rng } from './pixel.js';
import { groundTexture, sideTexture, skyTexture, tableTopTexture } from './map-textures.js';
import { buildScenery } from './map-scenery.js';

export interface BuiltMap {
  root: THREE.Group;
  table: THREE.Mesh;
  /** luz de vela que sigue al jugador activo */
  activeLight: THREE.PointLight;
  /** recoloca mesa y velas para `players` jugadores; `active` = asiento activo */
  layout(players: number, active: number): void;
  update(timeSec: number, reduced: boolean): void;
  dispose(): void;
}

/** Segmentos del tablero por silueta; el polígono se inscribe para cubrir el radio de mesa. */
const SHAPE_SEGMENTS = { round: 18, octagon: 8, hex: 6 } as const;

function tableGeometry(shape: MapDescriptor['mesa']['shape']): THREE.BufferGeometry {
  const n = SHAPE_SEGMENTS[shape];
  // circunradio = apotema / cos(π/n): así el borde nunca queda por debajo del radio de mesa
  const k = shape === 'round' ? 1 : 1 / Math.cos(Math.PI / n);
  return new THREE.CylinderGeometry(k, k * 0.97, 0.08, n);
}

export function buildMap(m: MapDescriptor): BuiltMap {
  const root = new THREE.Group();
  root.name = `map:${m.id}`;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // --- cielo, luna y suelo ---
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(30, 12, 8)),
    keep(
      new THREE.MeshBasicMaterial({ map: keep(skyTexture(m)), side: THREE.BackSide, fog: false }),
    ),
  );
  root.add(sky);
  const sky_ = m.fondo.celestial;
  if (sky_.size > 0) {
    const astro = new THREE.Mesh(
      keep(new THREE.CircleGeometry(sky_.size, 10)),
      keep(new THREE.MeshBasicMaterial({ color: sky_.color, fog: false })),
    );
    astro.position.set(sky_.x, sky_.y, 22);
    astro.lookAt(0, 1, 0);
    root.add(astro);
  }
  const ground = new THREE.Mesh(
    keep(new THREE.CircleGeometry(16, 18)),
    keep(new THREE.MeshLambertMaterial({ map: keep(groundTexture(m)) })),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // --- decorado instanciado (árboles, rocas, extra del mapa) ---
  const r = rng(101);
  const mtx = new THREE.Matrix4();
  for (const mesh of buildScenery(m, r, keep).meshes) root.add(mesh);

  // --- motas (luciérnagas, nieve, fuegos fatuos, polvo) ---
  const mote = m.fondo.motes;
  const fly = new Float32Array(mote.count * 3);
  const flySeed = Array.from({ length: mote.count }, () => [
    r() * 6.28,
    2.2 + r() * 4,
    0.6 + r() * 1.8,
  ]);
  const flyGeo = keep(new THREE.BufferGeometry());
  flyGeo.setAttribute('position', new THREE.BufferAttribute(fly, 3));
  const flies = new THREE.Points(
    flyGeo,
    keep(
      new THREE.PointsMaterial({
        color: mote.color,
        size: mote.size,
        sizeAttenuation: true,
        fog: false,
      }),
    ),
  );
  flies.frustumCulled = false;
  root.add(flies);

  // --- mesa ---
  const top = keep(tableTopTexture(m));
  const side = keep(sideTexture(m.mesa.woodDark, m.mesa.rim, 41));
  const table = new THREE.Mesh(keep(tableGeometry(m.mesa.shape)), [
    keep(new THREE.MeshLambertMaterial({ map: side })),
    keep(new THREE.MeshLambertMaterial({ map: top })),
    keep(new THREE.MeshLambertMaterial({ color: m.mesa.rim })),
  ]);
  table.name = 'table';
  root.add(table);
  const pedestal = new THREE.Mesh(
    keep(
      mergeGeometries([
        new THREE.CylinderGeometry(0.12, 0.16, TABLE_HEIGHT - 0.08, 6).translate(
          0,
          (TABLE_HEIGHT - 0.08) / 2,
          0,
        ),
        new THREE.CylinderGeometry(0.45, 0.5, 0.06, 6).translate(0, 0.03, 0),
      ]) ?? new THREE.BufferGeometry(),
    ),
    keep(new THREE.MeshLambertMaterial({ color: m.mesa.rim, flatShading: true })),
  );
  root.add(pedestal);

  // Velas-reloj y tótem de ¡ÚLTIMA!: los pinta la HUD diegética (scene/hud-layer.ts).
  const candleSpots: Vec3[] = [];

  // --- luces ---
  root.add(new THREE.AmbientLight(m.luces.ambient.color, m.luces.ambient.intensity));
  root.add(
    new THREE.HemisphereLight(m.luces.hemi.sky, m.luces.hemi.ground, m.luces.hemi.intensity),
  );
  const moonLight = new THREE.DirectionalLight(m.luces.moon.color, m.luces.moon.intensity);
  moonLight.position.set(-3, 6, 8);
  root.add(moonLight);
  const ownLight = new THREE.PointLight(
    m.luces.candle.color,
    m.luces.candle.intensity * 0.7,
    m.luces.candle.distance,
    1.6,
  );
  ownLight.position.set(CANDLE_POSITION.x, CANDLE_POSITION.y + 0.25, CANDLE_POSITION.z);
  root.add(ownLight);
  const activeLight = new THREE.PointLight(
    m.luces.candle.color,
    m.luces.candle.intensity,
    m.luces.candle.distance,
    1.6,
  );
  root.add(activeLight);
  const centerLight = new THREE.PointLight(
    m.luces.candle.color,
    m.luces.candle.intensity * 0.5,
    2.4,
    1.4,
  );
  centerLight.position.set(0, TABLE_HEIGHT + 0.7, 0);
  root.add(centerLight);

  let activeIdx = 0;
  const layout = (players: number, active: number): void => {
    const R = tableRadius(players);
    table.scale.set(R, 1, R);
    table.position.y = TABLE_HEIGHT - 0.04;
    candleSpots.length = 0;
    candleSpots.push(CANDLE_POSITION);
    for (let s = 1; s < players; s++) candleSpots.push(characterAnchors(s, players).candle);
    activeIdx = Math.max(0, Math.min(candleSpots.length - 1, active));
    const a = candleSpots[activeIdx] ?? CANDLE_POSITION;
    activeLight.position.set(a.x, TABLE_HEIGHT + 0.3, a.z);
  };

  const update = (t: number, reduced: boolean): void => {
    const flick = reduced ? 0 : Math.sin(t * 11) * 0.12 + Math.sin(t * 4.3) * 0.08;
    activeLight.intensity = m.luces.candle.intensity * (1 + flick);
    ownLight.intensity = m.luces.candle.intensity * 0.7 * (1 - flick * 0.5);
    flySeed.forEach(([a0, d, h], i) => {
      const a = (a0 ?? 0) + (reduced ? 0 : t * 0.05 * (i % 2 ? 1 : -1));
      fly[i * 3] = Math.sin(a) * (d ?? 3);
      const base = h ?? 1;
      fly[i * 3 + 1] =
        mote.mode === 'fall'
          ? 0.2 + ((base * 2.7 - (reduced ? 0 : t * 0.18) + 40) % 3.4)
          : base + (reduced ? 0 : Math.sin(t * 0.7 + i) * 0.2);
      fly[i * 3 + 2] = Math.cos(a) * (d ?? 3);
    });
    flyGeo.getAttribute('position').needsUpdate = true;
  };

  return {
    root,
    table,
    activeLight,
    layout,
    update,
    dispose: () => {
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
  };
}
