import type { TKey } from '../i18n/index.js';

/** Iconos pixel 8×8 por acción: se entienden sin leer la tecla (táctil). */
const ICONS: Partial<Record<TKey, string>> = {
  // mazo: tres cartas apiladas
  actDrawDeck: 'M1 1h5v1H1zM1 3h6v1H1zM1 5h6v2H1z',
  // descarte: carta con flecha hacia abajo
  actDrawDiscard: 'M1 0h6v4H1zM3 4h2v1h1v1H5v1H3V6H2V5h1z',
  // descartar: cubo
  actDiscard: 'M1 1h6v1H1zM3 0h2v1H3zM2 3h4v4H2z',
  // sustituir: dos flechas cruzadas
  actSwap: 'M1 2h5V1h1v2H1zM1 5h6v1H2v1H1z',
  actSwapN: 'M1 2h5V1h1v2H1zM1 5h6v1H2v1H1z',
  // pasar: avance
  actSkip: 'M1 1h2v6H1zM4 1h1v1h1v1h1v2H6v1H5v1H4z',
  // confirmar: marca
  actPeek: 'M1 4h1v1h1v1h1V5h1V4h1V3h1V2h1v2H7v1H6v1H5v1H3V6H2V5H1z',
  // ¡última!: llama
  actUltima: 'M3 0h1v2h1v1h1v3H5v1H3V6H2V3h1z',
  // rival: flecha doble
  actRival: 'M0 3h2V1h1v6H2V5H0zM5 1h1v2h2v2H6v2H5z',
  // registro: pergamino
  actLog: 'M1 0h6v7H1zM2 1v1h4V1zM2 3v1h4V3zM2 5v1h3V5z',
};

export function ActionIcon({ name }: { name: TKey }): JSX.Element {
  const d = ICONS[name] ?? ICONS.actSkip ?? '';
  return (
    <svg className="action-icon" viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges">
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}
