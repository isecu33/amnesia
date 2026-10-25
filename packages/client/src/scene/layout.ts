/**
 * GeometrÃ­a de la mesa â€” docs/01 Â§11 (revisado en D-042) y docs/02 Â§5.3.
 * MatemÃ¡tica pura y testeable: sin Three.js.
 *
 * ConvenciÃ³n: tu asiento estÃ¡ en -Z mirando a +Z, asÃ­ que la IZQUIERDA de la
 * pantalla es +X. Los rivales se reparten en herradura (Ï† âˆˆ [100Â°, 260Â°]); Ï† crece
 * de izquierda a derecha en pantalla.
 *
 * Requisito duro: TUS slots (huecos incluidos, E21) siempre visibles, en fila en
 * la parte inferior y en el mismo orden que la barra 2D, en las dos poses.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const TABLE_HEIGHT = 0.75;
export const MAX_SLOTS = 8;
/** Radio de la mesa para 2â€“4 jugadores y para 5â€“6 (la mesa crece). */
export const TABLE_RADIUS = 1.05;
export const TABLE_RADIUS_LARGE = 1.25;
/** Distancia del centro de la mesa al personaje sentado, por encima del radio. */
export const SEAT_BEYOND_EDGE = 0.3;
/** Tu ojo queda un poco por detrÃ¡s del borde de la mesa. */
export const EYE_BEYOND_EDGE = 0.1;
export const EYE_HEIGHT = 0.45;
/** SeparaciÃ³n entre centros de tÃ³tems (ancho 0,08 + hueco 0,015). */
export const SLOT_PITCH = 0.095;
/** Tu fila es un arco alrededor del ojo; la de un rival, alrededor de su asiento. */
export const OWN_ROW_RADIUS = 0.62;
export const RIVAL_ROW_RADIUS = 0.5;

/** Medidas de la marioneta (docs/01 Â§11): las comparten layout y personajes. */
export const RIG = {
  headHeight: 0.5,
  shoulderHeight: 0.28,
  shoulderHalfWidth: 0.19,
  upperArm: 0.27,
  foreArm: 0.25,
  hand: 0.06,
  /** lo que aÃ±ade inclinar el torso hacia la mesa al estirarse */
  leanReach: 0.2,
  plateAbove: 0.33,
} as const;

/** Ãngulos de los rivales en grados (tabla de docs/01 Â§11). */
const RIVAL_DEGREES: Record<number, number[]> = {
  2: [180],
  3: [125, 235],
  4: [110, 180, 250],
  5: [100, 153.33, 206.67, 260],
  6: [100, 140, 180, 220, 260],
};

const rad = (d: number): number => (d * Math.PI) / 180;
const clampPlayers = (n: number): number => Math.max(2, Math.min(6, Math.round(n)));

export function tableRadius(players: number): number {
  return clampPlayers(players) >= 5 ? TABLE_RADIUS_LARGE : TABLE_RADIUS;
}

/** Con la mesa grande te echas atrás para que los rivales de los extremos quepan. */
export function eyeBeyondEdge(players: number): number {
  return clampPlayers(players) >= 5 ? EYE_BEYOND_EDGE + 0.14 : EYE_BEYOND_EDGE;
}

export function seatDistance(players: number): number {
  return tableRadius(players) + SEAT_BEYOND_EDGE;
}

/** Ãngulos (rad) de los asientos 1..N-1. */
export function rivalAngles(players: number): number[] {
  return (RIVAL_DEGREES[clampPlayers(players)] ?? []).map(rad);
}

/** Asiento 0 = tÃº (Ã¡ngulo 0). */
export function seatAngle(index: number, total: number): number {
  if (index <= 0) return 0;
  const angles = rivalAngles(total);
  return angles[Math.min(index - 1, angles.length - 1)] ?? Math.PI;
}

/** Gira (x, z) del marco de tu asiento al marco del asiento con Ã¡ngulo `a`. */
function rotate(a: number, x: number, z: number): { x: number; z: number } {
  return { x: x * Math.cos(a) - z * Math.sin(a), z: x * Math.sin(a) + z * Math.cos(a) };
}

