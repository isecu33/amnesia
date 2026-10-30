import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { tryReconnect } from '../net/client.js';

/** Estado de red del navegador (arranque offline de la PWA). */
function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(globalThis.navigator?.onLine ?? true);
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** E18: estado de la conexión y reintento manual si el automático se agota. */
export function ConnectionBanner(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const connection = useStore((s) => s.connection);
  const screen = useStore((s) => s.screen);
  const browserOnline = useBrowserOnline();
  // Sin red y sin partida en curso (inicio o tutorial): aviso claro, no un fallo mudo.
  if (!browserOnline && connection === 'offline' && (screen === 'home' || screen === 'tutorial')) {
    return (
      <div className="banner error" role="status">
        {t('offlineBanner')}
      </div>
    );
  }
  if (connection === 'online' || connection === 'offline') return null;
  return (
    <div className="banner error" role="alert">
      {connection === 'reconnecting' ? (
        <span>{t('reconnecting')}</span>
      ) : (
        <>
          <span>{t('connectionLost')}</span>{' '}
          <button onClick={() => void tryReconnect()}>{t('retry')}</button>
        </>
      )}
    </div>
  );
}
