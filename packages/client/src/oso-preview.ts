// Prototipo desechable: oso de Mixamo con su idle sentado y, encima, una
// animación procedural de coger una carta (IK sobre el esqueleto).
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import osoUrl from '../../../assets/oso/oso-sitting-idle.fbx?url';
// Mixamo embebe la textura con una ruta de su servidor que el loader no resuelve;
// se extrajo del FBX a un PNG aparte.
import colorUrl from '../../../assets/oso/oso-color.png?url';
import { orientHand, rotateWorld, setFingerCurl, setWorldQuaternion, solveArm, type ArmChain } from './oso-ik.js';
import {
  CARD_H,
  CARD_T,
  CARD_W,
  TABLE_DEPTH,
  TABLE_NEAR_Z,
  TABLE_THICK,
  TABLE_TOP,
  TABLE_WIDTH,
  grabStateAt,
  type GrabState,
} from './oso-gesture.js';

const colorMap = new THREE.TextureLoader().load(colorUrl);
colorMap.colorSpace = THREE.SRGBColorSpace;

const info = document.getElementById('info')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1620);
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2030, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 4, 3);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
const clock = new THREE.Clock();
let tick: ((dt: number) => void) | null = null;

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? '';

/** Reparto del giro del torso entre Spine, Spine1 y Spine2 (evita una bisagra). */
const SPINE_SHARES = [0.3, 0.35, 0.35] as const;
/** Parte del giro axial de la mano que absorbe el antebrazo. */
const FOREARM_TWIST_SHARE = 0.5;
/** Reparto de la mirada cuello/cabeza y giro máximo de la cabeza (rad). */
const NECK_SHARE = 0.4;
const MAX_GAZE_ANGLE = 0.95;
/** La zarpa izquierda se desliza un poco por el muslo al inclinarse (m por rad). */
const LEFT_SLIDE_PER_LEAN = 0.12;
/** Cámaras de primer plano que siguen a la mano derecha. */
const HAND_CAMS: Record<string, THREE.Vector3> = {
  hand: new THREE.Vector3(-0.2, 0.12, 0.5),
  hand2: new THREE.Vector3(-0.5, -0.02, 0.12),
};
const TABLE_LEG = 0.03;
const TABLE_LEG_INSET = 0.04;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function bone(model: THREE.Object3D, name: string): THREE.Object3D {
  const b = model.getObjectByName(`mixamorig${name}`);
  if (!b) throw new Error(`hueso mixamorig${name} no encontrado`);
  return b;
}

function makeCard(): THREE.Mesh {
  const face = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 });
  const back = new THREE.MeshStandardMaterial({ color: 0x7a2e2a, roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xcfc3ae });
  // Orden de caras de BoxGeometry: +X −X +Y −Y +Z(cara) −Z(dorso).
  return new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T), [edge, edge, edge, edge, face, back]);
}

function makeTable(): THREE.Group {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, TABLE_THICK, TABLE_DEPTH), wood);
  top.position.set(0, TABLE_TOP - TABLE_THICK / 2, TABLE_NEAR_Z + TABLE_DEPTH / 2);
  top.name = 'tableTop';
  table.add(top);
  const legH = TABLE_TOP - TABLE_THICK;
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(TABLE_LEG, legH, TABLE_LEG), wood);
      leg.position.set(
        sx * (TABLE_WIDTH / 2 - TABLE_LEG_INSET),
        legH / 2,
        TABLE_NEAR_Z + TABLE_LEG_INSET + sz * (TABLE_DEPTH - 2 * TABLE_LEG_INSET),
      );
      table.add(leg);
    }
  }
  return table;
}

interface Rig {
  spine: THREE.Object3D[];
  neck: THREE.Object3D;
  head: THREE.Object3D;
  shoulder: THREE.Object3D;
  arm: ArmChain;
  leftArm: ArmChain;
  fingers: THREE.Object3D[];
  /** Eje "hacia delante" de la cabeza en su espacio local, medido en el clip. */
  headFwdLocal: THREE.Vector3;
}

