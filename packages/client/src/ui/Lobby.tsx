import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_CONFIG } from '@totem/core';
import { addBot, chooseSpecies, configure, leave, startGame } from '../net/client.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT } from '../i18n/index.js';
import { SPECIES_IDS, seatSpecies } from '../scene/species.js';
import { SPECIES_NAME } from './species-names.js';
import { MAP_IDS, type MapChoice, type MapId } from '@totem/protocol';
import type { TKey } from '../i18n/index.js';
import { PixelStage, SpeciesPortrait, radioArrowKeys } from './PixelArt.js';
import { speciesAccent } from './CharacterCarousel.js';
import { copyText, selectContents } from './title/clipboard.js';
import { displaySeatName } from './title/bot-name.js';

/** Rangos válidos expuestos desde la tabla de docs/01 §9 (los valida también zod). */
const RANGES = {
  turnSeconds: [15, 60],
  initialPeekSeconds: [5, 20],
  gameEndScore: [50, 200],
} as const;

const COPIED_FEEDBACK_MS = 1500;
const COPY_FAILED_MS = 4000;

type CopyState = 'idle' | 'copied' | 'failed';

const MAP_LABEL: Record<MapId, TKey> = {
  'candle-night': 'mapCandleNight',
  'frozen-cave': 'mapFrozenCave',
  'jungle-temple': 'mapJungleTemple',
  'fog-marsh': 'mapFogMarsh',
  'totem-canyon': 'mapTotemCanyon',
};

/** Corona pixel del anfitrión. */
function Crown({ label }: { label: string }): JSX.Element {
  return (
    <svg viewBox="0 0 9 6" className="crown" role="img" aria-label={label}>
      <path d="M0 0h1v1h1v1h1V0h1v1h1V0h1v2h1V1h1V0h1v6H0z" />
    </svg>
  );
}

