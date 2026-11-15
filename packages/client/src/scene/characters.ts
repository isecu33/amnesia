/**
 * Marionetas rígidas low-poly (docs/01 §11, D-042): torso, cabeza, brazos de dos
 * piezas y manos, sin skinning. Geometría y texturas pixel generadas por código
 * (D-014). Las poses se animan con GSAP sobre un estado numérico y cada frame se
 * resuelve la IK de los brazos hacia sus objetivos.
 *
 * I2/E22: una marioneta jamás recibe el valor de una carta; la carta que sostiene
 * la gestiona `World` y se pinta por el dorso (`heldCardFace`).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG, TABLE_HEIGHT, type CharacterAnchors, type Vec3 } from './layout.js';
import { POSES, WEIGHT_TRIM_SPEED, weightFor, type PoseCue } from './poses.js';
import { solveTwoBone } from './rig-math.js';
import { SPECIES, type Species, type SpeciesId } from './species.js';
import { BlinkTimer, type Rng } from './idle.js';
import { hex, makeCanvas, noiseRect, pixelTexture, shade } from './pixel.js';
import { loadRig, rigsEnabled, type RigModel } from './rig-models.js';

/** Regiones del atlas 32×80 de cada especie (px). */
type Rect = readonly [number, number, number, number];
const R_FUR: Rect = [0, 0, 16, 16];
const R_FACE: Rect = [16, 0, 16, 16];
const R_BELLY: Rect = [0, 16, 16, 16];
const R_DARK: Rect = [16, 16, 16, 16];
const R_MARK: Rect = [0, 32, 16, 16];
const R_GLOW: Rect = [16, 32, 16, 16];
/** Atuendo (solo especies con `garb`): tela, cuero, vendas y metal. */
const R_CLOTH: Rect = [0, 48, 16, 16];
const R_LEATHER: Rect = [16, 48, 16, 16];
const R_WRAP: Rect = [0, 64, 16, 16];
const R_METAL: Rect = [16, 64, 16, 16];
const ATLAS = { w: 32, h: 80 };

const atlasCache = new Map<SpeciesId, THREE.CanvasTexture>();
const glowCache = new Map<SpeciesId, THREE.CanvasTexture>();

const PUPIL = 0x0b0912;
/** Brillo del ojo: un píxel marfil que da mirada viva incluso a 360 px. */
const CATCHLIGHT = 0xf2e8d5;
/** Cuánto brillan ojos y gemas en la penumbra (máscara `glowAtlas`). */
const GLOW_INTENSITY = 0.85;
/** Cabezas algo mayores que la anatomía: a ~360 px la cara es lo que identifica al rival. */
const HEAD_READABILITY = 1.12;

// --- vida en reposo (cosmético; «reducir movimiento» lo apaga) ----------------
/** Rapidez (1/s) con la que la cabeza alcanza su objetivo de mirada: sin saltos secos. */
const GAZE_DAMP = 7;
/** Miradas de reojo: cada 1,2–3,5 s un pequeño desvío de la mirada. */
const SACCADE_MIN_S = 1.2;
const SACCADE_RANGE_S = 2.3;
const SACCADE_YAW = 0.18;
const SACCADE_PITCH = 0.08;
/** Balanceo del peso (rad) y ladeo de cabeza (rad). */
const SWAY_ROLL = 0.03;
const HEAD_TILT = 0.06;
/** Deriva de las manos en reposo (m) y golpecitos de dedos (m). */
const HAND_DRIFT = 0.012;
const FINGER_TAP = 0.022;
/** Rapidez (1/s) con la que la vida en reposo entra/sale al empezar/acabar una pose. */
const IDLE_BLEND = 4;

/**
 * Cara de la especie. Con `glowOnly` pinta solo lo que brilla (ojos, pupilas en
 * negro y brillos) sobre negro: es la máscara emisiva del mismo atlas.
 */
function drawFace(c: CanvasRenderingContext2D, s: Species, glowOnly = false): void {
  const [x0, y0] = R_FACE;
  if (!glowOnly) noiseRect(c, x0, y0, 16, 16, s.fur, shade(s.fur, 0.85), 0.2, 11);
  const px = (x: number, y: number, w: number, h: number, col: number): void => {
    c.fillStyle = hex(col);
    c.fillRect(x0 + x, y0 + y, w, h);
  };
  const deco = (x: number, y: number, w: number, h: number, col: number): void => {
    if (!glowOnly) px(x, y, w, h, col);
  };
  /** Ojo con pupila opcional y brillo arriba hacia el centro de la cara. */
  const eye = (x: number, y: number, w: number, h: number, pupil?: Rect): void => {
    px(x, y, w, h, s.eye);
    if (pupil) px(pupil[0], pupil[1], pupil[2], pupil[3], PUPIL);
    px(x < 8 ? x + w - 1 : x, y, 1, 1, CATCHLIGHT);
  };
  switch (s.silhouette) {
    case 'tufts': // búho: discos faciales claros, ojos enormes
      deco(1, 4, 6, 6, s.belly);
      deco(9, 4, 6, 6, s.belly);
      eye(2, 5, 4, 4, [3, 6, 2, 2]);
      eye(10, 5, 4, 4, [11, 6, 2, 2]);
      break;
    case 'pointy-ears': // zorro: antifaz oscuro y hocico blanco
      deco(0, 5, 16, 3, s.mark);
      eye(3, 6, 3, 2);
      eye(10, 6, 3, 2);
      deco(4, 10, 8, 6, s.belly);
      break;
    case 'round-ears': // oso: pintura ritual dorada en la frente
      deco(6, 1, 4, 2, s.mark);
      deco(7, 3, 2, 2, s.mark);
      eye(3, 7, 3, 2);
      eye(10, 7, 3, 2);
      deco(4, 10, 8, 5, s.belly);
      break;
    case 'antlers': // ciervo: lágrimas místicas bajo los ojos
      eye(3, 6, 3, 3);
      eye(10, 6, 3, 3);
      px(4, 9, 1, 4, s.mark);
      px(11, 9, 1, 4, s.mark);
      deco(6, 11, 4, 4, s.belly);
      deco(7, 11, 2, 1, PUPIL);
      break;
    case 'hood': // serpiente: ojos rasgados y escamas
      eye(2, 6, 4, 2, [3, 6, 1, 2]);
      eye(10, 6, 4, 2, [12, 6, 1, 2]);
      deco(5, 10, 6, 1, s.mark);
      deco(6, 12, 4, 1, s.mark);
      break;
    case 'beak': // cuervo: ojos brillantes y marca de vela en la frente
      eye(3, 6, 3, 3);
      eye(10, 6, 3, 3);
      px(7, 1, 2, 3, s.mark);
      break;
  }
}

