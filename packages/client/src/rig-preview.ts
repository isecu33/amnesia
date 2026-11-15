// Vista previa aislada de los animales riggeados (assets/<animal>/<animal>-rig.glb).
// Abre /rig-preview.html: galería con los 6 o foco en uno, y selector de animación.
// Parámetros para validar rigs en navegador (tools/rig/rig_browser_shots.mjs):
//   ?animal=oso&clip=coger_carta  foco y animación · ?v=cand  carga assets/<a>/<a>-rig.cand.glb
//   ?t=0.8  congela en ese segundo · ?bones=1  esqueleto · ?view=frente|lado|34  cámara
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ANIMALS = ['oso', 'zorro', 'ciervo', 'serpiente', 'buho', 'cuervo'] as const;
type Animal = (typeof ANIMALS)[number];
const CLIPS = ['reposo', 'coger_carta', 'mirar_izq', 'mirar_der'] as const;
/** Separación entre animales en la galería (m). */
const SPACING = 1.5;
/** Mesa y asiento (m): el rig sienta a oso, zorro y ciervo con el asiento a SEAT_H. */
const TABLE_H = 0.44;
const TABLE_DEPTH = 0.9;
/** Distancia del borde de la mesa y de la carta (centro) al cuerpo del personaje; coincide con rig_animal.py. */
const TABLE_EDGE = 0.24;
const CARD_FWD = 0.46;
const CARD_X = -0.1;
const SEAT_H = 0.26;
/** Las aves se posan sobre la mesa; el resto se sienta a ella. */
const ON_TABLE: ReadonlySet<Animal> = new Set<Animal>(['buho', 'cuervo']);
const NEEDS_STOOL: ReadonlySet<Animal> = new Set<Animal>(['oso', 'zorro', 'ciervo']);

const urls = import.meta.glob<string>('../../../assets/*/*-rig*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});
const variant = new URLSearchParams(location.search).get('v');
const urlOf = (a: Animal): string => {
  const file = variant ? `${a}-rig.${variant}.glb` : `${a}-rig.glb`;
  const hit = Object.entries(urls).find(([path]) => path.endsWith(`/${file}`));
  if (!hit) throw new Error(`Falta assets/${a}/${file}`);
  return hit[1];
};

interface Entry {
  readonly animal: Animal;
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: ReadonlyMap<string, THREE.AnimationAction>;
  readonly skeleton: THREE.SkeletonHelper;
  readonly height: number;
  /** Mesa, taburete y carta de este animal (se mueve con él en la galería). */
  readonly props: THREE.Group;
}

const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
const cardMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.6 });

function makeProps(animal: Animal): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(SPACING * 0.95, 0.04, TABLE_DEPTH), wood);
  top.position.set(0, TABLE_H - 0.02, TABLE_EDGE + TABLE_DEPTH / 2);
  g.add(top);
  for (const lx of [-1, 1]) {
    for (const lz of [TABLE_EDGE + 0.05, TABLE_EDGE + TABLE_DEPTH - 0.05]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE_H, 0.05), wood);
      leg.position.set(lx * (SPACING * 0.95 / 2 - 0.05), TABLE_H / 2 - 0.02, lz);
      g.add(leg);
    }
  }
  if (NEEDS_STOOL.has(animal)) {
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.42, SEAT_H, 0.42), wood);
    stool.position.set(0, SEAT_H / 2 - 0.02, 0);
    g.add(stool);
  }
  // Carta boca arriba delante de la mano derecha del personaje (-X en su espacio; en pantalla, a la izquierda).
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.13), cardMat);
  card.name = 'card';
  card.position.set(CARD_X, TABLE_H + 0.003, ON_TABLE.has(animal) ? TABLE_EDGE + TABLE_DEPTH / 2 + 0.2 : CARD_FWD);
  g.add(card);
  return g;
}

const info = document.getElementById('info')!;
const ui = document.getElementById('ui')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1620);
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a3f57, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a2233 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
const clock = new THREE.Clock();

const entries: Entry[] = [];
const query = new URLSearchParams(location.search);
const queryAnimal = ANIMALS.find((a) => a === query.get('animal'));
const queryClip = CLIPS.find((c) => c === query.get('clip'));
let focus: Animal | 'todos' = queryAnimal ?? 'todos';
let clip: string = queryClip ?? 'coger_carta';
let showBones = query.get('bones') === '1';
let loop = true;
/** Instante fijo (s) para capturas deterministas; null = reproducción normal. */
const fixedT = query.has('t') ? Number(query.get('t')) : null;
const VIEWS: Record<string, readonly [number, number]> = { frente: [0, 1], lado: [1, 0], '34': [0.7, 0.7] };
const view = VIEWS[query.get('view') ?? ''];

