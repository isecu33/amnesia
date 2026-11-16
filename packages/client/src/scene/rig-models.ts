/**
 * Animales riggeados (D-063) en la mesa, en lugar de las marionetas procedurales.
 * Se cargan las versiones web `assets/<animal>/<animal>-rig.web.glb` (~2,5 MB,
 * generadas con `tools/rig/rig_web.py`, D-067), en dev y en producción.
 * `?rigs=0` vuelve a las marionetas.
 *
 * Cosmético: el rig no recibe nunca valores de carta (I2); la carta sostenida la
 * sigue pintando `World` por el dorso.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { layerOnBone } from './rig-math.js';
import { CLIP_HOLD_S, missingClips, type RigClipId } from './poses.js';
import { TABLE_HEIGHT } from './layout.js';
import type { SpeciesId } from './species.js';

/** Nombre de carpeta en `assets/` de cada especie. */
const ASSET_OF: Record<SpeciesId, string> = {
  owl: 'buho',
  fox: 'zorro',
  bear: 'oso',
  deer: 'ciervo',
  snake: 'serpiente',
  crow: 'cuervo',
};
/** Las aves se posan sobre la mesa; el resto se sienta (igual que rig_animal.py). */
const ON_TABLE: ReadonlySet<SpeciesId> = new Set<SpeciesId>(['owl', 'crow']);
/** Altura de mesa y borde de mesa del rig (m), de `tools/rig/rig_animal.py`. */
const RIG_TABLE_H = 0.44;
const RIG_TABLE_EDGE = 0.24;
/** Borde de la mesa en el marco local del asiento del juego (SEAT_BEYOND_EDGE). */
const GAME_TABLE_EDGE = 0.3;
/** Las aves se posan justo pasado el borde, antes de su fila de tótems. */
const BIRD_PERCH = 0.06;
/**
 * Lado (px) al que se reducen las texturas del GLB. El juego renderiza a ~360 px
 * de alto: texturas 4K solo gastan VRAM (≈64 MB cada una sin comprimir).
 */
export const RIG_TEXTURE_PX = 256;
const CROSSFADE_S = 0.25;

/** Activos por defecto; `?rigs=0` vuelve a las marionetas procedurales. */
export const rigsEnabled = (): boolean =>
  new URLSearchParams(globalThis.location?.search ?? '').get('rigs') !== '0';

// Carga perezosa: cada GLB se emite como fichero aparte y solo se pide si su especie está en la mesa.
const urls: Record<string, () => Promise<string>> = import.meta.glob<string>(
  '../../../../assets/*/*-rig.web.glb',
  { query: '?url', import: 'default' },
);

const loader = new GLTFLoader();
const cache = new Map<SpeciesId, Promise<RigTemplate>>();

interface RigTemplate {
  /** original sin añadir a la escena: solo se clona (SkeletonUtils) */
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  /** altura del modelo en unidades del rig */
  height: number;
}

function shrink(tex: THREE.Texture | null): THREE.Texture | null {
  const img = tex?.image as CanvasImageSource | undefined;
  if (!tex || !img) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RIG_TEXTURE_PX;
  const c = canvas.getContext('2d');
  if (!c) return tex;
  c.drawImage(img, 0, 0, RIG_TEXTURE_PX, RIG_TEXTURE_PX);
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = tex.flipY;
  out.colorSpace = THREE.SRGBColorSpace;
  out.magFilter = THREE.NearestFilter;
  out.minFilter = THREE.NearestFilter;
  out.generateMipmaps = false;
  tex.dispose();
  return out;
}

/** PBR → Lambert facetado con textura diminuta: mismo lenguaje visual que la mesa (D-042). */
function stylize(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.material as THREE.MeshStandardMaterial;
    o.material = new THREE.MeshLambertMaterial({ map: shrink(src.map), flatShading: true });
    src.metalnessMap?.dispose();
    src.normalMap?.dispose();
    src.dispose();
    o.frustumCulled = false;
  });
}

async function loadTemplate(species: SpeciesId): Promise<RigTemplate> {
  const name = ASSET_OF[species];
  const entry = Object.entries(urls).find(([p]) => p.endsWith(`/${name}/${name}-rig.web.glb`));
  if (!entry) throw new Error(`Falta assets/${name}/${name}-rig.web.glb (tools/rig/rig_web.py)`);
  const gltf = await loader.loadAsync(await entry[1]());
  stylize(gltf.scene);
  const missing = missingClips(gltf.animations.map((a) => a.name));
  if (missing.length) console.warn(`[rigs] ${species}: faltan clips`, missing.join(', '));
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  return { scene: gltf.scene, clips: gltf.animations, height: size.y };
}