/** Máscara emisiva: negro salvo ojos y la región R_GLOW (gemas, nariz, lengua). */
function glowAtlas(s: Species): THREE.CanvasTexture {
  const hit = glowCache.get(s.id);
  if (hit) return hit;
  const { canvas, c } = makeCanvas(ATLAS.w, ATLAS.h);
  c.fillStyle = '#000';
  c.fillRect(0, 0, ATLAS.w, ATLAS.h);
  drawFace(c, s, true);
  noiseRect(c, ...R_GLOW, s.eye, shade(s.eye, 1.2), 0.3, 17);
  const tex = pixelTexture(canvas);
  glowCache.set(s.id, tex);
  return tex;
}

function speciesAtlas(s: Species): THREE.CanvasTexture {
  const hit = atlasCache.get(s.id);
  if (hit) return hit;
  const { canvas, c } = makeCanvas(ATLAS.w, ATLAS.h);
  noiseRect(c, ...R_FUR, s.fur, s.furDark, 0.22, 3);
  drawFace(c, s);
  noiseRect(c, ...R_BELLY, s.belly, shade(s.belly, 0.82), 0.25, 5);
  noiseRect(c, ...R_DARK, s.furDark, shade(s.furDark, 0.7), 0.25, 9);
  noiseRect(c, ...R_MARK, s.mark, shade(s.mark, 0.75), 0.15, 13);
  noiseRect(c, ...R_GLOW, s.eye, shade(s.eye, 1.2), 0.3, 17);
  if (s.garb) {
    noiseRect(c, ...R_CLOTH, s.garb.cloth, shade(s.garb.cloth, 0.8), 0.25, 19);
    noiseRect(c, ...R_LEATHER, s.garb.leather, shade(s.garb.leather, 0.75), 0.2, 23);
    noiseRect(c, ...R_WRAP, s.garb.wrap, shade(s.garb.wrap, 0.85), 0.3, 29);
    noiseRect(c, ...R_METAL, s.garb.metal, shade(s.garb.metal, 0.8), 0.15, 31);
  }
  const tex = pixelTexture(canvas);
  atlasCache.set(s.id, tex);
  return tex;
}

/** Remapea las UV de una cara de caja a un rectángulo del atlas. */
function mapFaceUv(g: THREE.BufferGeometry, face: number, r: Rect): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const [x, y, w, h] = r;
  for (let i = face * 4; i < face * 4 + 4; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (x + u * w) / ATLAS.w, 1 - (y + (1 - v) * h) / ATLAS.h);
  }
}

/** Caja con `front` en la cara +Z y `rest` en las demás. */
function box(
  w: number,
  h: number,
  d: number,
  rest: Rect,
  front: Rect = rest,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  for (let f = 0; f < 6; f++) mapFaceUv(g, f, f === 4 ? front : rest);
  return g;
}

/** Geometría no-caja (conos, cilindros): toda en una región del atlas. */
function solid(g: THREE.BufferGeometry, r: Rect): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const [x, y, w, h] = r;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (x + 2 + uv.getX(i) * (w - 4)) / ATLAS.w,
      1 - (y + 2 + uv.getY(i) * (h - 4)) / ATLAS.h,
    );
  }
  return g;
}

const at = (
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  rz = 0,
): THREE.BufferGeometry => {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('mergeGeometries falló');
  return m;
}

/** Hueso hexagonal ahusado (eje Y, centrado). */
const limb = (rTop: number, rBot: number, len: number, r: Rect): THREE.BufferGeometry =>
  solid(new THREE.CylinderGeometry(rTop, rBot, len, 6), r);

/** Articulación: esfera de 6×4 segmentos, una gema de caras planas (indexada, para `merge`). */
const joint = (radius: number, r: Rect): THREE.BufferGeometry =>
  solid(new THREE.SphereGeometry(radius, 6, 4), r);

/** Manopla: palma, dedos juntos algo flexionados hacia la mesa y pulgar hacia dentro. */
function mitten(side: 1 | -1, wristY: number, r: Rect = R_BELLY): THREE.BufferGeometry[] {
  return [
    at(box(0.075, 0.05, 0.045, r), 0, wristY - 0.03, 0.005),
    at(box(0.07, 0.04, 0.04, r), 0, wristY - 0.07, 0.015, 0.35),
    at(box(0.025, 0.04, 0.03, r), -side * 0.042, wristY - 0.04, 0.02, 0, side * 0.5),
  ];
}

/** Flecos: anillo de conos colgantes (piel o tela rasgada) alrededor de un eje vertical. */
function fringe(
  n: number,
  at3: { cx?: number; cz?: number; rx: number; rz: number; y: number },
  cone: { r: number; h: number; tilt: number },
  r: Rect,
): THREE.BufferGeometry[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const g = solid(new THREE.ConeGeometry(cone.r, cone.h, 4), r);
    g.rotateX(Math.PI); // punta hacia abajo
    g.translate(0, -cone.h / 2, 0); // la base cuelga del origen
    g.rotateX(-cone.tilt); // abre hacia fuera
    g.rotateY(a);
    g.translate((at3.cx ?? 0) + Math.sin(a) * at3.rx, at3.y, (at3.cz ?? 0) + Math.cos(a) * at3.rz);
    return g;
  });
}

