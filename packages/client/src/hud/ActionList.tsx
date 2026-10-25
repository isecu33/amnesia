import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { actionList, type ActionEntry } from './slot-bar.js';

interface Props {
  view: PlayerView;
  swapArmed: boolean;
  peekCount: number;
  onAction: (a: ActionEntry) => void;
}

/** Arriba a la derecha: acciones legales (`view.legal`) con su tecla. */
export function ActionList({ view, swapArmed, peekCount, onAction }: Props): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const list = actionList(view);
  if (list.length === 0) return null;
  return (
    <section className="action-list" aria-label={t('actions')}>
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          className={
            a.id === 'SWAP_DRAWN' && swapArmed ? 'active' : a.id === 'CALL_ULTIMA' ? 'ultima' : ''
          }
          disabled={a.id === 'PEEK_INITIAL' && peekCount === 0}
          onClick={() => onAction(a)}
        >
          <kbd>{a.key === 'enter' ? '↵' : a.key.toUpperCase()}</kbd>
          {t(a.label)}
          {a.id === 'PEEK_INITIAL' ? ` (${peekCount})` : ''}
        </button>
      ))}
    </section>
  );
}
