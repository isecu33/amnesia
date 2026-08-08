import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/** Log lateral de subtítulos: alternativa visual a TODO sonido (docs/01 §11). */
export function Subtitles(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const on = useSettings((s) => s.subtitles);
  const big = useSettings((s) => s.bigNumbers);
  const log = useStore((s) => s.log);
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
