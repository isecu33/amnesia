import { useSettings } from '../settings/store.js';
import { useStore } from '../state/store.js';
import { fmt, makeT } from '../i18n/index.js';
import type { GuideChip } from './turn-guide.js';
import { ActionIcon } from './ActionIcon.js';
import { CardChip } from './CardChip.js';
import { useHint } from './hint-store.js';

export interface ActionBarProps {
  chips: GuideChip[];
  /** pulsar un chip equivale a pulsar su tecla (ratón y táctil) */
  onKey: (key: string) => void;
  logOpen: boolean;
}

/**
 * Dock de acciones (abajo a la derecha, fuera de tu fila de tótems): cartas
 * visibles, instrucción y acciones legales. Las teclas se enseñan solo con
 * puntero fino; en táctil mandan el icono y el texto.
 */
export function ActionBar({ chips, onKey, logOpen }: ActionBarProps): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const t = makeT(lang);
  const hint = useHint();
  const view = useStore((s) => s.view);
  // Solo cartas visibles: el descarte (público) y la robada que ves tú (I2, E22).
  const discard = view?.discardTop;
  const mine = view && view.drawn && view.activePlayer === view.you.id ? view.drawn.value : undefined;
  return (
    <nav className="action-bar" aria-label={t('actionsLabel')}>
      {discard !== undefined || mine !== undefined ? (
        <div className="card-chips" aria-label={t('dockCards')}>
          {mine !== undefined ? <CardChip label="chipYourCard" value={mine} kind="mine" /> : null}
          {discard !== undefined ? (
            <CardChip label="chipDiscard" value={discard} kind="discard" />
          ) : null}
        </div>
      ) : null}
      {hint ? (
        <p key={hint} className="turn-hint" role="status" aria-live="polite">
          {hint}
        </p>
      ) : null}
      {chips.map((c) => {
        const text = c.labelVars ? fmt(t(c.label), c.labelVars) : t(c.label);
        return (
          <button
            key={`${c.key}:${c.label}`}
            type="button"
            className={`action-chip${c.armed ? ' armed' : ''}${c.accent ? ' accent' : ''}`}
            aria-pressed={c.armed ? true : undefined}
            disabled={c.disabled}
            onClick={() => onKey(c.key)}
          >
            <ActionIcon name={c.label} />
            <span className="action-label">{text}</span>
            <kbd>{c.glyph}</kbd>
          </button>
        );
      })}
      <button
        type="button"
        className="action-chip quiet"
        aria-pressed={logOpen}
        onClick={() => onKey('l')}
      >
        <ActionIcon name="actLog" />
        <span className="action-label">{t('actLog')}</span>
        <kbd>L</kbd>
      </button>
    </nav>
  );
}
