/**
 * TODAS las cartas de la mesa (tótems, mazo, descarte, cartas en mano y cartas
 * en vuelo) en un único `InstancedMesh` con atlas pixel (D-042, docs/02 §5.3):
 * una draw call en vez de una por tótem.
 *
 * Cada carta tiene un `proxy` (Object3D sin geometría) que es lo que animan GSAP,
 * la reconciliación y los personajes; `sync()` copia su matriz a la instancia.
 * El proxy puede colgar de la mano de un personaje y seguirla sola.
 */
import * as THREE from 'three';
import { DECK_TILT, DISCARD_SCALE_BOOST, DISCARD_TILT, PILE_SCALE } from './layout.js';
import { BACK_CELL, CARD_CELL } from './textures.js';

/** Marco de «seleccionable» en tus tótems (ámbar) frente al de rivales/mesa (místico). */
const OWN_FRAME_COLOR = 0xffb35c;
const SELECTED_COLOR = 0xfff3b0;
/** Lo que sube la carta elegida y lo que flota la flecha sobre ella. */
export const SELECTED_LIFT = 0.03;
const ARROW_HEIGHT = 0.1;

/** Clave de la carta de un slot (misma convención que `world.ts`). */
export const slotCardKey = (player: string, slot: number): string => `slot:${player}#${slot}`;

/**
 * Contexto de resaltado que fija la interfaz (Table3D): qué carta está elegida
 * (sube, marco intenso y flecha) y el prefijo de TUS tótems (marco ámbar frente
 * al místico de rivales). Estado de presentación puro, leído en cada `sync`.
 */
export const cardHighlight: { selectedKey: string | undefined; ownPrefix: string } = {
  selectedKey: undefined,
  ownPrefix: '',
};

export const CARD_SIZE = { w: 0.08, h: 0.012, d: 0.11 } as const;

export interface CardHandle {
  key: string;
  index: number;
  proxy: THREE.Object3D;
  cell: number;
  visible: boolean;
  /** resaltado legal: marco brillante debajo */
  highlighted: boolean;
  /** luz de la carta, 0..1 (1 = plena); la carta bloqueada se apaga y la recupera */
  light: number;
}

/** Visible si él y todos sus ancestros lo son (p. ej. tu mano oculta). */
function visibleChain(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Mazo y descarte (agrandados en `sync`, ver `PILE_SCALE`). */
export const isPile = (key: string): boolean => key === 'discard' || key.startsWith('deck:');

const HIDDEN = new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5);

/** Caja cuya cara superior lleva la celda entera y el resto, el borde oscuro. */
function cardGeometry(): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(CARD_SIZE.w, CARD_SIZE.h, CARD_SIZE.d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4); // px, nx, py, ny, pz, nz
    // Mirando desde -Z, la izquierda de la pantalla es +X y lo cercano es -Z: se invierten U y V de la
    // cara superior para que el número no salga en espejo.
    if (face === 2) uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i));
    else uv.setXY(i, 0.02, 0.98);
  }
  uv.needsUpdate = true;
  return g;
}

function frameGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(CARD_SIZE.w + 0.04, CARD_SIZE.d + 0.04);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class CardSet {
  readonly mesh: THREE.InstancedMesh;
  readonly frames: THREE.InstancedMesh;
  readonly root = new THREE.Group();
  private readonly handles = new Map<string, CardHandle>();
  private readonly byIndex = new Map<number, CardHandle>();
  private readonly free: number[] = [];
  private readonly cells: Float32Array;
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly frameMaterial: THREE.MeshBasicMaterial;
  private readonly tmp = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpTilt = new THREE.Quaternion();
  private readonly tmpEdge = new THREE.Vector3();
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly lights: Float32Array;
  private readonly frameTone: Uint8Array;
  private readonly selMarker: THREE.Mesh;
  private readonly selArrow: THREE.Mesh;
  private readonly tmpAux = new THREE.Color();
  private readonly highlightColor: number;
  private readonly pileScale = new THREE.Vector3(PILE_SCALE.xz, PILE_SCALE.y, PILE_SCALE.xz);

  constructor(
    atlas: THREE.Texture,
    highlightColor: number,
    readonly capacity = 112,
  ) {
    const geo = cardGeometry();
    this.cells = new Float32Array(capacity).fill(BACK_CELL);
    this.lights = new Float32Array(capacity).fill(1);
    this.cellAttr = new THREE.InstancedBufferAttribute(this.cells, 1);
    geo.setAttribute('aCell', this.cellAttr);
    // Algo de emisión: los números se leen aunque la carta quede a contraluz.
    this.material = new THREE.MeshLambertMaterial({
      map: atlas,
      emissive: 0xffffff,
      emissiveMap: atlas,
      emissiveIntensity: 0.35,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          {
            vec2 cellSize = vec2(${(1 / CARD_CELL.cols).toFixed(6)}, ${(1 / CARD_CELL.rows).toFixed(6)});
            float col = mod(aCell, ${CARD_CELL.cols.toFixed(1)});
            float row = floor(aCell / ${CARD_CELL.cols.toFixed(1)});
            vMapUv = vec2(col, ${(CARD_CELL.rows - 1).toFixed(1)} - row) * cellSize + vMapUv * cellSize;
            #ifdef USE_EMISSIVEMAP
              vEmissiveMapUv = vMapUv;
            #endif
          }`,
        );
      // El color por instancia también apaga la emisión: la carta bloqueada se oscurece entera.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;',
      );
    };
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.name = 'cards';
    // Sin color por instancia three pinta negro: se inicializan todas en blanco.
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, this.tmpColor.setScalar(1));
    this.mesh.frustumCulled = false;
    this.frameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    this.frames = new THREE.InstancedMesh(frameGeometry(), this.frameMaterial, capacity);
    this.frames.name = 'card-frames';
    this.frames.frustumCulled = false;
    this.frames.renderOrder = -1;
    this.highlightColor = highlightColor;
    this.frameTone = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) this.frames.setColorAt(i, this.tmpColor.setHex(highlightColor));
    // Carta elegida: marco intenso (más ancho que el de «seleccionable») y flecha «aquí».
    const selGeo = new THREE.PlaneGeometry(CARD_SIZE.w + 0.075, CARD_SIZE.d + 0.075);
    selGeo.rotateX(-Math.PI / 2);
    this.selMarker = new THREE.Mesh(
      selGeo,
      new THREE.MeshBasicMaterial({ color: SELECTED_COLOR, depthWrite: false, fog: false }),
    );
    this.selMarker.renderOrder = -1;
    this.selMarker.visible = false;
    const arrowGeo = new THREE.ConeGeometry(0.028, 0.06, 4);
    arrowGeo.rotateX(Math.PI);
    this.selArrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: SELECTED_COLOR, fog: false }),
    );
    this.selArrow.visible = false;
    this.root.add(this.selMarker, this.selArrow);
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, HIDDEN);
      this.frames.setMatrixAt(i, HIDDEN);
    }
  }

  /** Devuelve (o crea) la carta `key`. `parent` por defecto es la raíz de la mesa. */
  get(key: string, parent?: THREE.Object3D): CardHandle {
    const hit = this.handles.get(key);
    if (hit) return hit;
    const index = this.free.pop();
    if (index === undefined) throw new Error('CardSet lleno');
    const proxy = new THREE.Object3D();
    proxy.name = key;
    (parent ?? this.root).add(proxy);
    const h: CardHandle = {
      key,
      index,
      proxy,
      cell: BACK_CELL,
      visible: true,
      highlighted: false,
      light: 1,
    };
    this.handles.set(key, h);
    this.byIndex.set(index, h);
    return h;
  }

  find(key: string): CardHandle | undefined {
    return this.handles.get(key);
  }

  release(key: string): void {
    const h = this.handles.get(key);
    if (!h) return;
    h.proxy.removeFromParent();
    this.handles.delete(key);
    this.byIndex.delete(h.index);
    this.mesh.setMatrixAt(h.index, HIDDEN);
    this.frames.setMatrixAt(h.index, HIDDEN);
    this.free.push(h.index);
  }

  keys(): string[] {
    return [...this.handles.keys()];
  }

  handleAt(index: number): CardHandle | undefined {
    return this.byIndex.get(index);
  }

  setAtlas(atlas: THREE.Texture): void {
    this.material.map = atlas;
    this.material.emissiveMap = atlas;
    this.material.needsUpdate = true;
  }

  /** Inclina mazo/descarte hacia la cámara girando sobre su borde cercano (modifica tmpPos/tmpQuat/tmpScale). */
  private tiltPile(key: string): void {
    const discard = key === 'discard';
    if (discard) {
      this.tmpScale.x *= DISCARD_SCALE_BOOST;
      this.tmpScale.z *= DISCARD_SCALE_BOOST;
    }
    const tilt = discard ? DISCARD_TILT : DECK_TILT;
    const q = this.tmpTilt.setFromAxisAngle(this.axisX, -tilt);
    const hd = (CARD_SIZE.d / 2) * this.tmpScale.z;
    const edge = this.tmpEdge.set(0, 0, hd);
    this.tmpPos.add(edge.clone().applyQuaternion(q).sub(edge));
    this.tmpQuat.premultiply(q);
  }

  /** Copia proxies → instancias. Llamar tras `scene.updateMatrixWorld()`. */
  sync(timeSec: number): void {
    let lightChanged = false;
    let toneChanged = false;
    let selShown = false;
    for (const h of this.handles.values()) {
      const show = h.visible && visibleChain(h.proxy);
      const pile = isPile(h.key);
      const selected = show && h.key === cardHighlight.selectedKey;
      const needsCompose = show && (pile || selected || h.highlighted);
      if (needsCompose) {
        h.proxy.matrixWorld.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
        if (pile) {
          this.tmpScale.multiply(this.pileScale);
          this.tiltPile(h.key);
        }
      }
      if (show && (pile || selected)) {
        const baseY = this.tmpPos.y;
        if (selected) this.tmpPos.y += SELECTED_LIFT;
        this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.mesh.setMatrixAt(h.index, this.tmp);
        this.tmpPos.y = baseY;
      } else this.mesh.setMatrixAt(h.index, show ? h.proxy.matrixWorld : HIDDEN);
      this.cells[h.index] = h.cell;
      if (this.lights[h.index] !== h.light) {
        this.lights[h.index] = h.light;
        this.mesh.setColorAt(h.index, this.tmpColor.setScalar(h.light));
        lightChanged = true;
      }
      if (selected) {
        // El marco «seleccionable» se cambia por el intenso, y la flecha flota encima.
        this.frames.setMatrixAt(h.index, HIDDEN);
        this.selMarker.position.set(this.tmpPos.x, this.tmpPos.y - 0.003, this.tmpPos.z);
        this.selMarker.quaternion.copy(this.tmpQuat);
        this.selArrow.position.set(
          this.tmpPos.x,
          this.tmpPos.y + SELECTED_LIFT + ARROW_HEIGHT + Math.sin(timeSec * 6) * 0.012,
          this.tmpPos.z,
        );
        selShown = true;
      } else if (show && h.highlighted) {
        this.tmpPos.y -= 0.004;
        this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.frames.setMatrixAt(h.index, this.tmp);
        const tone = h.key.startsWith(cardHighlight.ownPrefix) && cardHighlight.ownPrefix !== '' ? 1 : 0;
        if (this.frameTone[h.index] !== tone) {
          this.frameTone[h.index] = tone;
          this.frames.setColorAt(
            h.index,
            this.tmpAux.setHex(tone === 1 ? OWN_FRAME_COLOR : this.highlightColor),
          );
          toneChanged = true;
        }
      } else {
        this.frames.setMatrixAt(h.index, HIDDEN);
      }
    }
    this.selMarker.visible = selShown;
    this.selArrow.visible = selShown;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (lightChanged && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (toneChanged && this.frames.instanceColor) this.frames.instanceColor.needsUpdate = true;
    this.frames.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    // «Seleccionable»: pulso suave y tenue; lo elegido lleva su propio marco intenso.
    this.frameMaterial.opacity = 0.4 + Math.sin(timeSec * 4) * 0.22;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.frames.geometry.dispose();
    this.material.dispose();
    this.frameMaterial.dispose();
    this.selMarker.geometry.dispose();
    this.selArrow.geometry.dispose();
    (this.selMarker.material as THREE.Material).dispose();
    (this.selArrow.material as THREE.Material).dispose();
  }
}
