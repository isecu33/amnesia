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
import { POSES, type PoseCue } from './poses.js';
import { solveTwoBone } from './rig-math.js';
import { SPECIES, type Species, type SpeciesId } from './species.js';
import { hex, makeCanvas, noiseRect, pixelTexture, shade } from './pixel.js';

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

function drawFace(c: CanvasRenderingContext2D, s: Species): void {
  const [x0, y0] = R_FACE;
  noiseRect(c, x0, y0, 16, 16, s.fur, shade(s.fur, 0.85), 0.2, 11);
  const px = (x: number, y: number, w: number, h: number, col: number): void => {
    c.fillStyle = hex(col);
    c.fillRect(x0 + x, y0 + y, w, h);
  };
  switch (s.silhouette) {
    case 'tufts': // búho: discos faciales claros, ojos enormes
      px(1, 4, 6, 6, s.belly);
      px(9, 4, 6, 6, s.belly);
      px(2, 5, 4, 4, s.eye);
      px(10, 5, 4, 4, s.eye);
      px(3, 6, 2, 2, 0x0b0912);
      px(11, 6, 2, 2, 0x0b0912);
      break;
    case 'pointy-ears': // zorro: antifaz oscuro y hocico blanco
      px(0, 5, 16, 3, s.mark);
      px(3, 6, 3, 2, s.eye);
      px(10, 6, 3, 2, s.eye);
      px(4, 10, 8, 6, s.belly);
      break;
    case 'round-ears': // oso: pintura ritual dorada en la frente
      px(6, 1, 4, 2, s.mark);
      px(7, 3, 2, 2, s.mark);
      px(3, 7, 3, 2, s.eye);
      px(10, 7, 3, 2, s.eye);
      px(4, 10, 8, 5, s.belly);
      break;
    case 'antlers': // ciervo: lágrimas místicas bajo los ojos
      px(3, 6, 3, 3, s.eye);
      px(10, 6, 3, 3, s.eye);
      px(4, 9, 1, 4, s.mark);
      px(11, 9, 1, 4, s.mark);
      px(6, 11, 4, 4, s.belly);
      break;
    case 'hood': // serpiente: ojos rasgados y escamas
      px(2, 6, 4, 2, s.eye);
      px(10, 6, 4, 2, s.eye);
      px(3, 6, 1, 2, 0x0b0912);
      px(12, 6, 1, 2, 0x0b0912);
      px(5, 10, 6, 1, s.mark);
      px(6, 12, 4, 1, s.mark);
      break;
    case 'beak': // cuervo: ojos brillantes y marca de vela en la frente
      px(3, 6, 3, 3, s.eye);
      px(10, 6, 3, 3, s.eye);
      px(7, 1, 2, 3, s.mark);
      break;
  }
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
      out.push(at(box(0.07 * k, 0.12 * k, 0.05 * k, R_DARK), -0.12 * k, 0.3 * k, -0.02, 0, 0.35));
      out.push(at(box(0.07 * k, 0.12 * k, 0.05 * k, R_DARK), 0.12 * k, 0.3 * k, -0.02, 0, -0.35));
      out.push(at(solid(cone(0.035 * k, 0.07 * k, 4), R_MARK), 0, 0.08 * k, 0.16 * k, Math.PI / 2));
      break;
    case 'pointy-ears':
      out.push(at(solid(cone(0.06 * k, 0.16 * k, 4), R_FUR), -0.1 * k, 0.33 * k, 0));
      out.push(at(solid(cone(0.06 * k, 0.16 * k, 4), R_FUR), 0.1 * k, 0.33 * k, 0));
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
      out.push(at(box(0.5 * k, 0.36 * k, 0.04 * k, R_DARK, R_MARK), 0, 0.12 * k, -0.11 * k));
      out.push(at(box(0.05 * k, 0.015, 0.06 * k, R_GLOW), 0, 0.02 * k, 0.17 * k));
      break;
    case 'beak':
      out.push(at(solid(cone(0.06 * k, 0.24 * k, 4), R_DARK), 0, 0.08 * k, 0.24 * k, Math.PI / 2));
      out.push(at(box(0.04 * k, 0.1 * k, 0.12 * k, R_DARK), 0, 0.31 * k, -0.02, -0.4));
      break;
  }
  return out;
}