/** Capa procedural que `Puppet` pone encima de los clips cada frame (rad, m); todo 0 = solo el clip. */
export interface RigLayer {
  /** inclinación del torso hacia la mesa */
  lean: number;
  /** balanceo lateral y giro del torso */
  roll: number;
  bodyYaw: number;
  /** cabeceo (+ abajo), giro (+ hacia su izquierda) y ladeo de la cabeza respecto al clip */
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** salto vertical (m) y compresión (>0 aplasta, <0 estira) del cuerpo */
  bob: number;
  squash: number;
}

export interface RigModel {
  readonly root: THREE.Object3D;
  /**
   * Lanza un clip una vez y vuelve a `reposo`. `hold` lo pausa al sostener la
   * carta hasta `releaseHold()`; `timeScale` acelera las poses rápidas.
   */
  playOnce(clip: RigClipId, opts?: { timeScale?: number; hold?: boolean }): void;
  /** Reanuda un clip pausado sosteniendo la carta; `false` si no había. */
  releaseHold(): boolean;
  /** `true` entre `playOnce({hold})` y `releaseHold()`. */
  readonly holding: boolean;
  /** `true` si solo suena `reposo`. */
  readonly idle: boolean;
  /** Avanza los clips; con `reduced` aborta cualquier clip y deja `reposo` congelado. */
  update(dtSec: number, reduced?: boolean): void;
  /** Aplica la capa procedural DESPUÉS de `update`. */
  applyLayer(layer: RigLayer): void;
  /** Punto entre la muñeca y los dedos, en mundo (matrices al día); `false` si no hay hueso. */
  handPoint(right: boolean, out: THREE.Vector3): boolean;
  /** 0..1: resalte del turno activo (emisivo cálido). */
  setEmphasis(amount: number): void;
  dispose(): void;
}

/** Huesos de rig_animal.py (GLTFLoader quita los puntos al sanear: `mano.D` → `manoD`). */
const BONE = { spine: 'columna', head: 'cabeza', handR: 'mano.D', handL: 'mano.I' } as const;
const EMPHASIS_COLOR = new THREE.Color(0xffb060);
const EMPHASIS_MAX = 0.3;

const findBone = (root: THREE.Object3D, name: string): THREE.Object3D | undefined =>
  root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? root.getObjectByName(name);

interface LayerBone {
  node: THREE.Object3D;
  /** del modelo al padre del hueso */
  chain: THREE.Object3D[];
  /** el mixer reescribe su rotación cada frame; si no, hay que restaurar el reposo */
  driven: boolean;
  bind: THREE.Quaternion;
}

function layerBone(
  model: THREE.Object3D,
  name: string,
  clips: readonly THREE.AnimationClip[],
): LayerBone | undefined {
  const node = findBone(model, name);
  if (!node) return undefined;
  const chain: THREE.Object3D[] = [];
  for (let o = node.parent; o; o = o.parent) {
    chain.unshift(o);
    if (o === model) break;
  }
  const track = `${node.name}.quaternion`;
  return {
    node,
    chain,
    driven: clips.some((c) => c.tracks.some((t) => t.name === track)),
    bind: node.quaternion.clone(),
  };
}