/** Punto en el marco Â«local de asientoÂ»: +X a SU izquierda, +Z hacia el centro. */
function fromSeatFrame(a: number, dist: number, lx: number, y: number, lz: number): Vec3 {
  const p = rotate(a, lx, -dist + lz);
  return { x: p.x, y, z: p.z };
}

export function seatPosition(index: number, total: number, distance?: number): Vec3 {
  const a = seatAngle(index, total);
  const d = distance ?? seatDistance(total);
  return { x: Math.sin(a) * d, y: TABLE_HEIGHT, z: -Math.cos(a) * d };
}

/**
 * Posiciones de los slots de un jugador, de izquierda a derecha desde SU punto de
 * vista. `count` es la longitud del array de slots (huecos incluidos, E21).
 */
export function slotPositions(
  count: number,
  seatIndex: number,
  totalSeats: number,
  opts: { own?: boolean } = {},
): Vec3[] {
  const own = opts.own ?? seatIndex === 0;
  const n = Math.max(1, count);
  const a = seatAngle(own ? 0 : seatIndex, totalSeats);
  const pivot = own
    ? tableRadius(totalSeats) + eyeBeyondEdge(totalSeats)
    : seatDistance(totalSeats);
  const radius = own ? OWN_ROW_RADIUS : RIVAL_ROW_RADIUS;
  const step = 2 * Math.asin(SLOT_PITCH / 2 / radius);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i - (n - 1) / 2) * step;
    out.push(
      fromSeatFrame(a, pivot, -Math.sin(th) * radius, TABLE_HEIGHT + 0.01, Math.cos(th) * radius),
    );
  }
  return out;
}

export const DECK_POSITION: Vec3 = { x: 0.14, y: TABLE_HEIGHT + 0.02, z: 0.02 };
export const DISCARD_POSITION: Vec3 = { x: -0.14, y: TABLE_HEIGHT + 0.02, z: 0.02 };
/** Campana de ÃšLTIMA a tu derecha (-X) y vela delante a tu izquierda. */
export const BELL_POSITION: Vec3 = { x: -0.56, y: TABLE_HEIGHT + 0.05, z: -0.3 };
export const CANDLE_POSITION: Vec3 = { x: 0.58, y: TABLE_HEIGHT + 0.05, z: -0.28 };

// --- personajes --------------------------------------------------------------

export interface CharacterAnchors {
  /** centro del cuerpo a la altura de la mesa */
  seat: Vec3;
  /** giro en Y: el +Z local del personaje apunta al centro */
  facing: number;
  head: Vec3;
  shoulderL: Vec3;
  shoulderR: Vec3;
  handRestL: Vec3;
  handRestR: Vec3;
  /** placa de nombre sobre la cabeza */
  plate: Vec3;
  /** vela-reloj delante de Ã©l */
  candle: Vec3;
  /** alcance mÃ¡ximo de la mano contando con inclinar el torso */
  armLength: number;
}

export function characterAnchors(seatIndex: number, total: number): CharacterAnchors {
  const a = seatAngle(seatIndex, total);
  const d = seatDistance(total);
  const at = (lx: number, y: number, lz: number): Vec3 => fromSeatFrame(a, d, lx, y, lz);
  // Su derecha es -X local (mira hacia +Z).
  return {
    seat: at(0, TABLE_HEIGHT, 0),
    facing: -a,
    head: at(0, TABLE_HEIGHT + RIG.headHeight, 0),
    shoulderL: at(RIG.shoulderHalfWidth, TABLE_HEIGHT + RIG.shoulderHeight, 0.04),
    shoulderR: at(-RIG.shoulderHalfWidth, TABLE_HEIGHT + RIG.shoulderHeight, 0.04),
    handRestL: at(0.17, TABLE_HEIGHT + 0.025, SEAT_BEYOND_EDGE + 0.1),
    handRestR: at(-0.17, TABLE_HEIGHT + 0.025, SEAT_BEYOND_EDGE + 0.1),
    plate: at(0, TABLE_HEIGHT + RIG.headHeight + RIG.plateAbove, 0),
    candle: at(0.3, TABLE_HEIGHT + 0.02, SEAT_BEYOND_EDGE + 0.12),
    armLength: RIG.upperArm + RIG.foreArm + RIG.hand + RIG.leanReach,
  };
}

