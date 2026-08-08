import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { tryReconnect } from '../net/client.js';

/** E18: estado de la conexión y reintento manual si el automático se agota. */
export function ConnectionBanner(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const connection = useStore((s) => s.connection);
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
