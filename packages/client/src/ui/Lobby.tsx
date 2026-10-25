import { useState } from 'react';
import { addBot, configure, startGame } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { assignSpecies } from '../scene/species.js';
import { PixelStage, SpeciesPortrait } from './PixelArt.js';

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
  if (!lobby)
    return (
      <PixelStage>
        <main className="home">
          <section className="pixel-panel">{t('connecting')}</section>
        </main>
      </PixelStage>
    );
  const iAmHost = lobby.seats.find((s) => s.playerId === me)?.host === true;
  const cfg = lobby.config;
  // Mismo reparto de animales que verá la mesa (cada asiento el suyo).
  const species = assignSpecies(lobby.seats.map((s) => s.avatar));

  const num = (key: keyof typeof RANGES, value: number): void => {
    const [min, max] = RANGES[key];
    if (value < min || value > max) return; // config inválida imposible desde la UI
    configure({ [key]: value });
  };

  return (
    <PixelStage>
      <main className="home lobby">
        <section className="pixel-panel">
          <h2 className="panel-title">{t('lobby')}</h2>
          <div className="code-row">
            <code className="code">{lobby.code}</code>
            <button
              type="button"
              className="pixel-btn"
              onClick={() => {
                void globalThis.navigator?.clipboard?.writeText(lobby.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t('copied') : t('copyCode')}
            </button>
          </div>
          <span className="muted small">{t('share')}</span>
        </section>

        <section className="pixel-panel">
          <h3 className="panel-title">{t('seats')}</h3>
          <ul className="seats">
            {lobby.seats.map((s, i) => (
              <li key={s.playerId} className={s.playerId === me ? 'me' : ''}>
                <SpeciesPortrait id={species[i] ?? 'owl'} />
                <span className="seat-name">
                  {s.name}
                  {s.playerId === me ? ` (${t('you')})` : ''}
                </span>
                <span className="seat-tags">
                  {s.host ? <b className="tag host">{t('host')}</b> : null}
                  {s.controller === 'bot' ? <b className="tag">{t('bot')}</b> : null}
                  {!s.connected ? <b className="tag off">{t('disconnected')}</b> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {iAmHost ? (
          <section className="pixel-panel">
            <div className="row">
              <button type="button" className="pixel-btn" onClick={() => addBot('greedy')}>
                {t('addBotGreedy')}
              </button>
              <button type="button" className="pixel-btn" onClick={() => addBot('random')}>
                {t('addBotRandom')}
              </button>
            </div>
            <div className="config-grid">
              <label className="field">
                <span className="field-label">{t('mode')}</span>
                <select
                  className="pixel-input"
                  value={cfg.mode ?? 'classic'}
                  onChange={(e) => configure({ mode: e.target.value as 'quick' | 'classic' })}
                >
                  <option value="classic">{t('modeClassic')}</option>
                  <option value="quick">{t('modeQuick')}</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">{t('turnSeconds')}</span>
                <input
                  className="pixel-input"
                  type="number"
                  min={RANGES.turnSeconds[0]}
                  max={RANGES.turnSeconds[1]}
                  value={cfg.turnSeconds ?? 30}
                  onChange={(e) => num('turnSeconds', Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="field-label">{t('gameEndScore')}</span>
                <input
                  className="pixel-input"
                  type="number"
                  min={RANGES.gameEndScore[0]}
                  max={RANGES.gameEndScore[1]}
                  step={10}
                  value={cfg.gameEndScore ?? 100}
                  onChange={(e) => num('gameEndScore', Number(e.target.value))}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={(cfg.timeScale ?? 1) > 1}
                onChange={(e) => configure({ timeScale: e.target.checked ? 1.5 : 1 })}
              />
              {t('timeScale')}
            </label>
            <div className="row">
              <button
                type="button"
                className="pixel-btn primary"
                disabled={!lobby.canStart}
                onClick={startGame}
              >
                {t('start')}
              </button>
              {!lobby.canStart ? <span className="muted">{t('needTwo')}</span> : null}
            </div>
          </section>
        ) : (
          <section className="pixel-panel">
            <p className="muted">{t('waiting')}</p>
          </section>
        )}
      </main>
    </PixelStage>
  );
}
