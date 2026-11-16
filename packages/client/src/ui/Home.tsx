import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoom, joinRoom } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT, type TKey } from '../i18n/index.js';
import { audio } from '../audio/audio.js';
import { AVATAR_CHOICES } from '../scene/species.js';
import { CODE_ALPHABET, CODE_LENGTH } from '@totem/protocol';
import { Logo, PixelStage } from './PixelArt.js';
import { CharacterCarousel } from './CharacterCarousel.js';
import { CodeBoxes } from './title/CodeBoxes.js';
import { tryImmersive } from './title/immersive.js';

const NAME_MAX = 24;
const NAME_STORAGE_KEY = 'totem.lastName';
const SPECIES_OPTIONS = AVATAR_CHOICES.map((a) => a.species);
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

type Step = 'title' | 'create' | 'join';

type MenuItemProps = {
  id: string;
  label: string;
  sub: string;
  variant: 'primary' | 'secondary';
  onClick: () => void;
  icon: string;
};

/** Entrada grande del menú de título: etiqueta + subtítulo (descripción accesible). */
function MenuItem({ id, label, sub, variant, onClick, icon }: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      data-menu={id}
      className={`pixel-btn menu-item ${variant}`}
      aria-labelledby={`menu-${id}`}
      aria-describedby={`menu-${id}-sub`}
      onClick={onClick}
    >
      <svg viewBox="0 0 8 8" aria-hidden="true" className="menu-icon">
        <path d={icon} />
      </svg>
      <span className="menu-text">
        <span id={`menu-${id}`} className="menu-label">
          {label}
        </span>
        <span id={`menu-${id}-sub`} className="menu-sub">
          {sub}
        </span>
      </span>
    </button>
  );
}

/** Iconos pixel 8×8 (trazos de rectángulos). */
const ICON = {
  play: 'M2 1h1v1h1v1h1v1h1v1H5v1H4v1H3v1H2z',
  join: 'M0 3h4V1h1v1h1v1h1v2H6v1H5v1H4V5H0z',
  book: 'M0 1h3v1h1v5H3V6H0zm5 0h3v5H5v1H4V2h1z',
  gear: 'M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zm0 3v2h2V3z',
} as const;

