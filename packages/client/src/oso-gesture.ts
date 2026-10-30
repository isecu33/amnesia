// Gesto procedural "coger carta, mirarla, dejarla" del oso (oso-preview), como
// función pura del tiempo. Todo en espacio mundo: el oso está quieto en el
// origen, mira a +Z y su derecha es −X. Las medidas salen del clip idle de Mixamo.
import * as THREE from 'three';
import { QuatTrack, ScalarTrack, VecTrack, handBasis, type Key } from './oso-curves.js';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// ── Mesa y carta ─────────────────────────────────────────────────────────────
export const TABLE_TOP = 0.48;
export const TABLE_THICK = 0.035;
/** Canto delantero (lado del oso): justo delante de la barriga, sobre muslos y manos. */
export const TABLE_NEAR_Z = 0.27;
export const TABLE_DEPTH = 0.42;
export const TABLE_WIDTH = 0.9;
export const CARD_W = 0.1;
export const CARD_H = 0.14;
export const CARD_T = 0.004;

// ── Agarre: la carta en el espacio local del hueso RightHand ────────────────
// Ejes de la mano medidos en la malla: +Y hacia los dedos, +Z normal de la
// palma, +X lado radial. La palma es irregular: el talón radial y la muñeca
// bajan hasta z≈0.057, así que la carta se apoya en ese plano y no en el centro. Los dedos flexionan
// girando sobre X. La carta (boca abajo en la mesa) va con el dorso contra la
// palma, su lado largo a lo ancho de la mano y asomando por el lado cubital,
// y su borde lejano queda antes de los nudillos para que la manopla lo abrace.
const PALM_SURFACE = 0.054;
const GRIP_POS = v(-0.055, 0.035, PALM_SURFACE + CARD_T / 2);
/**
 * Con la manopla cerrada la base de los dedos se abulta y las puntas vuelven
 * hacia la palma: la carta se asienta un poco más lejos y hacia la muñeca, con
 * su borde lejano justo bajo las puntas, que lo abrazan.
 */
const GRIP_CLOSED = v(-0.055, 0, 0.068 + CARD_T / 2);
/** Cara de la carta (+Z) = normal de la palma; lado largo (+Y) = +X de la mano. */
const GRIP_Q = new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), -90 * DEG);

const CARD_REST_CENTER = v(-0.15, TABLE_TOP + CARD_T / 2, 0.45);
const CARD_YAW = 0.3;
const FWD_IN = v(Math.sin(CARD_YAW), 0, Math.cos(CARD_YAW));
const DOWN = v(0, -1, 0);

/** Muñeca (origen del hueso Hand) tal que la carta quede en `center` con la mano en `q`. */
function wristFor(center: THREE.Vector3, q: THREE.Quaternion, grip = GRIP_POS): THREE.Vector3 {
  return center.clone().sub(grip.clone().applyQuaternion(q));
}

// ── Poses clave de la mano ───────────────────────────────────────────────────
/** Pose del clip idle (mano en el muslo), medida en t≈0.3. */
const REST_WRIST = v(-0.163, 0.35, 0.306);
const Q_REST = handBasis(v(0.292, -0.457, 0.84), v(0.426, -0.725, -0.542));
/** Despega la zarpa del muslo destensando los dedos antes de retroceder (si no, las puntas lo atraviesan). */
const UNHOOK_WRIST = v(-0.172, 0.38, 0.3);
const Q_UNHOOK = handBasis(v(0.3, -0.2, 0.93), v(0.3, -0.95, -0.1));
/** Retrocede pegada al muslo para salir de debajo del canto de la mesa. */
const PULL_WRIST = v(-0.215, 0.43, 0.205);
const Q_PULL = handBasis(v(-0.05, -0.45, 0.89), v(0.25, -0.85, -0.4));
/** Sube por delante de la barriga con los dedos colgando, sin rozar el canto. */
const RISE_WRIST = v(-0.235, 0.5, 0.165);
const Q_RISE = handBasis(v(-0.1, -0.92, 0.36), v(0.3, -0.4, -0.88));
/** Ya por encima del canto empieza a llevar los dedos hacia delante. */
const CREST_WRIST = v(-0.24, 0.635, 0.178);
const Q_CREST = handBasis(v(0.18, -0.55, 0.82), v(0.15, -0.82, -0.55));
/** Por encima del canto, mano relajada. */
const OVER_WRIST = v(-0.22, 0.64, 0.25);
const Q_OVER = handBasis(v(0.25, 0, 0.97), v(0, -1, 0));
const Q_GRAB = handBasis(FWD_IN, DOWN);
const GRAB_WRIST = wristFor(CARD_REST_CENTER, Q_GRAB);
/** Al aproximarse la muñeca va algo extendida (dedos levantados). */
const Q_HOVER = handBasis(v(FWD_IN.x, 0.28, FWD_IN.z), v(0, -1, 0.28));
const Q_RELEASE = handBasis(v(FWD_IN.x, 0.2, FWD_IN.z), v(0.05, -1, 0.2));

