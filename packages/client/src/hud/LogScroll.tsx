import { useEffect } from 'react';
import type { PlayerView } from '@totem/core';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { resolveName } from '../state/subtitles.js';

const LOG_SWEEP_MS = 250;
const LOG_LINES = 12;

/**
 * Pergamino con el marcador y el registro de jugadas (#8): es lo único 2D de la
 * mesa y solo existe mientras se mantiene L. Las líneas con información privada
 * caducan solas (D-041).
 */
export function LogScroll({
  view,
  names,
}: {
  view: PlayerView;
  names: Record<string, string>;
}): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const big = useSettings((s) => s.bigNumbers);
  const t = makeT(lang);
  const log = useStore((s) => s.log);
  const seats = useStore((s) => s.lobby?.seats);
  const expireLog = useStore((s) => s.expireLog);
  const ids = [view.you.id, ...view.others.map((o) => o.id)];

  useEffect(() => {
    const id = setInterval(() => expireLog(Date.now()), LOG_SWEEP_MS);
    return () => clearInterval(id);
  }, [expireLog]);

  return (
    <aside className={`log-scroll pixel-panel${big ? ' big' : ''}`} aria-label={t('log')} role="log">
      <h3>{t('scores')}</h3>
      <ul className="log-scores">
        {ids.map((id) => (
          <li key={id} className={view.activePlayer === id ? 'active' : ''}>
            <span>{id === view.you.id ? t('you') : resolveName(id, names, seats, lang)}</span>
            <strong>{view.scores[id]?.total ?? 0}</strong>
          </li>
        ))}
      </ul>
      <h3>{t('log')}</h3>
      <ul className="log-lines">
        {log
          .slice(-LOG_LINES)
          .reverse()
          .map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
      </ul>
    </aside>
  );
}
