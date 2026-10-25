import type { PlayerView } from '@totem/core';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/**
 * Arriba a la izquierda (docs/01 §11): carta superior del descarte en grande,
 * última acción pública y de quién es el turno. Las líneas privadas (con
 * caducidad) no salen aquí: solo en el log, y caducan (D-041).
 */
export function StatusPanel({ view }: { view: PlayerView }): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const log = useStore((s) => s.log);
  const last = [...log].reverse().find((l) => l.expiresAt === undefined);
  const mine = view.activePlayer === view.you.id;
  return (
    <section className="status-panel" aria-label={t('lastAction')}>
      <div className="discard-big" aria-label={t('discard')}>
        <span className="discard-label">{t('discard')}</span>
        <span className="discard-value">{view.discardTop ?? '·'}</span>
      </div>
      <div className="status-text">
        <div className={`hud-status${mine ? ' mine' : ''}`}>
          {mine ? t('yourTurn') : t('waitingTurn')}
          {view.you.lockedForMs > 0
            ? ` · ${t('locked')} ${Math.ceil(view.you.lockedForMs / 1000)}s`
            : ''}
        </div>
        <p className="last-action">{last?.text ?? t('nothingYet')}</p>
      </div>
    </section>
  );
}
