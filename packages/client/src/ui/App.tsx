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
import './styles.css';

export function App(): JSX.Element {
  const screen = useStore((s) => s.screen);
  const error = useStore((s) => s.error);
  const settings = useSettings();
  const t = makeT(settings.lang);
  const [showSettings, setShowSettings] = useState(false);

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

  return (
    <div className={`app${settings.bigNumbers ? ' big-numbers' : ''}`}>
      <header className="topbar">
        <strong>{t('title')}</strong>
        <span className="muted">{t('tagline')}</span>
        <span className="spacer" />
        <button onClick={() => setShowSettings(true)}>{t('settings')}</button>
      </header>
      <ConnectionBanner />
      {error ? <div className="banner error">{error}</div> : null}
      {screen === 'home' ? <Home /> : null}
      {screen === 'lobby' ? <Lobby /> : null}
      {screen === 'table' ? <Table3D /> : null}
      {screen === 'score' ? <Score /> : null}
      {screen === 'tutorial' ? <TutorialScreen /> : null}
      {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : null}
    </div>
  );
}
