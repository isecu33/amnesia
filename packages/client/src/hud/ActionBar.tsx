import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import type { GuideChip } from './turn-guide.js';

export interface ActionBarProps {
  chips: GuideChip[];
  /** pulsar un chip equivale a pulsar su tecla (ratón y táctil) */
  onKey: (key: string) => void;
  logOpen: boolean;
}

/**
 * Acciones legales con su tecla (docs/01 §11). Repite en nítido las teclas que
 * la mesa lleva grabadas: a 360 px de render interno no se leen solas.
 */
export function ActionBar({ chips, onKey, logOpen }: ActionBarProps): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const t = makeT(lang);
  return (
    <nav className="action-bar" aria-label={t('actionsLabel')}>
      {chips.map((c) => (
        <button
          key={`${c.key}:${c.label}`}
          type="button"
          className={`action-chip${c.armed ? ' armed' : ''}${c.accent ? ' accent' : ''}`}
          aria-pressed={c.armed ? true : undefined}
          onClick={() => onKey(c.key)}
        >
          <kbd>{c.glyph}</kbd>
          <span>{t(c.label)}</span>
        </button>
      ))}
      <button
        type="button"
        className="action-chip quiet"
        aria-pressed={logOpen}
        onClick={() => onKey('l')}
      >
        <kbd>L</kbd>
        <span>{t('actLog')}</span>
      </button>
    </nav>
  );
}
