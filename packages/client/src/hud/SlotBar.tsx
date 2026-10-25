import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { slotBarModel, type SlotBarContext } from './slot-bar.js';

interface Props {
  view: PlayerView;
  ctx: SlotBarContext;
  peekPicks: number[];
  onPick: (slot: number) => void;
}

/**
 * Barra inferior 2D (docs/01 §11, D-042): tus slots por posición, en el mismo
 * orden que la fila 3D. Nunca muestra valores salvo la vista privada en curso.
 */
export function SlotBar({ view, ctx, peekPicks, onPick }: Props): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const cells = slotBarModel(view, ctx);
  return (
    <nav className="slot-bar" aria-label={t('yourTotems')}>
      <ol>
        {cells.map((c) => {
          const cls = [
            'slot-cell',
            c.state,
            c.legal ? 'legal' : '',
            c.selected ? 'selected' : '',
            c.sealed ? 'sealed' : '',
            c.lockedSeconds > 0 ? 'locked' : '',
            c.value !== undefined ? 'revealed' : '',
            peekPicks.includes(c.index) ? 'picked' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label =
            c.state === 'empty'
              ? `${t('slot')} ${c.index + 1}: ${t('empty')}`
              : `${t('slot')} ${c.index + 1}${c.sealed ? ` · ${t('sealed')}` : ''}`;
          return (
            <li key={c.index}>
              <button
                type="button"
                className={cls}
                disabled={!c.legal}
                aria-label={label}
                aria-pressed={c.selected}
                onClick={() => onPick(c.index)}
              >
                <kbd>{c.index + 1}</kbd>
                {c.value !== undefined ? <strong className="slot-value">{c.value}</strong> : null}
                {c.lockedSeconds > 0 && c.state === 'hidden' ? (
                  <span className="slot-lock">{c.lockedSeconds}s</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="slot-hint">{t('slotKeysHint')}</span>
    </nav>
  );
}
