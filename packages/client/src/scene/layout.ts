/**
 * Geometría de la mesa — docs/01 §11 y docs/02 §5.3. Matemática pura y testeable.
 * Requisito duro: TUS 8 slots (huecos incluidos) siempre visibles en un arco
 * en la parte inferior de la pantalla.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const TABLE_RADIUS = 1.6;
export const TABLE_HEIGHT = 0.75;
export const SEAT_DISTANCE = 1.45;
/** Arco de tus tótems: radio y apertura. */
export const OWN_ARC_RADIUS = 0.62;
export const OWN_ARC_SPREAD = Math.PI * 0.62;
export const RIVAL_ARC_SPREAD = Math.PI * 0.34;
export const MAX_SLOTS = 8;

/** Tu asiento mira al centro desde -Z. Los rivales se reparten por el resto. */
export function seatAngle(index: number, total: number): number {
  return (index / total) * Math.PI * 2;
}

export function seatPosition(index: number, total: number, distance = SEAT_DISTANCE): Vec3 {
  const a = seatAngle(index, total);
  return { x: Math.sin(a) * distance, y: TABLE_HEIGHT, z: -Math.cos(a) * distance };
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
  const spread = own ? OWN_ARC_SPREAD : RIVAL_ARC_SPREAD;
  const radius = own ? OWN_ARC_RADIUS : 0.42;
  const seat = seatPosition(
    seatIndex,
    totalSeats,
    own ? SEAT_DISTANCE - 0.35 : SEAT_DISTANCE - 0.3,
  );
  const seatDir = seatAngle(seatIndex, totalSeats);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const a = seatDir + t * spread;
    out.push({
      x: seat.x - Math.sin(a) * radius * (own ? 1 : -1) * -1,
      y: TABLE_HEIGHT + 0.01,
      z: seat.z + Math.cos(a) * radius * (own ? 1 : -1),
    });
  }
  return own ? out : out.reverse(); // los rivales se ven en espejo
}

export const DECK_POSITION: Vec3 = { x: -0.22, y: TABLE_HEIGHT + 0.02, z: 0 };
export const DISCARD_POSITION: Vec3 = { x: 0.22, y: TABLE_HEIGHT + 0.02, z: 0 };
export const BELL_POSITION: Vec3 = { x: 0.72, y: TABLE_HEIGHT + 0.05, z: -0.95 };
export const CANDLE_POSITION: Vec3 = { x: -0.72, y: TABLE_HEIGHT + 0.05, z: -0.95 };

/** Cámara en primera persona sentada a la mesa (FOV 55°, docs/01 §11). */
export const CAMERA = {
  fov: 55,
  near: 0.05,
  far: 40,
  position: { x: 0, y: TABLE_HEIGHT + 0.42, z: -SEAT_DISTANCE } as Vec3,
  lookAt: { x: 0, y: TABLE_HEIGHT, z: -0.15 } as Vec3,
  /** oscilación idle de «respiración» */
  idleAmplitude: 0.012,
  idleSpeedHz: 0.19,
};

export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
