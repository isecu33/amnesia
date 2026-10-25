import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/**
 * Carta robada en mano: el valor solo existe en `view.drawn` (privado, DREW_VALUE).
 * Sin este panel el jugador no puede decidir entre descartar y sustituir.
 */
export function HeldCard({ view }: { view: PlayerView }): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const big = useSettings((s) => s.bigNumbers);
  const drawn = view.drawn;
  if (!drawn || view.activePlayer !== view.you.id) return null;

  const known = drawn.value !== undefined;
  const label = known ? t('heldCard') : t('heldCardHidden');
  return (
    <div className={`held-card${big ? ' big' : ''}`} role="status" aria-label={label}>
      <span className="held-card-label">{label}</span>
      {known ? <span className="held-card-value">{drawn.value}</span> : null}
    </div>
  );
}