/** Cuerpo del oso vestido (plantilla avatar/oso.jpg): mantón de piel, bandoleras, cinto, falda y botas. */
function garbBody(b: number): THREE.BufferGeometry[] {
  const beltD = 0.3 * b + 0.04;
  const shoulder = (sx: number): THREE.BufferGeometry => {
    const g = solid(new THREE.SphereGeometry(0.15, 5, 3), R_MARK);
    g.scale(1, 0.7, 1);
    return at(g, sx * 0.25 * b, 0.45, 0);
  };
  const skirtTop = solid(new THREE.CylinderGeometry(0.25 * b, 0.28 * b, 0.14, 10), R_CLOTH);
  skirtTop.scale(1, 1, 0.78);
  return [
    // piernas y botas
    ...[-1, 1].flatMap((sx) => [
      at(box(0.17 * b, 0.5, 0.2 * b, R_FUR), sx * 0.1 * b, -0.31, -0.02),
      at(box(0.2 * b, 0.05, 0.22 * b, R_LEATHER), sx * 0.1 * b, -0.34, -0.02),
      at(box(0.19 * b, 0.2, 0.21 * b, R_DARK), sx * 0.1 * b, -0.45, -0.02),
      at(box(0.19 * b, 0.09, 0.14, R_DARK), sx * 0.1 * b, -0.51, 0.1),
    ]),
    // falda de tela rasgada
    at(skirtTop, 0, -0.07, -0.02),
    ...fringe(
      12,
      { cz: -0.02, rx: 0.27 * b - 0.03, rz: 0.2 * b - 0.02, y: -0.1 },
      { r: 0.075, h: 0.36, tilt: 0.12 },
      R_CLOTH,
    ),
    // cinto con hebilla
    at(box(0.4 * b + 0.04, 0.07, beltD, R_LEATHER), 0, 0.01, -0.02),
    at(box(0.08, 0.07, 0.02, R_METAL), 0, 0.01, -0.02 + beltD / 2 + 0.008),
    // bandoleras cruzadas
    at(box(0.05, 0.62, 0.02, R_LEATHER), 0, 0.24, 0.12 * b + 0.01, 0, 0.7),
    at(box(0.05, 0.62, 0.02, R_LEATHER), 0, 0.24, 0.12 * b + 0.014, 0, -0.7),
    // mantón de piel: hombros y collar
    shoulder(-1),
    shoulder(1),
    ...fringe(9, { rx: 0.2 * b, rz: 0.17 * b, y: 0.5 }, { r: 0.055, h: 0.2, tilt: 0.35 }, R_MARK),
    ...[-1, 1].flatMap((sx) =>
      fringe(
        6,
        { cx: sx * 0.25 * b, rx: 0.12, rz: 0.12, y: 0.44 },
        { r: 0.045, h: 0.14, tilt: 0.3 },
        R_FUR,
      ),
    ),
  ];
}

/** Cabeza redondeada del oso vestido: esfera facetada, hocico, nariz oscura y orejas redondas. */
function garbHead(k: number): THREE.BufferGeometry[] {
  const skull = solid(new THREE.SphereGeometry(0.17 * k, 8, 6), R_FUR);
  skull.scale(1.08, 0.95, 0.97);
  const muzzle = solid(new THREE.SphereGeometry(0.085 * k, 6, 4), R_BELLY);
  muzzle.scale(1.2, 0.8, 1.05);
  const ear = (sx: number): THREE.BufferGeometry[] => [
    at(
      solid(new THREE.CylinderGeometry(0.07 * k, 0.07 * k, 0.05 * k, 6), R_DARK),
      sx * 0.125 * k,
      0.27 * k,
      -0.01,
      Math.PI / 2,
    ),
    at(
      solid(new THREE.CylinderGeometry(0.04 * k, 0.04 * k, 0.03 * k, 6), R_FUR),
      sx * 0.125 * k,
      0.27 * k,
      0.02,
      Math.PI / 2,
    ),
  ];
  return [
    at(skull, 0, 0.14 * k, 0),
    at(muzzle, 0, 0.075 * k, 0.145 * k),
    at(box(0.04 * k, 0.03 * k, 0.03 * k, R_GLOW), 0, 0.1 * k, 0.222 * k),
    at(box(0.05 * k, 0.01 * k, 0.02 * k, R_DARK), 0, 0.04 * k, 0.215 * k),
    at(box(0.2 * k, 0.022 * k, 0.04 * k, R_DARK), 0, 0.215 * k, 0.14 * k),
    ...[-1, 1].map((sx) =>
      at(box(0.032 * k, 0.03 * k, 0.02 * k, R_GLOW), sx * 0.07 * k, 0.18 * k, 0.148 * k),
    ),
    ...ear(-1),
    ...ear(1),
  ];
}

