import { useState } from 'react';
import { addBot, configure, startGame } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';

/** Rangos válidos expuestos desde la tabla de docs/01 §9 (los valida también zod). */
const RANGES = {
  turnSeconds: [15, 60],
  initialPeekSeconds: [5, 20],
  gameEndScore: [50, 200],
} as const;

export function Lobby(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const lobby = useStore((s) => s.lobby);
  const me = useStore((s) => s.playerId);
  const [copied, setCopied] = useState(false);
  if (!lobby) return <main className="panel">{t('connecting')}</main>;
  const iAmHost = lobby.seats.find((s) => s.playerId === me)?.host === true;
  const cfg = lobby.config;

  const num = (key: keyof typeof RANGES, value: number): void => {
    const [min, max] = RANGES[key];
    if (value < min || value > max) return; // config inválida imposible desde la UI
    configure({ [key]: value });
  };

  return (
    <main className="panel">
      <h2>
        {t('lobby')} <code className="code">{lobby.code}</code>
      </h2>
      <div className="row">
        <span className="muted">{t('share')}</span>
        <button
          onClick={() => {
            void globalThis.navigator?.clipboard?.writeText(lobby.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t('copied') : t('copyCode')}
        </button>
      </div>
      <h3>{t('seats')}</h3>
      <ul className="seats">
        {lobby.seats.map((s) => (
          <li key={s.playerId}>
            {s.name}
            {s.playerId === me ? ` (${t('you')})` : ''}
            {s.host ? ` · ${t('host')}` : ''}
            {s.controller === 'bot' ? ` · ${t('bot')}` : ''}
            {!s.connected ? ` · ${t('disconnected')}` : ''}
          </li>
        ))}
      </ul>
      {iAmHost ? (
        <>
          <div className="row">
            <button onClick={() => addBot('greedy')}>{t('addBotGreedy')}</button>
            <button onClick={() => addBot('random')}>{t('addBotRandom')}</button>
          </div>
          <div className="row">
            <label>
              {t('mode')}
              <select
                value={cfg.mode ?? 'classic'}
                onChange={(e) => configure({ mode: e.target.value as 'quick' | 'classic' })}
              >
                <option value="classic">{t('modeClassic')}</option>
                <option value="quick">{t('modeQuick')}</option>
              </select>
            </label>
            <label>
              {t('turnSeconds')}
              <input
                type="number"
                min={RANGES.turnSeconds[0]}
                max={RANGES.turnSeconds[1]}
                value={cfg.turnSeconds ?? 30}
                onChange={(e) => num('turnSeconds', Number(e.target.value))}
              />
            </label>
            <label>
              {t('gameEndScore')}
              <input
                type="number"
                min={RANGES.gameEndScore[0]}
                max={RANGES.gameEndScore[1]}
                step={10}
                value={cfg.gameEndScore ?? 100}
                onChange={(e) => num('gameEndScore', Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={(cfg.timeScale ?? 1) > 1}
                onChange={(e) => configure({ timeScale: e.target.checked ? 1.5 : 1 })}
              />
              {t('timeScale')}
            </label>
          </div>
          <div className="row">
            <button disabled={!lobby.canStart} onClick={startGame}>
              {t('start')}
            </button>
            {!lobby.canStart ? <span className="muted">{t('needTwo')}</span> : null}
          </div>
        </>
      ) : (
        <p className="muted">{t('waiting')}</p>
      )}
    </main>
  );
}
