/**
 * EXPERIMENTO (D-063, pendiente «integrar en la escena»): animales riggeados de
 * `assets/<animal>/<animal>-rig.glb` en la mesa, en lugar de las marionetas
 * procedurales. Solo en desarrollo y con `?rigs=1`: los GLB pesan ~28 MB cada uno
 * y no deben entrar en el build de producción hasta comprimirlos.
 *
 * Cosmético: el rig no recibe nunca valores de carta (I2); la carta sostenida la
 * sigue pintando `World` por el dorso.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

export const rigsEnabled = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(globalThis.location?.search ?? '').get('rigs') === '1';

// Solo en dev: con DEV=false Rollup elimina la rama y los GLB no se emiten al build.
const urls: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? import.meta.glob<string>('../../../../assets/*/*-rig.glb', { query: '?url', import: 'default' })
  : {};

const loader = new GLTFLoader();
const cache = new Map<SpeciesId, Promise<RigTemplate>>();

interface RigTemplate {
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
  const entry = Object.entries(urls).find(([p]) => p.endsWith(`/${name}/${name}-rig.glb`));
  if (!entry) throw new Error(`Falta assets/${name}/${name}-rig.glb`);
  const gltf = await loader.loadAsync(await entry[1]());
  stylize(gltf.scene);
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  return { scene: gltf.scene, clips: gltf.animations, height: size.y };
}

export interface RigModel {
  readonly root: THREE.Object3D;
  /** reproduce un clip una vez y vuelve a `reposo` */
  playOnce(clip: 'coger_carta' | 'mirar_izq' | 'mirar_der'): void;
  update(dtSec: number): void;
  dispose(): void;
}

/** Carga (con caché por especie) y devuelve una instancia colocada en el marco local del asiento. */
export async function loadRig(species: SpeciesId): Promise<RigModel> {
  let p = cache.get(species);
  if (!p) {
    p = loadTemplate(species);
    cache.set(species, p);
  }
  const tpl = await p;
  // Cada especie aparece una sola vez en la mesa: se usa el original sin clonar el esqueleto.
  const model = tpl.scene;
  const scale = TABLE_HEIGHT / RIG_TABLE_H;
  model.scale.setScalar(scale);
  if (ON_TABLE.has(species)) model.position.set(0, TABLE_HEIGHT, GAME_TABLE_EDGE + BIRD_PERCH);
  else model.position.set(0, 0, GAME_TABLE_EDGE - RIG_TABLE_EDGE * scale);

  const mixer = new THREE.AnimationMixer(model);
  const action = (n: string): THREE.AnimationAction | undefined => {
    const clip = THREE.AnimationClip.findByName(tpl.clips, n);
    return clip ? mixer.clipAction(clip) : undefined;
  };
  const idle = action('reposo');
  idle?.play();
  let current = idle;
  mixer.addEventListener('finished', () => {
    if (!idle || current === idle) return;
    idle.reset().play();
    current?.crossFadeTo(idle, CROSSFADE_S, false);
    current = idle;
  });

  return {
    root: model,
    playOnce(name) {
      const a = action(name);
      if (!a) return;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      current?.crossFadeTo(a, CROSSFADE_S, false);
      current = a;
    },
    update: (dt) => mixer.update(dt),
    dispose() {
      mixer.stopAllAction();
      model.removeFromParent();
    },
  };
}
