/**
 * Iconos pixel de las reacciones (D-045), dibujados en código con la paleta fija
 * de la UI (sin recursos externos, D-014). Son iguales para todos los jugadores:
 * el personaje no se mueve. Datos puros: una lista de rectángulos por icono,
 * que `EmoteIcon` pinta en un canvas y los tests verifican sin DOM.
 *
 * Ids (los del protocolo): 0 saludo · 1 risa · 2 sospecha · 3 aplauso (estrella
 * tótem) · 4 tristeza · 5 susto.
 */

export const EMOTE_ICON_SIZE = 14;

/** Paleta fija de la UI (tokens de styles.css); no cambia con el modo daltónico. */
export const EMOTE_PALETTE = {
  ink: '#14101c',
  ivory: '#f2e8d5',
  candle: '#ffb35c',
  mystic: '#7be0c8',
  danger: '#e0565b',
} as const;
type Ink = (typeof EMOTE_PALETTE)[keyof typeof EMOTE_PALETTE];

export interface IconRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: Ink;
}

type Box = readonly [x: number, y: number, w: number, h: number];

const { ink, ivory, candle, mystic, danger } = EMOTE_PALETTE;

const rect = ([x, y, w, h]: Box, color: Ink): IconRect => ({ x: x + 1, y: y + 1, w, h, color });

/** Contorno de 1 px alrededor de una silueta hecha de cajas, y luego su relleno. */
function outlined(boxes: readonly Box[], fill: Ink): IconRect[] {
  const grow = ([x, y, w, h]: Box): Box => [x - 1, y - 1, w + 2, h + 2];
  return [...boxes.map((b) => rect(grow(b), ink)), ...boxes.map((b) => rect(b, fill))];
}

/** Cara redonda de 12×12 (relleno `fill`) con contorno. */
function face(fill: Ink): IconRect[] {
  const spans: [number, number][] = [
    [3, 6],
    [2, 8],
    [1, 10],
    [0, 12],
    [0, 12],
    [0, 12],
    [0, 12],
    [0, 12],
    [0, 12],
    [1, 10],
    [2, 8],
    [3, 6],
  ];
  const out = spans.map(([x, w], y) => rect([x, y, w, 1], ink));
  spans.forEach(([x, w], y) => {
    if (y > 0 && y < 11) out.push(rect([x + 1, y, w - 2, 1], fill));
  });
  return out;
}

const dot = (x: number, y: number, color: Ink = ink): IconRect => rect([x, y, 1, 1], color);

const ICONS: readonly (readonly IconRect[])[] = [
  // 0 saludo: mano abierta con destellos
  [
    ...outlined(
      [
        [3, 7, 6, 4],
        [3, 4, 1, 3],
        [5, 2, 1, 5],
        [7, 3, 1, 4],
        [9, 5, 1, 3],
        [1, 8, 2, 2],
      ],
      candle,
    ),
    dot(11, 1, mystic),
    dot(0, 3, mystic),
    dot(11, 4, ivory),
  ],
  // 1 risa: ojos cerrados y boca abierta
  [
    ...face(candle),
    dot(2, 4),
    dot(3, 3),
    dot(4, 4),
    dot(7, 4),
    dot(8, 3),
    dot(9, 4),
    rect([3, 6, 6, 1], ink),
    rect([4, 7, 4, 2], ink),
    rect([5, 8, 2, 1], danger),
  ],
  // 2 sospecha: ceja alzada, ojos de reojo, boca torcida
  [
    ...face(ivory),
    rect([2, 3, 3, 1], ink),
    rect([7, 2, 3, 1], ink),
    rect([2, 5, 3, 1], ink),
    rect([7, 5, 3, 1], ink),
    dot(4, 5, ivory),
    dot(9, 5, ivory),
    rect([4, 8, 5, 1], ink),
    dot(9, 7),
  ],
  // 3 aplauso: estrella tótem
  [
    ...outlined(
      [
        [5, 0, 2, 12],
        [0, 5, 12, 2],
        [3, 3, 6, 6],
      ],
      candle,
    ),
    rect([5, 5, 2, 2], ivory),
    dot(5, 0, mystic),
    dot(6, 11, mystic),
  ],
  // 4 tristeza: cara azulada con lágrima
  [
    ...face(mystic),
    rect([3, 4, 1, 2], ink),
    rect([8, 4, 1, 2], ink),
    rect([2, 3, 3, 1], ink),
    rect([7, 3, 3, 1], ink),
    rect([4, 8, 4, 1], ink),
    dot(3, 9),
    dot(8, 9),
    rect([3, 6, 1, 2], ivory),
  ],
  // 5 susto: ojos enormes y boca en O
  [
    ...face(ivory),
    rect([2, 3, 3, 3], ink),
    rect([7, 3, 3, 3], ink),
    dot(3, 4, ivory),
    dot(8, 4, ivory),
    rect([4, 7, 4, 3], ink),
    rect([5, 8, 2, 1], danger),
    rect([10, 0, 1, 2], mystic),
  ],
];

export const EMOTE_ICON_COUNT = ICONS.length;

/** Rectángulos del icono de un emote; un id fuera de rango cae en el saludo. */
export function emoteIconRects(id: number): readonly IconRect[] {
  return ICONS[id] ?? (ICONS[0] as readonly IconRect[]);
}
