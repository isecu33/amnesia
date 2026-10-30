import { useState } from 'react';
import { createRoom, joinRoom } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT, type TKey } from '../i18n/index.js';
import { audio } from '../audio/audio.js';
import { AVATAR_CHOICES, type SpeciesId } from '../scene/species.js';
import { InstallButton } from '../hud/InstallButton.js';
import { Logo, PixelStage, SpeciesPortrait } from './PixelArt.js';

const SPECIES_NAME: Record<SpeciesId, TKey> = {
  owl: 'totemOwl',
  fox: 'totemFox',
  bear: 'totemBear',
  deer: 'totemDeer',
  snake: 'totemSnake',
  crow: 'totemCrow',
};

export function Home(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const setError = useStore((s) => s.setError);
  const setScreen = useStore((s) => s.setScreen);
  const slowTimers = useSettings((s) => s.slowTimers);
  const setSettings = useSettings((s) => s.set);
  const [name, setName] = useState('');
  const [choice, setChoice] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const avatar = AVATAR_CHOICES[choice]?.avatar ?? 0;

  const guard = (fn: () => Promise<unknown>) => async (): Promise<void> => {
    audio.unlock();
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PixelStage>
      <main className="home">
        <Logo />
        <p className="tagline">{t('tagline')}</p>

        <section className="pixel-panel">
          <label className="field">
            <span className="field-label">{t('yourName')}</span>
            <input
              className="pixel-input"
              value={name}
              maxLength={24}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label" id="totem-label">
              {t('chooseTotem')}
            </span>
            <div className="totem-grid" role="radiogroup" aria-labelledby="totem-label">
              {AVATAR_CHOICES.map((a, i) => (
                <button
                  key={a.species}
                  type="button"
                  role="radio"
                  aria-checked={choice === i}
                  className={`totem-card${choice === i ? ' active' : ''}`}
                  onClick={() => setChoice(i)}
                >
                  <SpeciesPortrait id={a.species} />
                  <span>{t(SPECIES_NAME[a.species])}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={slowTimers}
              onChange={(e) => setSettings({ slowTimers: e.target.checked })}
            />
            {t('timeScale')}
          </label>

          <div className="row">
            <button
              type="button"
              className="pixel-btn primary"
              disabled={busy || name.trim().length === 0}
              onClick={guard(() =>
                createRoom(name.trim(), avatar, slowTimers ? { timeScale: 1.5 } : {}),
              )}
            >
              {t('create')}
            </button>
            <button type="button" className="pixel-btn" onClick={() => setScreen('tutorial')}>
              {t('tutorial')}
            </button>
          </div>
        </section>

        <section className="pixel-panel">
          <label className="field">
            <span className="field-label">{t('joinWithCode')}</span>
            <input
              className="pixel-input code-input"
              value={code}
              maxLength={5}
              autoComplete="off"
              aria-label={t('roomCode')}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
            />
          </label>
          <div className="row">
            <button
              type="button"
              className="pixel-btn"
              disabled={busy || name.trim().length === 0 || code.length !== 5}
              onClick={guard(() => joinRoom(name.trim(), avatar, code))}
            >
              {t('join')}
            </button>
          </div>
        </section>
        <InstallButton />
      </main>
    </PixelStage>
  );
}