function frame(): void {
  const shown = entries.filter((e) => focus === 'todos' || e.animal === focus);
  const n = shown.length;
  for (const e of entries) {
    const i = shown.indexOf(e);
    const x = (i - (n - 1) / 2) * (n > 1 ? SPACING : 0);
    e.root.visible = i >= 0;
    e.props.visible = i >= 0;
    e.skeleton.visible = i >= 0 && showBones;
    e.props.position.x = x;
    e.root.position.set(x, ON_TABLE.has(e.animal) ? TABLE_H : 0, ON_TABLE.has(e.animal) ? TABLE_EDGE + TABLE_DEPTH / 2 : 0);
  }
  const width = n > 1 ? n * SPACING : 1.6;
  const dist = Math.max(width / (2 * Math.tan((camera.fov * camera.aspect * Math.PI) / 360)), 2.2);
  camera.position.set(0, 0.75, dist * 1.15);
  controls.target.set(0, 0.5, 0);
  const only = shown[0];
  if (view && n === 1 && only) {
    // Cámara fija alrededor del animal (las aves están sobre la mesa, no en el origen).
    const c = new THREE.Box3().setFromObject(only.root).getCenter(new THREE.Vector3());
    const r = Math.max(only.height * 2.4, 1.2);
    camera.position.set(c.x + view[0] * r, c.y + only.height * 0.25, c.z + view[1] * r);
    controls.target.copy(c);
  }
  controls.update();
}

function play(): void {
  for (const e of entries) {
    for (const [name, a] of e.actions) {
      if (name === clip) {
        a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = true;
        a.play();
        if (fixedT !== null) {
          a.time = fixedT;
          a.paused = true;
        }
      } else {
        a.stop();
      }
    }
  }
}

function button(label: string, on: () => void, active: () => boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    on();
    refresh();
  };
  b.dataset.active = '';
  buttons.push([b, active]);
  return b;
}
const buttons: Array<[HTMLButtonElement, () => boolean]> = [];
function refresh(): void {
  for (const [b, active] of buttons) b.classList.toggle('on', active());
}
function group(...items: HTMLElement[]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';
  g.append(...items);
  ui.append(g);
  return g;
}

group(
  button('todos', () => ((focus = 'todos'), frame()), () => focus === 'todos'),
  ...ANIMALS.map((a) =>
    button(a, () => ((focus = a), frame()), () => focus === a),
  ),
);
group(
  ...CLIPS.map((c) =>
    button(c, () => ((clip = c), play()), () => clip === c),
  ),
);
group(
  button('esqueleto', () => ((showBones = !showBones), frame()), () => showBones),
  button('bucle', () => ((loop = !loop), play()), () => loop),
  button('reiniciar', play, () => false),
);
refresh();

const loader = new GLTFLoader();
async function load(animal: Animal): Promise<void> {
  const gltf = await loader.loadAsync(urlOf(animal));
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)] as const));
  const skeleton = new THREE.SkeletonHelper(root);
  skeleton.visible = false;
  const props = makeProps(animal);
  scene.add(root, skeleton, props);
  entries.push({ animal, root, mixer, actions, skeleton, height: box.max.y - box.min.y, props });
  frame();
  play();
  info.textContent = `cargados ${entries.length}/${ANIMALS.length}`;
}

Promise.all((queryAnimal ? [queryAnimal] : ANIMALS).map(load))
  .then(() => {
    document.body.dataset.ready = '1';
    info.textContent = entries
      .map((e) => `${e.animal}: ${[...e.actions.keys()].join(', ')}`)
      .join('\n');
  })
  .catch((err: unknown) => {
    info.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
  });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame();
});

/** Fotogramas (30 fps) entre los que la mano lleva la carta en coger_carta: agarre → soltar
 *  (claves 22 y 92 de rig_animal.py + 2 de retraso del brazo respecto a la mirada). */
const CARRY_FROM = 24 / 30;
const CARRY_TO = 94 / 30;
const handPos = new THREE.Vector3();

/** La carta viaja con la mano mientras dura el agarre; el resto del tiempo está sobre la mesa. */
function carryCard(e: Entry): void {
  const card = e.props.getObjectByName('card');
  const hand = e.root.getObjectByName('manoD') ?? e.root.getObjectByName('mano.D');
  const action = e.actions.get('coger_carta');
  if (!card || !hand || !action) return;
  const t = action.time;
  const carrying = clip === 'coger_carta' && t > CARRY_FROM && t < CARRY_TO;
  if (!carrying) {
    card.position.set(CARD_X, TABLE_H + 0.003, ON_TABLE.has(e.animal) ? TABLE_EDGE + TABLE_DEPTH / 2 + 0.2 : CARD_FWD);
    card.rotation.set(0, 0, 0);
    return;
  }
  hand.getWorldPosition(handPos);
  card.position.copy(e.props.worldToLocal(handPos)).add(new THREE.Vector3(0, 0.03, 0.04));
  card.rotation.set(card.position.y > TABLE_H + 0.1 ? Math.PI / 2 : 0, 0, 0);
}

renderer.setAnimationLoop(() => {
  const dt = fixedT === null ? clock.getDelta() : 0;
  for (const e of entries) {
    e.mixer.update(dt);
    carryCard(e);
  }
  renderer.render(scene, camera);
});