/** Carga (con caché por especie) y devuelve una instancia colocada en el marco local del asiento. */
export async function loadRig(species: SpeciesId): Promise<RigModel> {
  let p = cache.get(species);
  if (!p) {
    p = loadTemplate(species);
    cache.set(species, p);
  }
  const tpl = await p;
  // Un clon de esqueleto por instancia: dos rivales de la misma especie (o uno que
  // se descarta antes de que cargue) no se pisan. Geometría y texturas se comparten;
  // los materiales se clonan para poder resaltar el turno de cada uno.
  const model = cloneSkinned(tpl.scene) as THREE.Group;
  const materials: THREE.MeshLambertMaterial[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = (o.material as THREE.MeshLambertMaterial).clone();
    o.material = m;
    materials.push(m);
  });
  const scale = TABLE_HEIGHT / RIG_TABLE_H;
  model.scale.setScalar(scale);
  if (ON_TABLE.has(species)) model.position.set(0, TABLE_HEIGHT, GAME_TABLE_EDGE + BIRD_PERCH);
  else model.position.set(0, 0, GAME_TABLE_EDGE - RIG_TABLE_EDGE * scale);
  const baseY = model.position.y;

  const mixer = new THREE.AnimationMixer(model);
  const action = (n: string): THREE.AnimationAction | undefined => {
    const clip = THREE.AnimationClip.findByName(tpl.clips, n);
    return clip ? mixer.clipAction(clip) : undefined;
  };
  const idle = action('reposo');
  idle?.play();
  let current = idle;
  let hold: { action: THREE.AnimationAction; at: number } | undefined;

  /** Vuelve a `reposo` fundiendo; su fase no se reinicia (sin salto de respiración). */
  const backToIdle = (): void => {
    hold = undefined;
    if (idle && current && current !== idle) current.crossFadeTo(idle, CROSSFADE_S, false);
    current = idle;
  };
  mixer.addEventListener('finished', (e) => {
    if ((e as unknown as { action: THREE.AnimationAction }).action === current) backToIdle();
  });

  const spine = layerBone(model, BONE.spine, tpl.clips);
  const head = layerBone(model, BONE.head, tpl.clips);
  const hands = { r: findBone(model, BONE.handR), l: findBone(model, BONE.handL) };
  const qP = new THREE.Quaternion();
  const qD = new THREE.Quaternion();
  const qS = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();

  const layer = (b: LayerBone | undefined, pitch: number, yaw: number, roll: number): void => {
    if (!b) return;
    if (!b.driven) b.node.quaternion.copy(b.bind);
    qP.identity();
    for (const o of b.chain) qP.multiply(o.quaternion);
    qD.setFromEuler(eul.set(pitch, yaw, roll, 'YXZ'));
    layerOnBone(b.node.quaternion, b.node.quaternion, qP, qD, qS);
  };

  let emphasis = 0;
  return {
    root: model,
    get holding() {
      return hold !== undefined;
    },
    get idle() {
      return current === idle;
    },
    playOnce(name, opts = {}) {
      const a = action(name);
      if (!a) return;
      hold = undefined;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = opts.timeScale ?? 1;
      a.setEffectiveWeight(1);
      a.play();
      // Repetir el mismo clip: crossFadeTo(self) lo dejaría con peso 0 (salto al reiniciar).
      if (current && current !== a) current.crossFadeTo(a, CROSSFADE_S, false);
      current = a;
      if (opts.hold) hold = { action: a, at: CLIP_HOLD_S };
    },
    releaseHold() {
      if (!hold) return false;
      hold.action.paused = false;
      hold = undefined;
      return true;
    },
    update(dt, reduced = false) {
      if (reduced) {
        // Con dt=0 `finished` no llega nunca: no se deja un clip a medias.
        if (current !== idle) {
          current?.stop();
          idle?.setEffectiveWeight(1);
          current = idle;
          hold = undefined;
        }
        return;
      }
      mixer.update(dt);
      if (hold && current === hold.action && hold.action.time >= hold.at) {
        hold.action.time = hold.at;
        hold.action.paused = true;
      }
    },
    applyLayer(l) {
      layer(spine, l.lean, l.bodyYaw, l.roll);
      layer(head, l.headPitch, l.headYaw, l.headRoll);
      model.position.y = baseY + l.bob;
      model.scale.set(
        scale * (1 + l.squash * 0.5),
        scale * (1 - l.squash),
        scale * (1 + l.squash * 0.5),
      );
    },
    handPoint(right, out) {
      const h = right ? hands.r : hands.l;
      if (!h) return false;
      h.getWorldPosition(vA);
      const tip = h.children[0];
      if (tip) out.copy(vA).add(tip.getWorldPosition(vB)).multiplyScalar(0.5);
      else out.copy(vA);
      return true;
    },
    setEmphasis(a) {
      if (Math.abs(a - emphasis) < 0.01) return;
      emphasis = a;
      for (const m of materials) m.emissive.copy(EMPHASIS_COLOR).multiplyScalar(EMPHASIS_MAX * a);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const m of materials) m.dispose();
      model.removeFromParent();
    },
  };
}