// --- cÃ¡mara ------------------------------------------------------------------

export type CameraPoseId = 'table' | 'totems';

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  /** FOV vertical en grados para 16:9; ver `fovForAspect` */
  fov: number;
}

export const BASE_FOV = 55;
/** FOV horizontal mÃ­nimo que se conserva en pantallas estrechas. */
export const MIN_HORIZONTAL_FOV = 80;
/** Giro lateral mÃ¡ximo de la cabeza (docs/01 Â§11). */
export const MAX_YAW = rad(30);

const POSE_SHAPE: Record<CameraPoseId, { forward: number; height: number; pitch: number }> = {
  // Ojo en el borde de la mesa, mirando a la mesa entera.
  table: { forward: 0, height: EYE_HEIGHT, pitch: rad(21) },
  // Â«Mirar abajoÂ»: te inclinas sobre tu fila.
  totems: { forward: 0.26, height: EYE_HEIGHT + 0.05, pitch: rad(46) },
};

export function cameraPose(id: CameraPoseId, players: number): CameraPose {
  const s = POSE_SHAPE[id];
  const z = -(tableRadius(players) + eyeBeyondEdge(players)) + s.forward;
  const position = { x: 0, y: TABLE_HEIGHT + s.height, z };
  return {
    position,
    lookAt: { x: 0, y: position.y - Math.sin(s.pitch), z: z + Math.cos(s.pitch) },
    fov: BASE_FOV,
  };
}

/** Abre el FOV vertical si la pantalla es tan estrecha que el horizontal cae de 80Â°. */
export function fovForAspect(baseFov: number, aspect: number): number {
  const half = (baseFov * Math.PI) / 360;
  const hfov = 2 * Math.atan(Math.tan(half) * aspect);
  if (hfov >= rad(MIN_HORIZONTAL_FOV) - 1e-9) return baseFov;
  const v = 2 * Math.atan(Math.tan(rad(MIN_HORIZONTAL_FOV) / 2) / aspect);
  return (v * 180) / Math.PI;
}

/**
 * ProyecciÃ³n perspectiva de un punto a coordenadas normalizadas (-1..1), igual que
 * harÃ­a `PerspectiveCamera` con `lookAt`. `z` es la profundidad (> 0 delante).
 * `yaw` gira la mirada alrededor del eje vertical (positivo = hacia la izquierda).
 */
export function projectToNdc(pose: CameraPose, aspect: number, p: Vec3, yaw = 0): Vec3 {
  const e = pose.position;
  let fx = pose.lookAt.x - e.x;
  const fy = pose.lookAt.y - e.y;
  let fz = pose.lookAt.z - e.z;
  if (yaw !== 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    [fx, fz] = [fx * c + fz * s, -fx * s + fz * c];
  }
  const fl = Math.hypot(fx, fy, fz);
  const f = { x: fx / fl, y: fy / fl, z: fz / fl };
  // right = forward Ã— up(0,1,0)
  const rl = Math.hypot(f.z, f.x);
  const r = { x: -f.z / rl, y: 0, z: f.x / rl };
  // up = right Ã— forward
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const d = { x: p.x - e.x, y: p.y - e.y, z: p.z - e.z };
  const xc = d.x * r.x + d.y * r.y + d.z * r.z;
  const yc = d.x * u.x + d.y * u.y + d.z * u.z;
  const zc = d.x * f.x + d.y * f.y + d.z * f.z;
  const t = Math.tan((fovForAspect(pose.fov, aspect) * Math.PI) / 360);
  return { x: xc / (zc * t * aspect), y: yc / (zc * t), z: zc };
}

/** Pose Â«mesaÂ» con 4 jugadores: referencia para quien solo necesita Â«la cÃ¡maraÂ». */
const DEFAULT_POSE = cameraPose('table', 4);
export const CAMERA = {
  fov: BASE_FOV,
  near: 0.05,
  far: 40,
  position: DEFAULT_POSE.position,
  lookAt: DEFAULT_POSE.lookAt,
  /** oscilaciÃ³n idle de Â«respiraciÃ³nÂ» */
  idleAmplitude: 0.008,
  idleSpeedHz: 0.19,
};

export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
