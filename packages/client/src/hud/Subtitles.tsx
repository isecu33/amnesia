import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

const LOG_SWEEP_MS = 250;

/** Log lateral de subtítulos: alternativa visual a TODO sonido (docs/01 §11). */
export function Subtitles(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const on = useSettings((s) => s.subtitles);
  const big = useSettings((s) => s.bigNumbers);
  const log = useStore((s) => s.log);
  const expireLog = useStore((s) => s.expireLog);
  const hasPrivate = log.some((l) => l.expiresAt !== undefined);
  useEffect(() => {
    if (!hasPrivate) return undefined;
    const id = setInterval(() => expireLog(Date.now()), LOG_SWEEP_MS);
    return () => clearInterval(id);
  }, [hasPrivate, expireLog]);
  if (!on) return null;
  return (
    <aside className={`subtitles${big ? ' big' : ''}`} aria-live="polite" aria-label={t('log')}>
      <ul>
        {log
          .slice(-10)
          .reverse()
          .map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
      </ul>
    </aside>
  );
}
