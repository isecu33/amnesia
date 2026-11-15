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