function headFeatures(s: Species, k: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const cone = (r: number, h: number, seg: number): THREE.BufferGeometry =>
    new THREE.ConeGeometry(r, h, seg);
  switch (s.silhouette) {
    case 'tufts':
      // Penachos altos y abiertos en V: la silueta del búho se lee aun a contraluz.
      for (const sx of [-1, 1]) {
        out.push(
          at(
            box(0.07 * k, 0.15 * k, 0.05 * k, R_DARK),
            sx * 0.13 * k,
            0.32 * k,
            -0.02,
            0,
            -sx * 0.45,
          ),
        );
        out.push(
          at(
            box(0.04 * k, 0.07 * k, 0.04 * k, R_MARK),
            sx * 0.17 * k,
            0.4 * k,
            -0.02,
            0,
            -sx * 0.6,
          ),
        );
      }
      out.push(at(solid(cone(0.035 * k, 0.07 * k, 4), R_MARK), 0, 0.08 * k, 0.16 * k, Math.PI / 2));
      // Plumón del pecho bajo el pico.
      out.push(at(box(0.18 * k, 0.05 * k, 0.04 * k, R_BELLY), 0, 0.0, 0.12 * k));
      break;
    case 'pointy-ears':
      for (const sx of [-1, 1]) {
        out.push(
          at(solid(cone(0.065 * k, 0.2 * k, 4), R_FUR), sx * 0.1 * k, 0.35 * k, 0, 0, -sx * 0.12),
        );
        // Interior claro de la oreja: la punta se distingue del fondo oscuro.
        out.push(
          at(
            solid(cone(0.035 * k, 0.12 * k, 4), R_BELLY),
            sx * 0.1 * k,
            0.33 * k,
            0.03 * k,
            0,
            -sx * 0.12,
          ),
        );
        // Mejillas: mechones que ensanchan la cara (forma de cuña del zorro).
        out.push(
          at(
            solid(cone(0.05 * k, 0.1 * k, 4), R_BELLY),
            sx * 0.17 * k,
            0.04 * k,
            0.04 * k,
            0,
            -sx * 1.9,
          ),
        );
      }
      out.push(at(box(0.12 * k, 0.09 * k, 0.12 * k, R_BELLY), 0, 0.07 * k, 0.17 * k));
      out.push(at(box(0.04 * k, 0.03 * k, 0.03 * k, R_DARK), 0, 0.1 * k, 0.235 * k));
      break;
    case 'round-ears':
      out.push(
        at(
          solid(new THREE.CylinderGeometry(0.06 * k, 0.06 * k, 0.05 * k, 6), R_DARK),
          -0.13 * k,
          0.29 * k,
          0,
          Math.PI / 2,
        ),
      );
      out.push(
        at(
          solid(new THREE.CylinderGeometry(0.06 * k, 0.06 * k, 0.05 * k, 6), R_DARK),
          0.13 * k,
          0.29 * k,
          0,
          Math.PI / 2,
        ),
      );
      out.push(at(box(0.14 * k, 0.09 * k, 0.09 * k, R_BELLY), 0, 0.07 * k, 0.16 * k));
      out.push(at(box(0.05 * k, 0.03 * k, 0.03 * k, R_DARK), 0, 0.1 * k, 0.21 * k));
      break;
    case 'antlers':
      for (const sx of [-1, 1]) {
        out.push(at(box(0.025, 0.22, 0.025, R_BELLY), sx * 0.09 * k, 0.38 * k, 0, 0, -sx * 0.35));
        out.push(at(box(0.02, 0.1, 0.02, R_BELLY), sx * 0.17 * k, 0.42 * k, 0, 0, -sx * 1.0));
        out.push(at(box(0.02, 0.09, 0.02, R_BELLY), sx * 0.08 * k, 0.47 * k, 0, 0, sx * 0.4));
        out.push(
          at(box(0.1 * k, 0.04 * k, 0.03 * k, R_FUR), sx * 0.19 * k, 0.22 * k, 0, 0, -sx * 0.3),
        );
      }
      out.push(at(box(0.1 * k, 0.08 * k, 0.08 * k, R_BELLY), 0, 0.06 * k, 0.16 * k));
      break;
    case 'hood':
      // Capucha en tres placas (centro + alas inclinadas): abanico de cobra, no un tablón.
      out.push(at(box(0.3 * k, 0.4 * k, 0.04 * k, R_DARK, R_MARK), 0, 0.14 * k, -0.11 * k));
      for (const sx of [-1, 1])
        out.push(
          at(
            box(0.16 * k, 0.32 * k, 0.04 * k, R_DARK, R_MARK),
            sx * 0.2 * k,
            0.1 * k,
            -0.09 * k,
            0,
            -sx * 0.25,
          ),
        );
      out.push(at(box(0.05 * k, 0.015, 0.06 * k, R_GLOW), 0, 0.02 * k, 0.17 * k));
      break;
    case 'beak':
      out.push(at(solid(cone(0.06 * k, 0.24 * k, 4), R_DARK), 0, 0.08 * k, 0.24 * k, Math.PI / 2));
      // Cresta de tres plumas en abanico.
      for (const sx of [-1, 0, 1])
        out.push(
          at(
            box(0.035 * k, 0.12 * k, 0.1 * k, R_DARK),
            sx * 0.05 * k,
            0.31 * k,
            -0.03,
            -0.4,
            -sx * 0.4,
          ),
        );
      break;
  }
  return out;
}

/** Filas [arriba, abajo] del atlas de la cara que ocupan los ojos de cada silueta. */
const EYE_ROWS: Record<Species['silhouette'], readonly [number, number]> = {
  tufts: [4, 10],
  'pointy-ears': [5, 8],
  'round-ears': [7, 9],
  antlers: [6, 9],
  hood: [6, 8],
  beak: [6, 9],
};

/**
 * Párpado (D-045): pieza del color del pelaje sobre los ojos. Su origen es el
 * borde superior, así que al escalar en Y baja desde arriba y tapa el ojo.
 */
function eyelid(s: Species, k: number): { geometry: THREE.BufferGeometry; y: number; z: number } {
  if (s.garb) {
    // Cabeza esférica del oso vestido: un parche por ojo, justo sobre las gemas.
    const h = 0.055 * k;
    const parts = [-1, 1].map((sx) =>
      at(box(0.065 * k, h, 0.014 * k, R_FUR), sx * 0.07 * k, -h / 2, 0),
    );
    return { geometry: merge(parts), y: 0.2 * k, z: 0.164 * k };
  }
  const [top, bottom] = EYE_ROWS[s.silhouette];
  const row = (r: number): number => k * (0.28 - (r / 16) * 0.28);
  const h = row(top) - row(bottom);
  return {
    geometry: at(box(0.285 * k, h, 0.012 * k, R_FUR), 0, -h / 2, 0),
    y: row(top),
    z: 0.138 * k,
  };
}