// Lectura: zarpa en supinación (palma arriba) a la altura del pecho, a su
// derecha, con la carta apoyada en ella y de cara a los ojos. Así ni la zarpa
// ni el antebrazo tapan la cara, el codo cae junto al costado y la carta queda
// lejos del hocico (brazos cortos + hocico largo no dejan subirla a la cara).
/** Punto medio entre los ojos, estimado de la malla (el hocico llega a z≈0.34). */
const EYES = v(0.01, 0.79, 0.26);
const LOOK_CENTER = v(-0.165, 0.59, 0.372);
const LOOK_PALM = EYES.clone().sub(LOOK_CENTER).normalize();
const LOOK_RADIAL = v(-1, 0, 0).addScaledVector(LOOK_PALM, LOOK_PALM.x).normalize();
const Q_LOOK = handBasis(new THREE.Vector3().crossVectors(LOOK_PALM, LOOK_RADIAL), LOOK_PALM);
const LOOK_WRIST = wristFor(LOOK_CENTER, Q_LOOK, GRIP_CLOSED);
/** Mientras la lee la ladea un poco (giro sobre la normal de la palma). */
const Q_READ = new THREE.Quaternion().setFromAxisAngle(LOOK_PALM, -10 * DEG).multiply(Q_LOOK);
/**
 * Mitad de la supinación: palma hacia dentro y pulgar arriba. Fuerza a que el
 * giro vaya por el lado anatómico y no por el camino corto del slerp.
 */
const Q_TURN = handBasis(v(0.12, 0.3, 0.95), v(0.95, 0.25, -0.12));
const TURN_WRIST = v(-0.24, 0.57, 0.395);
/** Paso adelantado y por fuera para que la carta rodee el mentón al subir y bajar. */
const ARC_WRIST = v(-0.18, 0.6, 0.425);

const up = (p: THREE.Vector3, dy: number, dz = 0, dx = 0): THREE.Vector3 =>
  p.clone().add(v(dx, dy, dz));

// ── Línea de tiempo (s) ──────────────────────────────────────────────────────
export const T_GRAB = 2.18;
export const T_RELEASE = 5.66;
export const CYCLE = 8.4;

const WRIST: Key<THREE.Vector3>[] = [
  [0.55, REST_WRIST],
  [0.78, UNHOOK_WRIST],
  [0.98, PULL_WRIST],
  [1.18, RISE_WRIST],
  [1.38, CREST_WRIST],
  [1.58, OVER_WRIST],
  [1.84, up(GRAB_WRIST, 0.07, -0.035, -0.01)],
  [2.0, up(GRAB_WRIST, 0.012, -0.004)],
  [2.09, GRAB_WRIST],
  [T_GRAB, GRAB_WRIST],
  [2.4, up(GRAB_WRIST, 0.04, -0.012)],
  [2.62, ARC_WRIST],
  [2.92, TURN_WRIST],
  [3.22, up(LOOK_WRIST, 0.012, -0.004)],
  [3.48, LOOK_WRIST],
  [4.2, up(LOOK_WRIST, -0.006, 0.004, 0.004)],
  [4.45, up(LOOK_WRIST, 0.004, 0.006)],
  [4.9, up(TURN_WRIST, -0.005, 0.01)],
  [5.12, ARC_WRIST],
  [5.3, up(GRAB_WRIST, 0.06, 0.02)],
  [5.48, up(GRAB_WRIST, 0.008, -0.002)],
  [5.58, GRAB_WRIST],
  [T_RELEASE + 0.08, GRAB_WRIST],
  [5.96, up(GRAB_WRIST, 0.045, -0.035, -0.01)],
  [6.26, OVER_WRIST],
  [6.45, CREST_WRIST],
  [6.64, RISE_WRIST],
  [6.84, PULL_WRIST],
  [7.06, UNHOOK_WRIST],
  [7.32, REST_WRIST],
];