function applyTorso(rig: Rig, g: GrabState): void {
  const total = new THREE.Quaternion()
    .setFromAxisAngle(Y, g.twist)
    .multiply(new THREE.Quaternion().setFromAxisAngle(X, g.lean))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z, g.side));
  const id = new THREE.Quaternion();
  rig.spine.forEach((b, i) => rotateWorld(b, id.clone().slerp(total, SPINE_SHARES[i] ?? 0), 1));
  // Clavícula derecha: +Y la adelanta; −Z eleva el lado −X.
  const clav = new THREE.Quaternion()
    .setFromAxisAngle(Y, g.shoulderFwd)
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -g.shoulderUp));
  rotateWorld(rig.shoulder, clav, g.armW);
}

function applyGaze(rig: Rig, g: GrabState): void {
  if (g.lookW <= 0) return;
  const headPos = rig.head.getWorldPosition(new THREE.Vector3());
  const fwd = rig.headFwdLocal.clone().applyQuaternion(rig.head.getWorldQuaternion(new THREE.Quaternion()));
  const want = g.gaze.clone().sub(headPos).normalize();
  const angle = Math.min(fwd.angleTo(want), MAX_GAZE_ANGLE);
  const axis = new THREE.Vector3().crossVectors(fwd, want);
  if (axis.lengthSq() < 1e-10) return;
  axis.normalize();
  const id = new THREE.Quaternion();
  const full = new THREE.Quaternion().setFromAxisAngle(axis, angle * g.lookW);
  rotateWorld(rig.neck, id.clone().slerp(full, NECK_SHARE), 1);
  rotateWorld(rig.head, id.clone().slerp(full, 1 - NECK_SHARE), 1);
}

interface HandPin {
  wrist: THREE.Vector3;
  rotation: THREE.Quaternion;
  /** Dirección del codo del clip respecto a la línea hombro-muñeca. */
  pole: THREE.Vector3;
}

function captureLeftHand(arm: ArmChain): HandPin {
  const s = arm.upper.getWorldPosition(new THREE.Vector3());
  const e = arm.fore.getWorldPosition(new THREE.Vector3());
  const wrist = arm.hand.getWorldPosition(new THREE.Vector3());
  const dir = wrist.clone().sub(s).normalize();
  const pole = e.sub(s);
  pole.addScaledVector(dir, -pole.dot(dir)).normalize();
  return { wrist, rotation: arm.hand.getWorldQuaternion(new THREE.Quaternion()), pole };
}

/** La izquierda sigue apoyada en el muslo mientras el torso se inclina (movimiento secundario). */
function pinLeftHand(arm: ArmChain, pin: HandPin, lean: number): void {
  const target = pin.wrist.clone().add(new THREE.Vector3(0, 0, Math.max(0, lean) * LEFT_SLIDE_PER_LEAN));
  solveArm(arm, target, pin.pole, 1);
  setWorldQuaternion(arm.hand, pin.rotation, 1);
}

interface Debug {
  model: THREE.Group;
  card: THREE.Mesh;
  table: THREE.Group;
  ratio: number;
  state: GrabState | null;
  /** Aplica la pose del instante `t` (para sondas de colisión). */
  poseAt: (t: number) => void;
}

