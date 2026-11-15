import { useState, type FormEvent } from 'react';
import { createRoom, joinRoom } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { audio } from '../audio/audio.js';
import { AVATAR_CHOICES } from '../scene/species.js';
import { CODE_ALPHABET, CODE_LENGTH } from '@totem/protocol';
import { SPECIES_NAME } from './species-names.js';
import { Logo, PixelStage, SpeciesPortrait, radioArrowKeys } from './PixelArt.js';

const NAME_MAX = 24;
const NAME_STORAGE_KEY = 'totem.lastName';
const ALL_ENABLED = AVATAR_CHOICES.map(() => true);
/** Solo letras del alfabeto de códigos de sala (sin I, L, O: evitan confusiones). */
const cleanCode = (raw: string): string =>
  [...raw.toUpperCase()]
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LENGTH);

/** Recuerda el último nombre (comodidad local; sin almacenamiento el juego sigue igual). */
function loadName(): string {
  try {
    return globalThis.localStorage?.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(name: string): void {
  try {
    globalThis.localStorage?.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // modo privado o almacenamiento bloqueado: no es crítico
  }
}

export function Home(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const setError = useStore((s) => s.setError);
  const setScreen = useStore((s) => s.setScreen);
  const slowTimers = useSettings((s) => s.slowTimers);
  const setSettings = useSettings((s) => s.set);
  const [name, setName] = useState(loadName);
  const [choice, setChoice] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const avatar = AVATAR_CHOICES[choice]?.avatar ?? 0;
  const trimmed = name.trim();
  const hasName = trimmed.length > 0;
  const canJoin = hasName && code.length === CODE_LENGTH && busy === null;

  const run = async (kind: 'create' | 'join', fn: () => Promise<unknown>): Promise<void> => {
    audio.unlock();
    setError(undefined);
    setBusy(kind);
    saveName(trimmed);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const create = (): void => {
    if (!hasName || busy !== null) return;
    void run('create', () => createRoom(trimmed, avatar, slowTimers ? { timeScale: 1.5 } : {}));
  };
  const join = (e?: FormEvent): void => {
    e?.preventDefault();
    if (!canJoin) return;
    void run('join', () => joinRoom(trimmed, avatar, code));
  };

  return (
    <PixelStage>
      <main className="home home-main">
        <header className="hero">
          <Logo />
          <p className="tagline">{t('tagline')}</p>
        </header>

        <form
          className="pixel-panel panel-hero"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <label className="field">
            <span className="field-label">{t('yourName')}</span>
            <input
              className="pixel-input name-input"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              placeholder={t('namePlaceholder')}
              aria-describedby="name-hint"
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
                  tabIndex={choice === i ? 0 : -1}
                  className={`totem-card${choice === i ? ' active' : ''}`}
                  onClick={() => setChoice(i)}
                  onKeyDown={(e) => radioArrowKeys(e, choice, ALL_ENABLED, setChoice)}
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
            <span>{t('timeScale')}</span>
          </label>

          <div className="cta-row">
            <button
              type="submit"
              className="pixel-btn primary big"
              disabled={busy !== null || !hasName}
            >
              {busy === 'create' ? t('connecting') : t('create')}
            </button>
            <button type="button" className="pixel-btn ghost" onClick={() => setScreen('tutorial')}>
              {t('tutorial')}
            </button>
          </div>
          <p id="name-hint" className={`hint${hasName ? ' hidden' : ''}`} aria-live="polite">
            {hasName ? '' : t('nameHint')}
          </p>
        </form>

        <form className="pixel-panel panel-join" onSubmit={join}>
          <div className="field">
            <span className="field-label" id="join-label">
              {t('joinWithCode')}
            </span>
            <div className="join-row">
              <input
                className="pixel-input code-input"
                value={code}
                maxLength={CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={t('roomCode')}
                aria-describedby="join-label"
                onChange={(e) => setCode(cleanCode(e.target.value))}
                placeholder="ABCDE"
              />
              <button type="submit" className="pixel-btn" disabled={!canJoin}>
                {busy === 'join' ? t('connecting') : t('join')}
              </button>
            </div>
          </div>
        </form>
      </main>
    </PixelStage>
  );
}