const HAND_Q: Key<THREE.Quaternion>[] = [
  [0.55, Q_REST],
  [0.78, Q_UNHOOK],
  [0.98, Q_PULL],
  [1.18, Q_RISE],
  [1.38, Q_CREST],
  [1.58, Q_OVER],
  [1.84, Q_HOVER],
  [2.05, Q_GRAB],
  [T_GRAB, Q_GRAB],
  [2.4, Q_GRAB],
  [2.95, Q_TURN],
  [3.42, Q_LOOK],
  [4.2, Q_READ],
  [4.45, Q_LOOK],
  [4.92, Q_TURN],
  [5.47, Q_GRAB],
  [T_RELEASE + 0.08, Q_GRAB],
  [5.96, Q_RELEASE],
  [6.26, Q_OVER],
  [6.45, Q_CREST],
  [6.64, Q_RISE],
  [6.84, Q_PULL],
  [7.06, Q_UNHOOK],
  [7.32, Q_REST],
];

const ARM_W: Key<number>[] = [
  [0.45, 0],
  [0.7, 1],
  [7.2, 1],
  [7.45, 0],
];

// Dedos: ángulo absoluto (grados) de cada falange respecto a +Y de la mano,
// flexionando hacia la palma. El clip los trae ≈ [50, 87, 103]. Cierre y
// apertura repartidos en tramos largos (≤ 6 rad/s en mundo).
const F_RELAX = v(35, 60, 70);
const F_OPEN_WIDE = v(-12, -6, 0);
const F_FLAT = v(-2, 0, 3);
const F_CARRY = v(18, 30, 36);
const F_GRIP = v(62, 105, 118);
const F_LOOSE = v(38, 62, 72);
const FINGERS: Key<THREE.Vector3>[] = [
  [0.55, F_RELAX],
  [1.0, F_CARRY],
  [1.6, F_CARRY],
  [1.88, F_OPEN_WIDE],
  [2.07, F_FLAT],
  [T_GRAB, F_FLAT],
  [2.45, v(22, 38, 44)],
  [2.9, F_GRIP],
  [4.7, F_GRIP],
  [5.15, F_LOOSE],
  [5.5, F_FLAT],
  [T_RELEASE + 0.04, F_FLAT],
  [6.0, F_OPEN_WIDE],
  [6.35, F_CARRY],
  [6.72, F_RELAX],
  [7.06, F_CARRY],
  [7.35, F_RELAX],
];
const FINGER_W: Key<number>[] = [
  [0.5, 0],
  [0.7, 1],
  [7.2, 1],
  [7.5, 0],
];

// Torso (rad): inclinación hacia delante (+), giro hacia su derecha (−Y) y
// lateral hacia la derecha (+Z). Pequeña anticipación hacia atrás antes de ir;
// al leer se endereza para que el hocico no se eche encima de la carta.
const LEAN: Key<number>[] = [
  [0.4, 0],
  [0.75, -0.025],
  [1.6, 0.1],
  [2.09, 0.13],
  [T_GRAB, 0.13],
  [2.4, 0.04],
  [2.9, 0],
  [3.4, -0.035],
  [4.45, -0.03],
  [5.15, 0],
  [5.5, 0.12],
  [5.6, 0.13],
  [6.1, 0.07],
  [7.2, 0],
];
const TWIST: Key<number>[] = [
  [0.6, 0],
  [1.7, -0.1],
  [T_GRAB, -0.1],
  [3.4, -0.09],
  [4.45, -0.09],
  [5.6, -0.1],
  [7.1, 0],
];
const SIDE: Key<number>[] = [
  [0.6, 0],
  [1.8, 0.04],
  [T_GRAB, 0.04],
  [3.4, 0.02],
  [5.6, 0.04],
  [7.1, 0],
];
/** Clavícula: adelanto (rad, sobre Y) y elevación (rad) del hombro derecho. */
const SHOULDER_FWD: Key<number>[] = [
  [0.7, 0],
  [1.7, 0.16],
  [T_GRAB, 0.18],
  [3.4, 0.06],
  [4.45, 0.06],
  [5.6, 0.18],
  [7.1, 0],
];
const SHOULDER_UP: Key<number>[] = [
  [0.7, 0],
  [1.5, 0.02],
  [T_GRAB, -0.03],
  [3.4, -0.02],
  [4.45, -0.02],
  [5.6, -0.03],
  [7.1, 0],
];

/**
 * Polo del codo: fuera y algo atrás sobre la mesa (el brazo va casi extendido
 * y así todo él queda por encima del tablero); abajo y atrás, junto al
 * costado, al leer.
 */