export function Home({ onOpenSettings }: { onOpenSettings?: () => void }): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const setError = useStore((s) => s.setError);
  const setScreen = useStore((s) => s.setScreen);
  const slowTimers = useSettings((s) => s.slowTimers);
  const setSettings = useSettings((s) => s.set);
  const [step, setStep] = useState<Step>('title');
  const [name, setName] = useState(loadName);
  const [choice, setChoice] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const cameFrom = useRef<Step>('title');
  const avatar = AVATAR_CHOICES[choice]?.avatar ?? 0;
  const trimmed = name.trim();
  const hasName = trimmed.length > 0;
  const canJoin = hasName && code.length === CODE_LENGTH && busy === null;

  // Al cambiar de paso, el foco va donde toca (y vuelve al botón de origen al regresar).
  useEffect(() => {
    if (step === 'title') {
      const prev = cameFrom.current;
      if (prev !== 'title')
        globalThis.document
          ?.querySelector<HTMLElement>(`[data-menu="${prev === 'create' ? 'play' : 'join'}"]`)
          ?.focus();
      return;
    }
    cameFrom.current = step;
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!coarse && !hasName) nameRef.current?.focus();
  }, [step]);

  const open = (next: 'create' | 'join'): void => {
    audio.unlock();
    tryImmersive();
    setStep(next);
  };

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
  const join = (): void => {
    if (!canJoin) return;
    void run('join', () => joinRoom(trimmed, avatar, code));
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (step === 'create') create();
    else join();
  };

  if (step === 'title')
    return (
      <PixelStage className="stage-title">
        <main className="home title-screen">
          <header className="hero">
            <Logo />
            <p className="tagline">{t('tagline')}</p>
          </header>
          <nav className="title-menu" aria-label={t('title')}>
            <MenuItem
              id="play"
              variant="primary"
              icon={ICON.play}
              label={t('menuPlay')}
              sub={t('menuPlaySub')}
              onClick={() => open('create')}
            />
            <MenuItem
              id="join"
              variant="secondary"
              icon={ICON.join}
              label={t('menuJoin')}
              sub={t('menuJoinSub')}
              onClick={() => open('join')}
            />
            <MenuItem
              id="tutorial"
              variant="secondary"
              icon={ICON.book}
              label={t('tutorial')}
              sub={t('menuTutorialSub')}
              onClick={() => setScreen('tutorial')}
            />
            {onOpenSettings ? (
              <button
                type="button"
                className="pixel-btn ghost menu-settings"
                aria-haspopup="dialog"
                onClick={onOpenSettings}
              >
                <svg viewBox="0 0 8 8" aria-hidden="true" className="gear">
                  <path d={ICON.gear} />
                </svg>
                {t('settings')}
              </button>
            ) : null}
          </nav>
        </main>
      </PixelStage>
    );

  const titleKey: TKey = step === 'create' ? 'stepCreate' : 'stepJoin';
  return (
    <PixelStage className="stage-character">
      <main className={`home char-screen ${step}`}>
        <header className="step-head">
          <button
            type="button"
            className="pixel-btn ghost small-btn back-btn"
            onClick={() => setStep('title')}
          >
            <svg viewBox="0 0 6 8" aria-hidden="true">
              <path d="M4 0h2v2H4v1H3v2h1v1h2v2H4V7H3V6H2V5H1V3h1V2h1V1h1z" />
            </svg>
            {t('back')}
          </button>
          <h2 className="step-title">{t(titleKey)}</h2>
        </header>

        <div className="char-layout">
          <section className="pixel-panel char-pick" aria-labelledby="totem-label">
            <span className="field-label sr-only" id="totem-label">
              {t('chooseTotem')}
            </span>
            <CharacterCarousel
              options={SPECIES_OPTIONS}
              value={choice}
              onChange={setChoice}
              t={t}
              labelId="totem-label"
            />
          </section>

          <form className="pixel-panel char-form" onSubmit={submit}>
            <label className="field">
              <span className="field-label">{t('yourName')}</span>
              <input
                ref={nameRef}
                className="pixel-input name-input"
                value={name}
                maxLength={NAME_MAX}
                autoComplete="nickname"
                enterKeyHint={step === 'create' ? 'go' : 'next'}
                placeholder={t('namePlaceholder')}
                aria-describedby="name-hint"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {step === 'join' ? (
              <div className="field">
                <span className="field-label" id="join-label">
                  {t('joinWithCode')}
                </span>
                <CodeBoxes
                  value={code}
                  label={t('roomCode')}
                  describedBy="join-label"
                  onChange={(raw) => setCode(cleanCode(raw))}
                />
                <span className="muted small">{t('codeBoxesHint')}</span>
              </div>
            ) : (
              <label className="check">
                <input
                  type="checkbox"
                  checked={slowTimers}
                  onChange={(e) => setSettings({ slowTimers: e.target.checked })}
                />
                <span>{t('timeScale')}</span>
              </label>
            )}

            <div className="cta-row">
              {step === 'create' ? (
                <button
                  type="submit"
                  className="pixel-btn primary big"
                  disabled={busy !== null || !hasName}
                >
                  {busy === 'create' ? t('connecting') : t('create')}
                </button>
              ) : (
                <button type="submit" className="pixel-btn primary big" disabled={!canJoin}>
                  {busy === 'join' ? t('connecting') : t('join')}
                </button>
              )}
            </div>
            <p id="name-hint" className={`hint${hasName ? ' hidden' : ''}`} aria-live="polite">
              {hasName ? '' : t('nameHint')}
            </p>
          </form>
        </div>
      </main>
    </PixelStage>
  );
}
