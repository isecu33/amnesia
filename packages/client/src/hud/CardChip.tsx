import { useEffect, useRef } from 'react';
import { animalIcon } from '../scene/textures.js';
import { useSettings } from '../settings/store.js';
import { makeT, type TKey } from '../i18n/index.js';

export const animalKey = (value: number): TKey => `animal${Math.max(0, Math.min(13, value))}` as TKey;

/**
 * Chip 2D de una carta VISIBLE (descarte público o tu carta robada, privada):
 * icono + número grande + nombre. Nunca se usa con tótems boca abajo (I2).
 */
export function CardChip({
  label,
  value,
  kind,
}: {
  label: TKey;
  value: number;
  kind: 'discard' | 'mine';
}): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      const c = ref.current?.getContext('2d');
      if (!c || !ref.current) return;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, 32, 22);
      c.drawImage(animalIcon(value), 0, 0);
    } catch {
      /* sin canvas (tests): el número y el nombre bastan */
    }
  }, [value]);
  return (
    <div className={`card-chip ${kind}`} role="status" aria-label={`${t(label)}: ${value} ${t(animalKey(value))}`}>
      <span className="card-chip-label">{t(label)}</span>
      <span className="card-chip-body">
        <canvas ref={ref} width={32} height={22} className="card-chip-icon" aria-hidden="true" />
        <b className="card-chip-value">{value}</b>
        <span className="card-chip-name">{t(animalKey(value))}</span>
      </span>
    </div>
  );
}