const POLE_REST = v(-0.7, -0.4, -0.6);
const POLE_TABLE = v(-0.95, -0.04, -0.35);
const POLE_LOOK = v(-0.7, -0.45, -0.55);
const POLE: Key<THREE.Vector3>[] = [
  [0.7, POLE_REST],
  [1.5, POLE_TABLE],
  [2.4, POLE_TABLE],
  [3.25, POLE_LOOK],
  [4.45, POLE_LOOK],
  [5.25, POLE_TABLE],
  [6.1, POLE_TABLE],
  [6.82, POLE_REST],
];

/** Peso de la mirada: la cabeza busca la carta antes de que llegue la mano. */
const LOOK_W: Key<number>[] = [
  [0.35, 0],
  [1.2, 0.45],
  [T_GRAB, 0.5],
  [3.3, 0.56],
  [4.45, 0.56],
  [5.2, 0.38],
  [5.6, 0.55],
  [6.3, 0.3],
  [7.4, 0],
];
/** Retraso con el que la cabeza sigue a la carta en el aire. */
const HEAD_LAG = 0.14;

/** Posición de la carta en la mano a lo largo del agarre (se asienta al cerrar). */
const GRIP: Key<THREE.Vector3>[] = [
  [T_GRAB, GRIP_POS],
  [2.8, GRIP_CLOSED],
  [4.75, GRIP_CLOSED],
  [5.45, GRIP_POS],
];

const tracks = {
  grip: new VecTrack(GRIP),
  wrist: new VecTrack(WRIST),
  handQ: new QuatTrack(HAND_Q),
  armW: new ScalarTrack(ARM_W),
  fingers: new VecTrack(FINGERS),
  fingerW: new ScalarTrack(FINGER_W),
  lean: new ScalarTrack(LEAN),
  twist: new ScalarTrack(TWIST),
  side: new ScalarTrack(SIDE),
  shoulderFwd: new ScalarTrack(SHOULDER_FWD),
  shoulderUp: new ScalarTrack(SHOULDER_UP),
  pole: new VecTrack(POLE),
  lookW: new ScalarTrack(LOOK_W),
};

export interface CardPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface GrabState {
  /** Objetivo de la muñeca (origen del hueso RightHand). */
  wrist: THREE.Vector3;
  /** Orientación objetivo del hueso RightHand en mundo. */
  handQ: THREE.Quaternion;
  armW: number;
  /** Ángulos (rad) de Index1..3 respecto a la mano y peso sobre el clip. */
  fingers: THREE.Vector3;
  fingerW: number;
  lean: number;
  twist: number;
  side: number;
  shoulderFwd: number;
  shoulderUp: number;
  pole: THREE.Vector3;
  /** true mientras la carta va pegada a la mano. */
  held: boolean;
  /** Pose de la carta según las claves (la escena la pega al hueso real). */
  card: CardPose;
  /** Transformación hueso Hand → carta en este instante. */
  grip: CardPose;
  gaze: THREE.Vector3;
  lookW: number;
}

function gripAt(u: number): CardPose {
  return { position: tracks.grip.at(u), quaternion: GRIP_Q.clone() };
}

const wrap = (t: number): number => ((t % CYCLE) + CYCLE) % CYCLE;
const isHeld = (u: number): boolean => u >= T_GRAB && u < T_RELEASE;

function cardPoseAt(u: number): CardPose {
  if (!isHeld(u)) {
    return { position: CARD_REST_CENTER.clone(), quaternion: Q_GRAB.clone().multiply(GRIP_Q) };
  }
  const q = tracks.handQ.at(u);
  const grip = gripAt(u);
  return {
    position: tracks.wrist.at(u).add(grip.position.applyQuaternion(q)),
    quaternion: q.multiply(grip.quaternion),
  };
}

/** Estado del gesto en el instante `t` (puro: misma t, misma pose). */
export function grabStateAt(t: number): GrabState {
  const u = wrap(t);
  const f = tracks.fingers.at(u).multiplyScalar(DEG);
  return {
    wrist: tracks.wrist.at(u),
    handQ: tracks.handQ.at(u),
    armW: tracks.armW.at(u),
    fingers: f,
    fingerW: tracks.fingerW.at(u),
    lean: tracks.lean.at(u),
    twist: tracks.twist.at(u),
    side: tracks.side.at(u),
    shoulderFwd: tracks.shoulderFwd.at(u),
    shoulderUp: tracks.shoulderUp.at(u),
    pole: tracks.pole.at(u).normalize(),
    held: isHeld(u),
    card: cardPoseAt(u),
    grip: gripAt(u),
    gaze: cardPoseAt(Math.max(0, u - HEAD_LAG)).position,
    lookW: tracks.lookW.at(u),
  };
}