export interface PuppetState {
  lean: number;
  headPitch: number;
  headYaw: number;
  hl: Vec3;
  hr: Vec3;
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
  private phase = Math.random() * Math.PI * 2;
  private lookTarget = new THREE.Vector3();
  private timeline?: gsap.core.Timeline;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(
    readonly playerId: string,
    readonly species: SpeciesId,
    anchors: CharacterAnchors,
  ) {
    const s = SPECIES[species];
    const mat = new THREE.MeshLambertMaterial({ map: speciesAtlas(s), flatShading: true });
    const b = s.bulk;
    const k = s.headScale;
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
    };
    this.place(anchors);
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
    hooks: { onGrab?: () => void; onRelease?: (from: THREE.Vector3) => void } = {},
    reduced = false,
  ): void {
    const def = POSES[cue.pose];
    const d = reduced ? 0.001 : def.durationMs / 1000;
    const target = cue.target ? resolve(cue.target) : undefined;
    const st = this.state;
    this.timeline?.kill();
    const tl = gsap.timeline();
    this.timeline = tl;
    const rest = this.rest;
    const up = (p: Vec3, dy: number): Vec3 => ({ x: p.x, y: p.y + dy, z: p.z });
    const hold = this.local(-0.1, TABLE_HEIGHT + 0.42, 0.28);
    const toward = (p: Vec3, dy = 0): Vec3 => up(p, dy);
    switch (cue.pose) {
      case 'turn':
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d });
        break;
      case 'reach': {
        const grabbing = cue.target?.kind !== 'slot';
        if (grabbing) this.holdingSuppressed = true;
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d, ease: 'power2.out' }, 0);
        if (target) tl.to(st.hr, { ...toward(target, 0.04), duration: d, ease: 'power2.out' }, 0);
        if (grabbing) {
          tl.call(() => {
            this.holdingSuppressed = false;
            hooks.onGrab?.();
          });
          tl.to(st.hr, { ...hold, duration: d * 0.9, ease: 'power1.inOut' });
          tl.to(
            st,
            { lean: POSES.hold.lean, headPitch: POSES.hold.headPitch, duration: d * 0.9 },
            '<',
          );
        } else {
          tl.call(() => hooks.onRelease?.(this.handWorld()));
          tl.to(st.hr, { ...rest.hr, duration: d, ease: 'power1.inOut' });
          tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        }
        break;
      }
      case 'toss':
        tl.to(st.hr, { ...this.local(-0.12, TABLE_HEIGHT + 0.36, 0.42), duration: d * 0.4 }, 0);
        tl.to(st, { lean: def.lean, duration: d * 0.4 }, 0);
        tl.call(() => hooks.onRelease?.(this.handWorld()));
        if (target)
          tl.to(st.hr, { ...toward(target, 0.12), duration: d * 0.3, ease: 'power3.out' });
        tl.to(st.hr, { ...rest.hr, duration: d, ease: 'power1.inOut' });
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
        tl.to(st, { lean: def.lean, duration: d * 0.6 }, 0);
        if (target)
          tl.to(st.hr, { ...toward(target, 0.02), duration: d * 0.6, ease: 'power4.in' }, 0);
        tl.to(st.hr, { ...rest.hr, duration: d * 1.4, ease: 'power2.out' });
        tl.to(st, { lean: 0, duration: d * 1.4 }, '<');
        break;
      case 'flinch':
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d * 0.4 }, 0);
        tl.to(st, { headYaw: 0.35, duration: 0.08, yoyo: true, repeat: reduced ? 0 : 5 });
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, headYaw: 0, duration: d });
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
      case 'cheer':
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d * 0.5 }, 0);
        tl.to(st.hl, { ...this.local(0.2, TABLE_HEIGHT + 0.85, 0.12), duration: d * 0.5 }, 0);
        tl.to(st.hr, { ...this.local(-0.2, TABLE_HEIGHT + 0.85, 0.12), duration: d * 0.5 }, 0);
        tl.to(st.hl, { ...rest.hl, duration: d }, `+=${reduced ? 0 : 1}`);
        tl.to(st.hr, { ...rest.hr, duration: d }, '<');
        tl.to(st, { lean: 0, headPitch: POSES.idle.headPitch, duration: d }, '<');
        break;
      case 'slump':
        tl.to(st, { lean: def.lean, headPitch: def.headPitch, duration: d });
        tl.to(
          st,
          { lean: 0, headPitch: POSES.idle.headPitch, duration: d },
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
    const breath = reduced ? 0 : Math.sin(timeSec * 1.3 + this.phase);
    this.hip.rotation.x = st.lean + breath * 0.015;
    this.hip.position.y = TABLE_HEIGHT - 0.2 + breath * 0.006;
    // La cabeza mira a quien juega (giro limitado) además del cabeceo de la pose.
    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(this.tmpV.copy(this.lookTarget));
    const yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(local.x, local.z)));
    this.neck.rotation.set(st.headPitch, yaw + st.headYaw, 0, 'YXZ');
    this.hip.updateMatrixWorld(true);
    this.solveArm(0, st.hl);
    this.solveArm(1, st.hr);
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
    this.timeline?.kill();
    for (const m of this.meshes) m.geometry.dispose();
    this.root.removeFromParent();
  }
}
