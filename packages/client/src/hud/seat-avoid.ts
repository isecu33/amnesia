import { cameraPose, characterAnchors, projectToNdc } from '../scene/layout.js';

/** Caja en px relativa al contenedor de la mesa. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Aire entre la placa de turno y una etiqueta empujada. */
export const SEAT_AVOID_GAP_PX = 6;

/**
 * Borde inferior que debe tener una etiqueta (anclada por abajo en `bottom`,
 * centrada en `x`) para no pisar la zona `avoid` (la placa de turno). Si no
 * choca, devuelve `bottom` tal cual; si choca, la baja justo bajo la zona.
 */
export function avoidBottom(
  x: number,
  bottom: number,
  w: number,
  h: number,
  avoid: Box | undefined,
): number {
  if (!avoid) return bottom;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = bottom - h;
  const overlapX = right > avoid.left - SEAT_AVOID_GAP_PX && left < avoid.right + SEAT_AVOID_GAP_PX;
  const overlapY = top < avoid.bottom + SEAT_AVOID_GAP_PX && bottom > avoid.top;
  return overlapX && overlapY ? avoid.bottom + SEAT_AVOID_GAP_PX + h : bottom;
}

/** Radio de la cabeza de la marioneta (m) que se reserva como «cara» del rival. */
const FACE_RADIUS_M = 0.2;
/** La cara es algo más estrecha que alta. */
const FACE_HALF_WIDTH = 0.9;
/** Salto horizontal al buscar hueco para la placa de turno. */
const PLACE_STEP_PX = 8;

const boxesOverlap = (a: Box, b: Box, gap: number): boolean =>
  a.right > b.left - gap && a.left < b.right + gap && a.bottom > b.top - gap && a.top < b.bottom + gap;

/**
 * Cajas (px, relativas a la mesa) de la cara de cada rival con la cámara en pose
 * «mesa»: la HUD no debe tapar a quien juega enfrente (docs/01 §11).
 */
export function faceBoxes(players: number, width: number, height: number): Box[] {
  if (width <= 0 || height <= 0 || players < 2) return [];
  const pose = cameraPose('table', players);
  const aspect = width / height;
  const px = (ndcX: number, ndcY: number): [number, number] => [
    ((ndcX + 1) / 2) * width,
    ((1 - ndcY) / 2) * height,
  ];
  const out: Box[] = [];
  for (let seat = 1; seat < players; seat++) {
    const head = characterAnchors(seat, players).head;
    const c = projectToNdc(pose, aspect, head);
    const top = projectToNdc(pose, aspect, { ...head, y: head.y + FACE_RADIUS_M });
    if (c.z <= 0) continue;
    const [cx, cy] = px(c.x, c.y);
    const [, ty] = px(top.x, top.y);
    const r = Math.abs(cy - ty);
    out.push({
      left: cx - r * FACE_HALF_WIDTH,
      right: cx + r * FACE_HALF_WIDTH,
      top: cy - r,
      bottom: cy + r,
    });
  }
  return out;
}

export interface Size {
  w: number;
  h: number;
}

export interface PlatePlacement {
  x: number;
  y: number;
  /** sin nombre: solo el reloj, cuando no cabe la placa completa entre las caras */
  compact: boolean;
}

function sweep(faces: Box[], size: Size, viewportW: number, margin: number): number | undefined {
  const maxX = viewportW - margin - size.w;
  for (let x = margin; x <= maxX; x += PLACE_STEP_PX) {
    const box = { left: x, top: margin, right: x + size.w, bottom: margin + size.h };
    if (!faces.some((f) => boxesOverlap(box, f, SEAT_AVOID_GAP_PX))) return x;
  }
  return undefined;
}

/**
 * Coloca la placa de turno en el borde superior, en el primer hueco (de izquierda
 * a derecha) que no pise ninguna cara. Si ni así cabe, usa la versión compacta; y
 * si tampoco, la esquina (la compacta es lo bastante pequeña para no tapar rasgos).
 */
export function placePlate(
  faces: Box[],
  full: Size,
  compact: Size,
  viewportW: number,
  margin: number,
): PlatePlacement {
  const fx = sweep(faces, full, viewportW, margin);
  if (fx !== undefined) return { x: fx, y: margin, compact: false };
  const cx = sweep(faces, compact, viewportW, margin);
  return { x: cx ?? margin, y: margin, compact: true };
}

/** Como `avoidBottom`, pero esquivando varias zonas a la vez (placa + caras). */
export function avoidBottomAll(
  x: number,
  bottom: number,
  w: number,
  h: number,
  zones: readonly Box[],
): number {
  let b = bottom;
  // Dos pasadas bastan: bajar bajo una zona puede entrar en otra.
  for (let pass = 0; pass < 2; pass++)
    for (const z of zones) b = avoidBottom(x, b, w, h, z);
  return b;
}