export interface PuppetState {
  lean: number;
  headPitch: number;
  headYaw: number;
  hl: Vec3;
  hr: Vec3;
  /** salto vertical del cuerpo (m): celebraciones y sustos */
  bob: number;
}

export class Puppet {
  readonly root = new THREE.Group();
  readonly hip = new THREE.Group();
  readonly neck = new THREE.Group();
  private readonly shoulders: [THREE.Group, THREE.Group];
  private readonly elbows: [THREE.Group, THREE.Group];
  /** puntos donde cuelga una carta sostenida */
  readonly handAnchors: [THREE.Object3D, THREE.Object3D];
  readonly state: PuppetState;
  /** mientras la mano aún no ha cogido la carta, el `World` no la pinta */
  holdingSuppressed = false;
  private rest: { hl: Vec3; hr: Vec3 };
  private phase: number;
  private lookTarget = new THREE.Vector3();
  /** parpadeo con tiempo propio por personaje (D-045) */
  private readonly blink: BlinkTimer;
  private readonly lid = new THREE.Group();
  private lastT = 0;
  private readonly rng: Rng;
  /** mirada suavizada (rad) y desvío de reojo actual */
  private gazeYaw = 0;
  private gazePitch = 0;
  private saccade = { yaw: 0, pitch: 0, inS: 0 };
  /** 1 = en reposo (vida idle a pleno), 0 = haciendo una pose */
  private idleWeight = 1;
  private tapIn: number;
  private tapT = -1;
  private timeline?: gsap.core.Timeline;
  private readonly meshes: THREE.Mesh[] = [];
  /** experimento `?rigs=1`: animal riggeado en lugar de la marioneta */
  private rig?: RigModel;
  private disposed = false;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(
    readonly playerId: string,
    readonly species: SpeciesId,
    anchors: CharacterAnchors,
    rng: Rng = Math.random,
  ) {
    this.rng = rng;
    this.phase = rng() * Math.PI * 2;
    this.tapIn = 2 + rng() * 4;
    this.blink = new BlinkTimer(rng);
    const s = SPECIES[species];
    const mat = new THREE.MeshLambertMaterial({
      map: speciesAtlas(s),
      flatShading: true,
      emissive: 0xffffff,
      emissiveMap: glowAtlas(s),
      emissiveIntensity: GLOW_INTENSITY,
    });
    const b = s.bulk;
    const k = s.headScale * HEAD_READABILITY;
    const hipY = TABLE_HEIGHT - 0.2;
    this.root.name = `puppet:${playerId}`;
    this.root.add(this.hip);
    this.hip.position.y = hipY;

    const body = merge(
      s.garb
        ? [
            at(box(0.36 * b, 0.48, 0.24 * b, R_FUR, R_BELLY), 0, 0.24, 0),
            at(box(0.46 * b, 0.07, 0.3 * b, R_MARK), 0, 0.46, 0),
            ...garbBody(b),
          ]
        : [
            at(box(0.4 * b, 0.56, 0.3 * b, R_DARK), 0, -0.28, -0.02),
            at(box(0.36 * b, 0.48, 0.24 * b, R_FUR, R_BELLY), 0, 0.24, 0),
            at(box(0.46 * b, 0.07, 0.3 * b, R_MARK), 0, 0.46, 0),
            at(box(0.06, 0.07, 0.03, R_GLOW), 0, 0.31, 0.13 * b),
          ],
    );
    this.addMesh(body, mat, this.hip);

    this.neck.position.set(0, 0.5, 0);
    this.hip.add(this.neck);
    const head = merge([
      at(limb(0.07, 0.08, 0.1, R_FUR), 0, -0.02, 0),
      ...(s.garb
        ? garbHead(k)
        : [
            at(box(0.3 * k, 0.28 * k, 0.27 * k, R_FUR, R_FACE), 0, 0.14 * k, 0),
            ...headFeatures(s, k),
          ]),
    ]);
    this.addMesh(head, mat, this.neck);

    const lid = eyelid(s, k);
    this.lid.position.set(0, lid.y, lid.z);
    this.lid.scale.y = 0;
    this.lid.visible = false;
    this.neck.add(this.lid);
    this.addMesh(lid.geometry, mat, this.lid);

    const mkArm = (side: 1 | -1): [THREE.Group, THREE.Group, THREE.Object3D] => {
      const sh = new THREE.Group();
      sh.position.set(side * RIG.shoulderHalfWidth * b, RIG.shoulderHeight + 0.2, 0.04);
      this.hip.add(sh);
      // Hombrera y codo como gemas de pocas caras: el brazo deja de ser un listón
      // pero sigue leyéndose facetado bajo el render pixel.
      this.addMesh(
        merge([
          at(joint(0.065, R_MARK), 0, -0.01, 0),
          at(limb(0.05, 0.04, RIG.upperArm, R_FUR), 0, -RIG.upperArm / 2, 0),
          ...(s.garb
            ? fringe(7, { rx: 0.055, rz: 0.055, y: -0.09 }, { r: 0.03, h: 0.1, tilt: 0.35 }, R_MARK)
            : []),
        ]),
        mat,
        sh,
      );
      const el = new THREE.Group();
      el.position.y = -RIG.upperArm;
      sh.add(el);
      const wristY = -RIG.foreArm;
      this.addMesh(
        merge([
          joint(0.045, R_FUR),
          at(limb(0.042, 0.032, RIG.foreArm, R_FUR), 0, -RIG.foreArm / 2, 0),
          at(limb(0.038, 0.038, 0.02, R_DARK), 0, wristY + 0.005, 0),
          ...(s.garb
            ? [
                at(limb(0.05, 0.045, 0.13, R_WRAP), 0, -0.165, 0),
                at(limb(0.054, 0.054, 0.03, R_WRAP), 0, -0.09, 0, 0, 0.12),
              ]
            : []),
          ...mitten(side, wristY, s.garb ? R_FUR : R_BELLY),
        ]),
        mat,
        el,
      );
      const hand = new THREE.Object3D();
      hand.position.y = -RIG.foreArm - RIG.hand;
      el.add(hand);
      return [sh, el, hand];
    };
    const [shL, elL, hL] = mkArm(1);
    const [shR, elR, hR] = mkArm(-1);
    this.shoulders = [shL, shR];
    this.elbows = [elL, elR];
    this.handAnchors = [hL, hR];

    this.rest = { hl: { ...anchors.handRestL }, hr: { ...anchors.handRestR } };
    this.state = {
      lean: 0,
      headPitch: POSES.idle.headPitch,
      headYaw: 0,
      hl: { ...this.rest.hl },
      hr: { ...this.rest.hr },
      bob: 0,
    };
    this.place(anchors);
    if (rigsEnabled()) this.attachRig();
  }

