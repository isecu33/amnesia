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
import { hex, makeCanvas, noiseRect, pixelTexture, rng, shade } from './pixel.js';

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

function tableTopTexture(m: MapDescriptor): THREE.CanvasTexture {
  const S = 96;
  const { canvas, c } = makeCanvas(S, S);
  // Tablones: franjas con vetas.
  for (let i = 0; i < 6; i++) {
    noiseRect(
      c,
      0,
      i * 16,
      S,
      16,
      i % 2 ? m.mesa.wood : shade(m.mesa.wood, 0.92),
      m.mesa.woodDark,
      0.12,
      21 + i,
    );
    c.fillStyle = hex(m.mesa.rim);
    c.fillRect(0, i * 16, S, 1);
  }
  // Círculo rúnico (misterio, no bar): anillo, runas y ojo central.
  const cx = S / 2;
  c.fillStyle = hex(m.mesa.rune);
  for (const r of [26]) {
    for (let a = 0; a < 160; a++) {
      const t = (a / 160) * Math.PI * 2;
      c.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cx + Math.sin(t) * r), 1, 1);
    }
  }
  const rr = rng(5);
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * 26);
    const y = Math.round(cx + Math.sin(t) * 26);
    c.fillRect(x - 1, y - 1, 1 + Math.floor(rr() * 3), 1);
    c.fillRect(x, y, 1, 1 + Math.floor(rr() * 2));
  }
  return pixelTexture(canvas);
}

function sideTexture(base: number, dark: number, seed: number): THREE.CanvasTexture {
  const { canvas, c } = makeCanvas(32, 8);
  noiseRect(c, 0, 0, 32, 8, base, dark, 0.25, seed);
  const tex = pixelTexture(canvas, true);
  tex.repeat.set(8, 1);
  return tex;
}

function groundTexture(m: MapDescriptor): THREE.CanvasTexture {
  const { canvas, c } = makeCanvas(32, 32);
  noiseRect(c, 0, 0, 32, 32, m.fondo.ground, m.fondo.groundAlt, 0.12, 31);
  const r = rng(32);
  c.fillStyle = hex(shade(m.fondo.groundAlt, 1.3));
  for (let i = 0; i < 10; i++) c.fillRect(Math.floor(r() * 32), Math.floor(r() * 31), 1, 2);
  const tex = pixelTexture(canvas, true);
  tex.repeat.set(26, 26);
  return tex;
}

function skyTexture(m: MapDescriptor): THREE.CanvasTexture {
  const { canvas, c } = makeCanvas(128, 64);
  // Degradado en bandas (sin suavizar) + estrellas.
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    const band = Math.floor(t * 6) / 6;
    const mix = (a: number, b: number, k: number): number => {
      const ch = (s: number): number =>
        Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    c.fillStyle = hex(mix(m.fondo.sky, m.fondo.skyHorizon, band));
    c.fillRect(0, y, 128, 1);
  }
  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = r() < 0.2 ? '#fff3b0' : '#a9b8e8';
    c.fillRect(Math.floor(r() * 128), Math.floor(r() * 40), 1, 1);
  }
  return pixelTexture(canvas);
}

function treeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, color: number): THREE.BufferGeometry => {
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  parts.push(paint(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5).translate(0, 0.4, 0), 0x6e4b2a));
  const tiers: [number, number, number, number][] = [
    [0.9, 1.1, 1.05, 0xffffff],
    [0.7, 0.95, 1.6, 0xd8e8d0],
    [0.45, 0.8, 2.1, 0xb8d0b0],
  ];
  for (const [r, h, y, tint] of tiers)
    parts.push(paint(new THREE.ConeGeometry(r, h, 6).translate(0, y, 0), tint));
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('árbol');
  return g;
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
  const moon = new THREE.Mesh(
    keep(new THREE.CircleGeometry(1.4, 10)),
    keep(new THREE.MeshBasicMaterial({ color: m.fondo.moon, fog: false })),
  );
  moon.position.set(-6, 9, 22);
  moon.lookAt(0, 1, 0);
  root.add(moon);
  const ground = new THREE.Mesh(
    keep(new THREE.CircleGeometry(16, 18)),
    keep(new THREE.MeshLambertMaterial({ map: keep(groundTexture(m)) })),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // --- bosque instanciado ---
  const r = rng(101);
  const trees = new THREE.InstancedMesh(
    keep(treeGeometry()),
    keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    m.fondo.trees,
  );
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  for (let i = 0; i < m.fondo.trees; i++) {
    const a = (i / m.fondo.trees) * Math.PI * 2 + r() * 0.12;
    const d = 4.2 + r() * 5.5;
    const s = 0.9 + r() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
    mtx.compose(
      new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d),
      q,
      new THREE.Vector3(s, s * (0.9 + r() * 0.5), s),
    );
    trees.setMatrixAt(i, mtx);
    trees.setColorAt(i, col.setHex(m.fondo.treeColors[i % 3] ?? m.fondo.ground));
  }
  root.add(trees);

  const rocks = new THREE.InstancedMesh(
    keep(new THREE.DodecahedronGeometry(0.22, 0)),
    keep(new THREE.MeshLambertMaterial({ color: m.fondo.rock, flatShading: true })),
    m.fondo.rocks,
  );
  for (let i = 0; i < m.fondo.rocks; i++) {
    const a = r() * Math.PI * 2;
    const d = 2.4 + r() * 2.2;
    const s = 0.5 + r() * 1.3;
    mtx.compose(
      new THREE.Vector3(Math.sin(a) * d, 0.05, Math.cos(a) * d),
      q.random(),
      new THREE.Vector3(s, s * 0.6, s),
    );
    rocks.setMatrixAt(i, mtx);
  }
  root.add(rocks);

  // --- luciérnagas ---
  const fly = new Float32Array(m.fondo.fireflies * 3);
  const flySeed = Array.from({ length: m.fondo.fireflies }, () => [
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
        color: m.fondo.firefly,
        size: 0.05,
        sizeAttenuation: true,
        fog: false,
      }),
    ),
  );
  root.add(flies);

  // --- mesa ---
  const top = keep(tableTopTexture(m));
  const side = keep(sideTexture(m.mesa.woodDark, m.mesa.rim, 41));
  const table = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 0.97, 0.08, 18)), [
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
      fly[i * 3 + 1] = (h ?? 1) + (reduced ? 0 : Math.sin(t * 0.7 + i) * 0.2);
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
