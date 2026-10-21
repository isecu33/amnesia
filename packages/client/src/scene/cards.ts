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
import { BACK_CELL, CARD_CELL } from './textures.js';

export const CARD_SIZE = { w: 0.08, h: 0.012, d: 0.11 } as const;

export interface CardHandle {
  key: string;
  index: number;
  proxy: THREE.Object3D;
  cell: number;
  visible: boolean;
  /** resaltado legal: marco brillante debajo */
  highlighted: boolean;
}

/** Visible si él y todos sus ancestros lo son (p. ej. tu mano oculta). */
function visibleChain(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

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
  const g = new THREE.PlaneGeometry(CARD_SIZE.w + 0.026, CARD_SIZE.d + 0.026);
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

  constructor(
    atlas: THREE.Texture,
    highlightColor: number,
    readonly capacity = 112,
  ) {
    const geo = cardGeometry();
    this.cells = new Float32Array(capacity).fill(BACK_CELL);
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
    };
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.name = 'cards';
    this.mesh.frustumCulled = false;
    this.frameMaterial = new THREE.MeshBasicMaterial({
      color: highlightColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    this.frames = new THREE.InstancedMesh(frameGeometry(), this.frameMaterial, capacity);
    this.frames.name = 'card-frames';
    this.frames.frustumCulled = false;
    this.frames.renderOrder = -1;
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
    const h: CardHandle = { key, index, proxy, cell: BACK_CELL, visible: true, highlighted: false };
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

  /** Copia proxies → instancias. Llamar tras `scene.updateMatrixWorld()`. */
  sync(timeSec: number): void {
    for (const h of this.handles.values()) {
      const show = h.visible && visibleChain(h.proxy);
      this.mesh.setMatrixAt(h.index, show ? h.proxy.matrixWorld : HIDDEN);
      this.cells[h.index] = h.cell;
      if (show && h.highlighted) {
        h.proxy.matrixWorld.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.tmpPos.y -= 0.004;
        this.tmp.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.frames.setMatrixAt(h.index, this.tmp);
      } else {
        this.frames.setMatrixAt(h.index, HIDDEN);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.frames.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.frameMaterial.opacity = 0.55 + Math.sin(timeSec * 4) * 0.3;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.frames.geometry.dispose();
    this.material.dispose();
    this.frameMaterial.dispose();
  }
}
