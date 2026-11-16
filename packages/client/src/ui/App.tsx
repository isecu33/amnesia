import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { Home } from './Home.js';
import { Lobby } from './Lobby.js';
import { Table3D } from './Table3D.js';
import { Score } from './Score.js';
import { TutorialScreen } from './TutorialScreen.js';
import { VfxDebug } from './VfxDebug.js';
import { SettingsPanel } from '../hud/SettingsPanel.js';
import { ConnectionBanner } from '../hud/ConnectionBanner.js';
import { audio } from '../audio/audio.js';
import { tryReconnect } from '../net/client.js';
import { RotateHint } from './title/RotateHint.js';
import { useReducedMotion } from './title/motion.js';
import './styles.css';

export function App(): JSX.Element {
  const screen = useStore((s) => s.screen);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const settings = useSettings();
  const t = makeT(settings.lang);
  const [showSettings, setShowSettings] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    settings.load();
    // E18: si había una sesión viva, se vuelve a ella sin pasar por Home.
    void tryReconnect();
    // Deliberado: la escena se monta una sola vez y se actualiza por el bucle.
  }, []);
  useEffect(() => {
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
  }, [settings.volume, settings.muted]);

  // Escena de depuración de VFX: `?scene=vfx` (docs/03 WP-11).
  const debugScene = new URLSearchParams(globalThis.location?.search ?? '').get('scene');
  if (debugScene === 'vfx') return <VfxDebug />;

  // En el título, Ajustes vive en el propio menú: sin cabecera encima del logo.
  const showTopbar = screen !== 'home';
  const appClass = [
    'app',
    settings.bigNumbers ? 'big-numbers' : '',
    screen === 'table' ? 'playing' : 'menus',
    reduced ? 'reduce-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={appClass}>
      {showTopbar ? (
        <header className="topbar">
          <strong className="topbar-title">{t('title')}</strong>
          <span className="spacer" />
          <button
            type="button"
            className="pixel-btn settings-btn"
            aria-haspopup="dialog"
            onClick={() => setShowSettings(true)}
          >
            <svg viewBox="0 0 8 8" aria-hidden="true" className="gear">
              <path d="M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zm0 3v2h2V3z" />
            </svg>
            {t('settings')}
          </button>
        </header>
      ) : null}
      <ConnectionBanner />
      {error ? (
        <div className="banner error menu-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="pixel-btn small-btn"
            aria-label={t('close')}
            onClick={() => setError(undefined)}
          >
            ×
          </button>
        </div>
      ) : null}
      {screen === 'home' ? <Home onOpenSettings={() => setShowSettings(true)} /> : null}
      {screen === 'lobby' ? <Lobby /> : null}
      {screen === 'table' ? <Table3D /> : null}
      {screen === 'score' ? <Score /> : null}
      {screen === 'tutorial' ? <TutorialScreen /> : null}
      {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : null}
      <RotateHint text={t('rotateDevice')} />
    </div>
  );
}