  /** Sustituye la geometría procedural por el GLB; la IK sigue moviendo las manos invisibles (carta sostenida). */
  private attachRig(): void {
    loadRig(this.species).then(
      (rig) => {
        if (this.disposed) return rig.dispose();
        this.rig = rig;
        for (const m of this.meshes) m.visible = false;
        this.root.add(rig.root);
      },
      (err: unknown) => {
        // Sin rig se queda la marioneta: el experimento nunca rompe la partida.
        console.warn('[rigs] no se pudo cargar', this.species, err);
      },
    );
  }

  private addMesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D): void {
    const mesh = new THREE.Mesh(g, m);
    parent.add(mesh);
    this.meshes.push(mesh);
  }

  /** Recoloca al personaje (cambia el número de jugadores). */
  place(anchors: CharacterAnchors): void {
    this.root.position.set(anchors.seat.x, 0, anchors.seat.z);
    this.root.rotation.y = anchors.facing;
    this.rest = { hl: { ...anchors.handRestL }, hr: { ...anchors.handRestR } };
    if (!this.timeline?.isActive()) {
      this.state.hl = { ...this.rest.hl };
      this.state.hr = { ...this.rest.hr };
    }
  }

  lookAt(p: THREE.Vector3): void {
    this.lookTarget.copy(p);
  }

  /** Mano derecha en coordenadas de mundo (para cartas en vuelo). */
  handWorld(right = true): THREE.Vector3 {
    return this.handAnchors[right ? 1 : 0].getWorldPosition(new THREE.Vector3());
  }

  /** Lanza la animación de una pose. `resolve` traduce el objetivo a un punto. */
  play(
    cue: PoseCue,
    resolve: (t: NonNullable<PoseCue['target']>) => Vec3 | undefined,
    hooks: { onGrab?: () => void; onRelease?: (from: THREE.Vector3, hop?: number) => void } = {},
    reduced = false,
  ): void {
    const def = POSES[cue.pose];
    const weight = weightFor(cue.pose, reduced);
    const retract = (weight?.retractMs ?? 0) / 1000;
    const d = reduced ? 0.001 : def.durationMs / 1000;
    const target = cue.target ? resolve(cue.target) : undefined;
    const st = this.state;
    if (this.rig && (cue.pose === 'reach' || cue.pose === 'toss' || cue.pose === 'slap'))
      this.rig.playOnce('coger_carta');
    this.timeline?.kill();
    const tl = gsap.timeline();
    this.timeline = tl;
    const rest = this.rest;
    const up = (p: Vec3, dy: number): Vec3 => ({ x: p.x, y: p.y + dy, z: p.z });
    const hold = this.local(-0.1, TABLE_HEIGHT + 0.42, 0.28);
    const toward = (p: Vec3, dy = 0): Vec3 => up(p, dy);
    // Una pose recortada puede dejar el cuerpo en el aire: siempre vuelve al asiento.
    if (st.bob !== 0 && cue.pose !== 'cheer' && cue.pose !== 'flinch')
      tl.to(st, { bob: 0, duration: 0.15 }, 0);
    switch (cue.pose) {
      case 'turn':
        // Se yergue un instante y se inclina a la mesa: «me toca».
        tl.to(st, { lean: -0.05, headPitch: 0, duration: d * 0.35, ease: 'power1.out' });
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d, ease: 'back.out(2)' });
        break;
      case 'reach': {
        const grabbing = cue.target?.kind !== 'slot';
        if (grabbing) this.holdingSuppressed = true;
        tl.to(
          st,
          { lean: def.lean, headPitch: def.headPitch, duration: d, ease: 'back.out(1.4)' },
          0,
        );
        // La mano llega en arco (sube y baja) en vez de deslizarse en línea recta.
        if (target) {
          tl.to(st.hr, { x: target.x, z: target.z, duration: d, ease: 'power2.out' }, 0);
          tl.to(st.hr, { y: target.y + 0.12, duration: d * 0.5, ease: 'sine.out' }, 0);
          tl.to(st.hr, { y: target.y + 0.04, duration: d * 0.5, ease: 'sine.in' }, d * 0.5);
        }
        if (grabbing) {
          tl.call(() => {
            this.holdingSuppressed = false;
            hooks.onGrab?.();
          });
          tl.to(st.hr, { ...hold, duration: d * 0.9, ease: 'power1.inOut', delay: retract });
          tl.to(
            st,
            { lean: POSES.hold.lean, headPitch: POSES.hold.headPitch, duration: d * 0.9 },
            '<',
          );
          if (weight)
            tl.to(st.hr, {
              y: hold.y - weight.hop,
              duration: 0.06,
              yoyo: true,
              repeat: 1,
              ease: 'power1.out',
            });
        } else {
          tl.call(() => hooks.onRelease?.(this.handWorld(), weight?.hop));
          tl.to(st.hr, { ...rest.hr, duration: d, ease: 'power1.inOut', delay: retract });
          tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        }
        break;
      }
      case 'toss':
        tl.to(st.hr, { ...this.local(-0.12, TABLE_HEIGHT + 0.36, 0.42), duration: d * 0.4 }, 0);
        tl.to(st, { lean: def.lean, duration: d * 0.4 }, 0);
        tl.call(() => hooks.onRelease?.(this.handWorld(), weight?.hop));
        if (target)
          tl.to(st.hr, { ...toward(target, 0.12), duration: d * 0.3, ease: 'power3.out' });
        tl.to(st.hr, { ...rest.hr, duration: d, ease: 'power1.inOut', delay: retract });
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        break;
      case 'point':
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d * 0.6 }, 0);
        if (target)
          tl.to(st.hl, { ...toward(target, 0.14), duration: d * 0.6, ease: 'power2.out' }, 0);
        tl.to(st.hl, { ...rest.hl, duration: d, ease: 'power1.inOut' }, `+=${reduced ? 0 : 0.6}`);
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        break;
      case 'slap':
        // Anticipación: la mano sube antes del golpe (mismo tiempo total, D-045).
        tl.to(st, { lean: def.lean, duration: d * 0.6, ease: 'power3.in' }, 0);
        if (target) {
          tl.to(st.hr, { ...toward(target, 0.16), duration: d * 0.25, ease: 'power2.out' }, 0);
          tl.to(st.hr, { ...toward(target, 0.02), duration: d * 0.35, ease: 'power4.in' });
        }
        tl.to(st.hr, { ...rest.hr, duration: d * 1.4, ease: 'power2.out', delay: retract });
        tl.to(st, { lean: 0, duration: d * 1.4 }, '<');
        break;
      case 'flinch':
        // Respingo: retrocede de golpe, da un saltito y la cabeza vibra amortiguada.
        tl.to(
          st,
          { lean: def.lean, headPitch: def.headPitch, duration: d * 0.25, ease: 'power3.out' },
          0,
        );
        tl.to(st, { bob: 0.03, duration: d * 0.2, yoyo: true, repeat: 1, ease: 'power2.out' }, 0);
        tl.fromTo(
          st,
          { headYaw: 0.3 },
          { headYaw: 0, duration: reduced ? 0.001 : 0.6, ease: 'elastic.out(1.2, 0.25)' },
          d * 0.2,
        );
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d, ease: 'power2.inOut' });
        break;
      case 'ultima': {
        const high = (p: Vec3): Vec3 => up(p, 0.35);
        tl.to(st, { lean: -0.1, headPitch: -0.2, duration: d * 0.4 }, 0);
        tl.to(st.hl, { ...high(rest.hl), duration: d * 0.4 }, 0);
        tl.to(st.hr, { ...high(rest.hr), duration: d * 0.4 }, 0);
        tl.to(st, {
          lean: def.lean,
          headPitch: def.headPitch,
          duration: d * 0.2,
          ease: 'power4.in',
        });
        tl.to(st.hl, { ...rest.hl, duration: d * 0.2, ease: 'power4.in' }, '<');
        tl.to(st.hr, { ...rest.hr, duration: d * 0.2, ease: 'power4.in' }, '<');
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d });
        break;
      }
      case 'cheer': {
        const pop = { duration: d * 0.5, ease: 'back.out(2.2)' };
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, ...pop }, 0);
        tl.to(st.hl, { ...this.local(0.2, TABLE_HEIGHT + 0.85, 0.12), ...pop }, 0);
        tl.to(st.hr, { ...this.local(-0.2, TABLE_HEIGHT + 0.85, 0.12), ...pop }, 0);
        // Botecitos de alegría sobre el taburete.
        if (!reduced)
          tl.to(
            st,
            { bob: 0.05, duration: 0.16, yoyo: true, repeat: 3, ease: 'sine.inOut' },
            d * 0.3,
          );
        tl.to(st.hl, { ...rest.hl, duration: d, ease: 'power2.inOut' }, `+=${reduced ? 0 : 0.4}`);
        tl.to(st.hr, { ...rest.hr, duration: d, ease: 'power2.inOut' }, '<');
        tl.to(st, { lean: 0, bob: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        break;
      }
      case 'slump':
        // Se desinfla despacio: suspiro (sube un poco) y cae.
        tl.to(st, { lean: -0.05, headPitch: 0, bob: 0.015, duration: d * 0.3, ease: 'sine.out' });
        tl.to(st, {
          lean: def.lean,
          headPitch: def.headPitch,
          bob: -0.02,
          duration: d,
          ease: 'power2.in',
        });
        tl.to(
          st,
          { lean: 0, bob: 0, headPitch: POSES.idle.headPitch, duration: d },
          `+=${reduced ? 0 : 1.4}`,
        );
        break;
      case 'hold':
        tl.to(st.hr, { ...hold, duration: d });
        break;
      case 'idle':
        tl.to(st, { lean: 0, headPitch: def.headPitch, duration: d });
        tl.to(st.hl, { ...rest.hl, duration: d }, 0);
        tl.to(st.hr, { ...rest.hr, duration: d }, 0);
        break;
    }
    if (reduced) tl.progress(1);
  }

  /** El presenter recorta el peso: lo que quede de la animación corre más deprisa (D-045). */
  trimWeight(): void {
    this.timeline?.timeScale(WEIGHT_TRIM_SPEED);
  }

  /** Sigue sosteniendo la carta (reconexión / snapshot sin animación). */
  ensureHolding(holding: boolean): void {
    if (this.timeline?.isActive()) return;
    const hold = this.local(-0.1, TABLE_HEIGHT + 0.42, 0.28);
    const goal = holding ? hold : this.rest.hr;
    const d = Math.hypot(
      goal.x - this.state.hr.x,
      goal.y - this.state.hr.y,
      goal.z - this.state.hr.z,
    );
    if (d > 0.02) this.timeline = gsap.timeline().to(this.state.hr, { ...goal, duration: 0.35 });
  }

  /** Punto del marco local del personaje (+X su izquierda, +Z hacia el centro) en mundo. */
  private local(x: number, y: number, z: number): Vec3 {
    const v = new THREE.Vector3(x, 0, z).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.root.rotation.y,
    );
    return { x: this.root.position.x + v.x, y, z: this.root.position.z + v.z };
  }

  update(timeSec: number, reduced: boolean): void {
    const st = this.state;
    const dtMs = this.lastT === 0 ? 0 : Math.min(100, (timeSec - this.lastT) * 1000);
    const dt = dtMs / 1000;
    this.lastT = timeSec;
    const busy = this.timeline?.isActive() ?? false;
    this.rig?.update(reduced ? 0 : dt);
    const live = reduced ? 0 : this.blendIdle(busy, dt);
    const t = timeSec + this.phase;
    const breath = reduced ? 0 : Math.sin(timeSec * 1.3 + this.phase);
    this.hip.rotation.x = st.lean + breath * 0.015;
    // Cambio de peso lento + respiración: el cuerpo nunca queda congelado.
    this.hip.rotation.z = live * SWAY_ROLL * Math.sin(t * 0.37);
    this.hip.rotation.y = live * SWAY_ROLL * 0.6 * Math.sin(t * 0.23 + 1.1);
    this.hip.position.y = TABLE_HEIGHT - 0.2 + breath * 0.006 + st.bob;
    // La cabeza mira a quien juega (giro limitado) además del cabeceo de la pose.
    // «Reducir movimiento» (D-045) la deja al frente y deja el párpado abierto.
    let yaw = 0;
    if (!reduced) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(this.tmpV.copy(this.lookTarget));
      yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(local.x, local.z)));
      this.stepSaccade(dt, live);
    }
    // Amortiguación exponencial: la cabeza gira con inercia en vez de saltar.
    const k = reduced || dt === 0 ? 1 : 1 - Math.exp(-GAZE_DAMP * dt);
    this.gazeYaw += (yaw + this.saccade.yaw * live - this.gazeYaw) * k;
    this.gazePitch += (this.saccade.pitch * live - this.gazePitch) * k;
    const tilt = live * HEAD_TILT * Math.sin(t * 0.53);
    this.neck.rotation.set(st.headPitch + this.gazePitch, this.gazeYaw + st.headYaw, tilt, 'YXZ');
    const closure = this.blink.step(dtMs, !reduced);
    this.lid.scale.y = closure;
    this.lid.visible = closure > 0.02;
    this.hip.updateMatrixWorld(true);
    this.solveArm(0, this.idleHand(st.hl, t, live, false));
    this.solveArm(1, this.idleHand(st.hr, t, live, this.stepTap(dt, live)));
  }

  /** Entra/sale suave de la vida en reposo: una pose no arranca desde un balanceo a medias. */
  private blendIdle(busy: boolean, dt: number): number {
    const goal = busy ? 0.15 : 1;
    this.idleWeight += (goal - this.idleWeight) * Math.min(1, IDLE_BLEND * dt);
    return this.idleWeight;
  }

  private stepSaccade(dt: number, live: number): void {
    this.saccade.inS -= dt;
    if (this.saccade.inS > 0) return;
    this.saccade.inS = SACCADE_MIN_S + this.rng() * SACCADE_RANGE_S;
    // La mitad de las veces vuelve al objetivo: miradas breves, no deriva.
    const back = this.rng() < 0.5 || live < 0.5;
    this.saccade.yaw = back ? 0 : (this.rng() * 2 - 1) * SACCADE_YAW;
    this.saccade.pitch = back ? 0 : (this.rng() * 2 - 1) * SACCADE_PITCH;
  }

  /** Golpecito de dedos de vez en cuando (0..1 = altura del golpe). */
  private stepTap(dt: number, live: number): number {
    if (this.tapT >= 0) {
      this.tapT += dt;
      if (this.tapT > 0.6) this.tapT = -1;
      // Dos golpes rápidos.
      return this.tapT < 0 ? 0 : Math.max(0, Math.sin(this.tapT * Math.PI * 3.33));
    }
    this.tapIn -= dt * live;
    if (this.tapIn <= 0) {
      this.tapIn = 3 + this.rng() * 6;
      this.tapT = 0;
    }
    return 0;
  }

  /** Objetivo de la mano con la deriva de reposo sumada (no muta el estado de la pose). */
  private idleHand(base: Vec3, t: number, live: number, tap: number | false): Vec3 {
    const side = tap === false ? 1.7 : 0;
    return {
      x: base.x + live * HAND_DRIFT * Math.sin(t * 0.61 + side),
      y: base.y + live * FINGER_TAP * (tap || 0),
      z: base.z + live * HAND_DRIFT * Math.cos(t * 0.47 + side),
    };
  }

  private solveArm(i: 0 | 1, targetWorld: Vec3): void {
    const sh = this.shoulders[i];
    const parent = sh.parent;
    if (!parent) return;
    const t = parent.worldToLocal(this.tmpV.set(targetWorld.x, targetWorld.y, targetWorld.z));
    t.sub(sh.position);
    const side = i === 0 ? 1 : -1;
    const sol = solveTwoBone(t, RIG.upperArm, RIG.foreArm + RIG.hand * 0.5, {
      x: side * 0.7,
      y: -1,
      z: -0.5,
    });
    sh.quaternion.copy(
      this.tmpQ.set(sol.shoulder.x, sol.shoulder.y, sol.shoulder.z, sol.shoulder.w),
    );
    this.elbows[i].rotation.set(sol.elbow, 0, 0);
  }

  dispose(): void {
    this.disposed = true;
    this.rig?.dispose();
    this.timeline?.kill();
    for (const m of this.meshes) m.geometry.dispose();
    this.root.removeFromParent();
  }
}