export function Lobby(): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const t = makeT(lang);
  const lobby = useStore((s) => s.lobby);
  const me = useStore((s) => s.playerId);
  const reset = useStore((s) => s.reset);
  const [copy, setCopy] = useState<CopyState>('idle');
  const codeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (copy === 'idle') return;
    const ms = copy === 'copied' ? COPIED_FEEDBACK_MS : COPY_FAILED_MS;
    const id = setTimeout(() => setCopy('idle'), ms);
    return () => clearTimeout(id);
  }, [copy]);

  if (!lobby)
    return (
      <PixelStage>
        <main className="home">
          <section className="pixel-panel loading-panel" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            {t('connecting')}
          </section>
        </main>
      </PixelStage>
    );
  const iAmHost = lobby.seats.find((s) => s.playerId === me)?.host === true;
  const cfg = lobby.config;
  // Mismo reparto de animales que verá la mesa (cada asiento el suyo).
  const species = seatSpecies(lobby.seats);
  const mySpecies = species[lobby.seats.findIndex((s) => s.playerId === me)];
  const ownerOf = (id: (typeof SPECIES_IDS)[number]): string | undefined => {
    const i = species.indexOf(id);
    const seat = i === -1 ? undefined : lobby.seats[i];
    return seat ? displaySeatName(seat, lang) : undefined;
  };
  const openSeats = Math.max(0, DEFAULT_CONFIG.maxPlayers - lobby.seats.length);
  const roomFull = openSeats === 0;
  const selectable = SPECIES_IDS.map((id) => id === mySpecies || ownerOf(id) === undefined);
  const myIndex = SPECIES_IDS.findIndex((id) => id === mySpecies);

  const mapName = t(
    cfg.mapId && cfg.mapId !== 'random'
      ? MAP_LABEL[cfg.mapId]
      : cfg.mapId
        ? 'mapRandom'
        : MAP_LABEL['candle-night'],
  );
  const turnSeconds = cfg.turnSeconds ?? DEFAULT_CONFIG.turnSeconds;
  const endScore = cfg.gameEndScore ?? DEFAULT_CONFIG.gameEndScore;
  const slow = (cfg.timeScale ?? 1) > 1;

  const num = (key: keyof typeof RANGES, value: number): void => {
    const [min, max] = RANGES[key];
    if (value < min || value > max) return; // config inválida imposible desde la UI
    configure({ [key]: value });
  };

  // Sin permiso o sin API, el código queda seleccionado para copiarlo a mano.
  const copyCode = async (): Promise<void> => {
    const ok = await copyText(lobby.code);
    if (!ok) selectContents(codeRef.current);
    setCopy(ok ? 'copied' : 'failed');
  };

  return (
    <PixelStage>
      <main className="home lobby">
        <div className="lobby-col">
          <section className="pixel-panel room-card">
            <div className="room-head">
              <h2 className="panel-title">{t('lobby')}</h2>
              <button
                type="button"
                className="pixel-btn ghost small-btn"
                onClick={() => {
                  leave();
                  reset();
                }}
              >
                {t('leaveRoom')}
              </button>
            </div>
            <div className={`ticket${copy === 'copied' ? ' copied' : ''}`}>
              <span className="ticket-stub" aria-hidden="true">
                {t('roomCode')}
              </span>
              <code
                className="code"
                ref={codeRef}
                aria-label={t('roomCode')}
                title={t('ticketHint')}
                onClick={() => void copyCode()}
              >
                {lobby.code}
              </code>
              <button
                type="button"
                className={`pixel-btn small-btn ticket-copy${copy === 'copied' ? ' ok' : ''}`}
                onClick={() => void copyCode()}
              >
                {copy === 'copied' ? t('copied') : t('copyCode')}
              </button>
            </div>
            <span
              className={`small share-line${copy === 'failed' ? ' danger' : ' muted'}`}
              aria-live="polite"
            >
              {copy === 'failed' ? t('copyFailed') : t('share')}
            </span>
          </section>

          <section className="pixel-panel seats-panel">
            <div className="room-head">
              <h3 className="panel-title">{t('seats')}</h3>
              <span className="count-chip">
                {fmt(t('playersCount'), {
                  n: lobby.seats.length,
                  max: DEFAULT_CONFIG.maxPlayers,
                })}
              </span>
            </div>
            {/* Encima de la rejilla, de tamaño fijo: añadir un bot no desplaza los botones. */}
            {iAmHost ? (
              <div className="bot-row">
                <span className="field-label">{t('addBots')}</span>
                <button
                  type="button"
                  className="pixel-btn small-btn"
                  disabled={roomFull}
                  onClick={() => addBot('greedy')}
                >
                  {t('addBotGreedy')}
                </button>
                <button
                  type="button"
                  className="pixel-btn small-btn"
                  disabled={roomFull}
                  onClick={() => addBot('random')}
                >
                  {t('addBotRandom')}
                </button>
              </div>
            ) : null}
            <ul className="seats">
              {lobby.seats.map((s, i) => {
                const sp = species[i] ?? 'owl';
                const cls = [
                  'seat-card',
                  s.playerId === me ? 'me' : '',
                  s.connected ? '' : 'offline',
                  s.controller === 'bot' ? 'is-bot' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li
                    key={s.playerId}
                    className={cls}
                    style={{ '--accent': speciesAccent(sp) } as CSSProperties}
                  >
                    {s.host ? <Crown label={t('host')} /> : null}
                    <SpeciesPortrait id={sp} />
                    <span className="seat-name">
                      {displaySeatName(s, lang)}
                      {s.playerId === me ? <em className="you-mark"> ({t('you')})</em> : null}
                    </span>
                    <span className="seat-tags">
                      {s.controller === 'bot' ? <b className="tag bot">{t('bot')}</b> : null}
                      {!s.connected ? <b className="tag off">{t('disconnected')}</b> : null}
                    </span>
                  </li>
                );
              })}
              {Array.from({ length: openSeats }, (_, i) => (
                <li key={`open-${i}`} className="seat-card open">
                  <span className="seat-ghost" aria-hidden="true" />
                  <span className="seat-name">{t('emptySeat')}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="lobby-col">
          {lobby.seats.some((s) => s.playerId === me) ? (
            <section className="pixel-panel">
              <h3 className="panel-title" id="animal-label">
                {t('yourAnimal')}
              </h3>
              <div className="totem-grid" role="radiogroup" aria-labelledby="animal-label">
                {SPECIES_IDS.map((id, i) => {
                  const mine = id === mySpecies;
                  const owner = mine ? undefined : ownerOf(id);
                  const focusable = mine || (myIndex === -1 && i === 0);
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={mine}
                      aria-disabled={owner !== undefined}
                      tabIndex={focusable ? 0 : -1}
                      title={owner ? fmt(t('animalTakenBy'), { name: owner }) : undefined}
                      className={`totem-card${mine ? ' active' : ''}${owner !== undefined ? ' taken' : ''}`}
                      style={{ '--accent': speciesAccent(id) } as CSSProperties}
                      onClick={() => {
                        if (owner === undefined && !mine) chooseSpecies(id);
                      }}
                      onKeyDown={(e) =>
                        radioArrowKeys(e, i, selectable, (n) => {
                          const next = SPECIES_IDS[n];
                          if (next && next !== mySpecies) chooseSpecies(next);
                        })
                      }
                    >
                      <SpeciesPortrait id={id} />
                      <span>{owner !== undefined ? t('animalTaken') : t(SPECIES_NAME[id])}</span>
                      {owner !== undefined ? <small className="owner">{owner}</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {iAmHost ? (
            <section className="pixel-panel">
              <h3 className="panel-title">{t('roomRules')}</h3>
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
                  <span className="field-label">{t('map')}</span>
                  <select
                    className="pixel-input"
                    value={cfg.mapId ?? 'candle-night'}
                    onChange={(e) => configure({ mapId: e.target.value as MapChoice })}
                  >
                    {MAP_IDS.map((id) => (
                      <option key={id} value={id}>
                        {t(MAP_LABEL[id])}
                      </option>
                    ))}
                    <option value="random">{t('mapRandom')}</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{t('turnSeconds')}</span>
                  <input
                    className="pixel-input"
                    type="number"
                    min={RANGES.turnSeconds[0]}
                    max={RANGES.turnSeconds[1]}
                    value={turnSeconds}
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
                    value={endScore}
                    onChange={(e) => num('gameEndScore', Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={slow}
                  onChange={(e) => configure({ timeScale: e.target.checked ? 1.5 : 1 })}
                />
                <span>{t('timeScale')}</span>
              </label>
              <div className="start-block">
                <button
                  type="button"
                  className="pixel-btn primary big"
                  disabled={!lobby.canStart}
                  aria-describedby="start-hint"
                  onClick={startGame}
                >
                  {t('start')}
                </button>
                <span id="start-hint" className={lobby.canStart ? 'hint ok' : 'hint'}>
                  {lobby.canStart ? t('readyToStart') : t('needTwo')}
                </span>
              </div>
            </section>
          ) : (
            <section className="pixel-panel">
              <h3 className="panel-title">{t('roomRules')}</h3>
              <dl className="rules-summary">
                <dt>{t('mode')}</dt>
                <dd>{t(cfg.mode === 'quick' ? 'modeQuick' : 'modeClassic')}</dd>
                <dt>{t('map')}</dt>
                <dd>{mapName}</dd>
                <dt>{t('turnSeconds')}</dt>
                <dd>{turnSeconds}</dd>
                <dt>{t('gameEndScore')}</dt>
                <dd>{endScore}</dd>
                {slow ? (
                  <>
                    <dt>{t('timeScale')}</dt>
                    <dd>✓</dd>
                  </>
                ) : null}
              </dl>
              <p className="waiting-line" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                {t('waiting')}
              </p>
            </section>
          )}
        </div>
      </main>
    </PixelStage>
  );
}
