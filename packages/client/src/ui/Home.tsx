import { useState } from 'react';
import { createRoom, joinRoom } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { audio } from '../audio/audio.js';

const AVATARS = ['🦉', '🦊', '🐍', '🐗', '🐢', '🐇', '🦌', '🐐', '🐭', '✨', '🌙', '🔥'];

export function Home(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const setError = useStore((s) => s.setError);
  const setScreen = useStore((s) => s.setScreen);
  const slowTimers = useSettings((s) => s.slowTimers);
  const setSettings = useSettings((s) => s.set);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

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
    <main className="panel">
      <label>
        {t('yourName')}
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="avatars" role="radiogroup" aria-label={t('avatar')}>
        {AVATARS.map((a, i) => (
          <button
            key={a}
            role="radio"
            aria-checked={avatar === i}
            className={avatar === i ? 'active' : ''}
            onClick={() => setAvatar(i)}
          >
            {a}
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={slowTimers}
          onChange={(e) => setSettings({ slowTimers: e.target.checked })}
        />
        {t('timeScale')}
      </label>
      <div className="row">
        <button
          disabled={busy || name.trim().length === 0}
          onClick={guard(() =>
            createRoom(name.trim(), avatar, slowTimers ? { timeScale: 1.5 } : {}),
          )}
        >
          {t('create')}
        </button>
        <button onClick={() => setScreen('tutorial')}>{t('tutorial')}</button>
      </div>
      <hr />
      <label>
        {t('roomCode')}
        <input
          value={code}
          maxLength={5}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCDE"
        />
      </label>
      <div className="row">
        <button
          disabled={busy || name.trim().length === 0 || code.length !== 5}
          onClick={guard(() => joinRoom(name.trim(), avatar, code))}
        >
          {t('join')}
        </button>
      </div>
    </main>
  );
}
