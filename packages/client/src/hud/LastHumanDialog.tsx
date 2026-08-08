import { resolveLastHuman } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/** E16: solo queda un humano en la sala. */
export function LastHumanDialog(): JSX.Element | null {
  const t = makeT(useSettings((s) => s.lang));
  const offer = useStore((s) => s.lastHumanOffer);
  const clear = useStore((s) => s.setLastHumanOffer);
  if (!offer) return null;
  return (
    <div className="modal" role="dialog" aria-label={t('lastHumanTitle')}>
      <div className="modal-body">
        <h3>{t('lastHumanTitle')}</h3>
        <p className="muted">
          {t('bot')}: {offer.bots}
        </p>
        <div className="row">
          <button
            onClick={() => {
              resolveLastHuman('win');
              clear(undefined);
            }}
          >
            {t('lastHumanWin')}
          </button>
          <button
            onClick={() => {
              resolveLastHuman('continue');
              clear(undefined);
            }}
          >
            {t('lastHumanContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}
