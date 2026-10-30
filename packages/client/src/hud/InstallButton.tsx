import { useEffect, useState } from 'react';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { getInstallPrompt, onInstallChange, promptInstall } from '../pwa.js';
import { detectIos, installState, type InstallState } from './install-state.js';
import './pwa.css';

function readState(): InstallState {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  const standalone =
    globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav?.standalone === true;
  return installState({
    standalone,
    hasPrompt: getInstallPrompt() !== null,
    isIos: detectIos(nav?.userAgent ?? '', nav?.platform ?? '', nav?.maxTouchPoints ?? 0),
  });
}

/** «Instalar app»: diálogo nativo si existe; en iOS, la indicación manual. */
export function InstallButton(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const [state, setState] = useState<InstallState>(readState);
  useEffect(() => onInstallChange(() => setState(readState())), []);

  if (state === 'installable') {
    return (
      <button type="button" className="pixel-btn install-btn" onClick={() => void promptInstall()}>
        {t('installApp')}
      </button>
    );
  }
  if (state === 'ios') return <p className="install-hint">{t('installIos')}</p>;
  return null;
}