function setupGrab(model: THREE.Group): (dt: number) => void {
  const mixer = new THREE.AnimationMixer(model);
  const idle = model.animations[0];
  if (idle) mixer.clipAction(idle).play();

  const table = makeTable();
  scene.add(table);
  const card = makeCard();
  scene.add(card);

  mixer.setTime(0);
  model.updateMatrixWorld(true);
  const head = bone(model, 'Head');
  const rig: Rig = {
    spine: ['Spine', 'Spine1', 'Spine2'].map((n) => bone(model, n)),
    neck: bone(model, 'Neck'),
    head,
    shoulder: bone(model, 'RightShoulder'),
    arm: { upper: bone(model, 'RightArm'), fore: bone(model, 'RightForeArm'), hand: bone(model, 'RightHand') },
    leftArm: { upper: bone(model, 'LeftArm'), fore: bone(model, 'LeftForeArm'), hand: bone(model, 'LeftHand') },
    fingers: [1, 2, 3, 4].map((i) => bone(model, `RightHandIndex${i}`)),
    headFwdLocal: Z.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert()),
  };

  // ?t=<segundos> congela la escena en ese instante (capturas deterministas).
  const frozen = Number(params.get('t'));
  let time = frozen > 0 ? frozen : 0;
  const handPos = new THREE.Vector3();
  const handQ = new THREE.Quaternion();

  const debug: Debug = { model, card, table, ratio: 0, state: null, poseAt: (t) => apply(t) };
  if (import.meta.env.DEV) (globalThis as { __osoDebug?: Debug }).__osoDebug = debug;

  // PropertyMixer solo escribe un hueso si el valor muestreado cambió desde el
  // último frame (siempre con ?t= congelado): sin restaurar, la IK se acumularía.
  const ikBones = [
    ...rig.spine, rig.neck, rig.head, rig.shoulder, rig.arm.upper, rig.arm.fore, rig.arm.hand, ...rig.fingers,
    rig.leftArm.upper, rig.leftArm.fore, rig.leftArm.hand,
  ];
  const clipPose = ikBones.map((b) => b.quaternion.clone());

  function apply(time: number): void {
    const g = grabStateAt(time);
    ikBones.forEach((b, i) => b.quaternion.copy(clipPose[i]!));
    // mixer.setTime reaplica la pose del clip; la IK se suma encima.
    mixer.setTime(time);
    ikBones.forEach((b, i) => clipPose[i]!.copy(b.quaternion));
    model.updateMatrixWorld(true);

    const leftPin = captureLeftHand(rig.leftArm);
    applyTorso(rig, g);
    pinLeftHand(rig.leftArm, leftPin, g.lean);
    debug.ratio = solveArm(rig.arm, g.wrist, g.pole, g.armW);
    orientHand(rig.arm, g.handQ, FOREARM_TWIST_SHARE, g.armW);
    setFingerCurl(rig.arm.hand, rig.fingers, [g.fingers.x, g.fingers.y, g.fingers.z], g.fingerW);
    debug.state = g;

    if (g.held) {
      // Pegada al hueso real (no a la clave) para que nunca se separe de la mano.
      rig.arm.hand.getWorldPosition(handPos);
      rig.arm.hand.getWorldQuaternion(handQ);
      card.position.copy(g.grip.position).applyQuaternion(handQ).add(handPos);
      card.quaternion.copy(handQ).multiply(g.grip.quaternion);
    } else {
      card.position.copy(g.card.position);
      card.quaternion.copy(g.card.quaternion);
    }

    applyGaze(rig, g);

    const handCam = HAND_CAMS[view];
    if (handCam) {
      rig.arm.hand.getWorldPosition(handPos);
      camera.position.copy(handPos).add(handCam);
      controls.target.copy(handPos);
      camera.lookAt(handPos);
    }
  }

  return (dt) => {
    if (!(frozen > 0)) time += dt;
    apply(time);
  };
}

new FBXLoader().load(
  osoUrl,
  (model) => {
    scene.add(model);
    if (import.meta.env.DEV) (globalThis as { __oso?: THREE.Group }).__oso = model;
    let tris = 0;
    let bones = 0;
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones++;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      // El FBX llega sin normales: sin ellas la iluminación lo deja negro.
      if (!g.attributes.normal) g.computeVertexNormals();
      mesh.material = new THREE.MeshStandardMaterial({ map: colorMap, roughness: 0.9 });
      tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const offsets: Record<string, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0.15, 2.4),
      side: new THREE.Vector3(-2.4, 0.15, 0),
    };
    const offset = (offsets[view] ?? new THREE.Vector3(1.5, 0.35, 1.9)).multiplyScalar(size.y);
    const focus = center.clone().add(new THREE.Vector3(0, 0, size.z * 0.5));
    camera.position.copy(focus).add(offset);
    controls.target.copy(focus);
    controls.update();

    tick = setupGrab(model);

    info.textContent = [
      `triángulos: ${Math.round(tris)}`,
      `huesos: ${bones}`,
      `clips: ${model.animations.map((c) => `${c.name} (${c.duration.toFixed(2)}s)`).join(', ') || 'ninguno'}`,
    ].join('\n');
  },
  undefined,
  (err) => {
    info.textContent = `error: ${String(err)}`;
    console.error('[oso]', err);
  },
);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  tick?.(clock.getDelta());
  renderer.render(scene, camera);
});
