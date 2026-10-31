import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { fmt, makeT } from '../i18n/index.js';
import { DOUBLE_DRAW_KEYS, doubleDrawChoice } from '../ui/effect-targeting.js';

/**
 * Doble Robo: las dos cartas (solo las ves tú) y un botón por cada una.
 * Accesible por teclado: Tab/Enter sobre los botones o las teclas Z y C.
 */
export function DoubleDrawChoice({
  view,
  onKeep,
}: {
  view: PlayerView;
  onKeep: (index: number) => void;
}): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const cards = doubleDrawChoice(view);
  if (!cards) return null;
  return (
    <div className="double-draw" role="group" aria-label={t('hintDoubleDraw')}>
      {cards.map((value, i) => (
        <button
          key={i}
          type="button"
          className="double-draw-card"
          aria-label={fmt(t('doubleDrawKeep'), { n: String(i + 1) })}
          onClick={() => onKeep(i)}
        >
          <span className="double-draw-value">{value}</span>
          <kbd>{(DOUBLE_DRAW_KEYS[i] ?? '').toUpperCase()}</kbd>
        </button>
      ))}
    </div>
  );
}
