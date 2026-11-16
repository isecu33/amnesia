import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { tryReconnect } from '../net/client.js';
import { BANNER_AUTODISMISS_MS } from '../net/saved-session.js';
import './hud.css';

/** E18: estado de la conexión y reintento manual si el automático se agota. */
export function ConnectionBanner(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const connection = useStore((s) => s.connection);
  const screen = useStore((s) => s.screen);
  const [dismissed, setDismissed] = useState(false);
  // Fuera de la mesa un fallo final no debe quedarse pegado en pantalla.
  const stale = connection === 'lost' && screen !== 'table';
  useEffect(() => {
    setDismissed(false);
    if (!stale) return undefined;
    const id = setTimeout(() => setDismissed(true), BANNER_AUTODISMISS_MS);
    return () => clearTimeout(id);
  }, [stale, connection]);
  if (stale && dismissed) return null;
  if (connection === 'online' || connection === 'offline') return null;
  return (
    <div className="banner error hud-conn" role="alert">
      {connection === 'reconnecting' ? (
        <>
          <span>{t('reconnecting')}</span>
          <span className="hud-conn-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </>
      ) : (
        <>
          <span>{t('connectionLost')}</span>{' '}
          <button type="button" className="pixel-btn" onClick={() => void tryReconnect()}>
            {t('retry')}
          </button>
        </>
      )}
    </div>
  );
}
