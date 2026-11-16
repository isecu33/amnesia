import type { CSSProperties } from 'react';
import { DEFAULT_CONFIG } from '@totem/core';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT } from '../i18n/index.js';
import { leave, rematch } from '../net/client.js';
import { seatSpecies, type SpeciesId } from '../scene/species.js';
import { PixelStage, SpeciesPortrait } from './PixelArt.js';
import { speciesAccent } from './CharacterCarousel.js';
import { displaySeatName } from './title/bot-name.js';
import { CountUp } from './title/CountUp.js';

/** A partir de esta fracción del límite la barra avisa de peligro. */
const DANGER_RATIO = 0.8;
const PODIUM_SIZE = 3;
/** Orden visual del podio: 2.º · 1.º · 3.º. */
const PODIUM_ORDER = [1, 0, 2] as const;
const COUNT_STAGGER_MS = 120;

export function Score(): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const t = makeT(lang);
  const big = useSettings((s) => s.bigNumbers);
  const view = useStore((s) => s.view);
  const names = useStore((s) => s.names);
  const reset = useStore((s) => s.reset);
  const lobby = useStore((s) => s.lobby);
  const me = useStore((s) => s.playerId);
  const iAmHost = lobby?.seats.find((s) => s.playerId === me)?.host === true;
  if (!view)
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

  const rows = Object.entries(view.scores).sort((a, b) => a[1].total - b[1].total);
  const winner = rows[0]?.[0];
  const finished = view.phase === 'GAME_END';
  const limit = lobby?.config.gameEndScore ?? DEFAULT_CONFIG.gameEndScore;
  // Mismo animal que cada jugador tuvo en la mesa (el reparto sigue el orden de asientos).
  const seats = lobby?.seats ?? [];
  const species = seatSpecies(seats);
  const speciesOf = (id: string): SpeciesId | undefined => {
    const i = seats.findIndex((s) => s.playerId === id);
    return i === -1 ? undefined : species[i];
  };
  const nameOf = (id: string): string => {
    const seat = seats.find((s) => s.playerId === id);
    return seat
      ? displaySeatName({ ...seat, name: names[id] ?? seat.name }, lang)
      : (names[id] ?? id);
  };
  const iWon = winner !== undefined && winner === me;
  const podium = PODIUM_ORDER.flatMap((rank) => {
    const row = rows[rank];
    return row && rank < PODIUM_SIZE ? [{ rank, id: row[0], total: row[1].total }] : [];
  });

  return (
    <PixelStage>
      <main className={`home score-screen${big ? ' big-numbers' : ''}`}>
        <section className="pixel-panel score-panel">
          <h2 className="panel-title">{finished ? t('gameOver') : t('roundOver')}</h2>
          {winner ? (
            <p className={`winner-banner${finished ? ' final' : ''}`}>
              <span className="winner-label">{finished ? t('winner') : t('leading')}</span>
              <strong className="winner-name">{nameOf(winner)}</strong>
              {finished && iWon ? <span className="winner-you">{t('youWon')}</span> : null}
            </p>
          ) : null}
          <ol className="podium" aria-hidden="true">
            {podium.map((p) => {
              const sp = speciesOf(p.id);
              const style = {
                '--accent': sp ? speciesAccent(sp) : 'var(--candle)',
                '--rank': p.rank,
              } as CSSProperties;
              return (
                <li key={p.id} className={`podium-step rank-${p.rank + 1}`} style={style}>
                  <span className="podium-avatar">
                    {p.rank === 0 ? <span className="podium-crown" /> : null}
                    {sp ? <SpeciesPortrait id={sp} /> : <span className="seat-ghost" />}
                  </span>
                  <span className="podium-name">{nameOf(p.id)}</span>
                  <span className="podium-block">
                    <span className="podium-rank">{p.rank + 1}</span>
                    <span className="podium-pts">
                      <CountUp value={p.total} delayMs={p.rank * COUNT_STAGGER_MS} /> {t('points')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="muted small rule-line">{fmt(t('lowestWins'), { n: limit })}</p>
          <table className="scores">
            <thead>
              <tr>
                <th aria-label={t('scores')} />
                <th>{t('round')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, sc], rank) => {
                const sp = speciesOf(id);
                const ratio = Math.min(1, Math.max(0, sc.total / limit));
                const style = {
                  '--fill': ratio,
                  '--row': rank,
                  '--accent': sp ? speciesAccent(sp) : 'var(--mystic)',
                } as CSSProperties;
                const cls = [
                  id === winner ? 'first' : '',
                  id === me ? 'me' : '',
                  ratio >= DANGER_RATIO ? 'at-risk' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={id} className={cls} style={style}>
                    <td>
                      <span className="score-name">
                        <span className="rank">{rank + 1}</span>
                        {sp ? <SpeciesPortrait id={sp} className="mini" /> : null}
                        <span className="score-who">
                          <span>
                            {nameOf(id)}
                            {id === me ? <em className="you-mark"> ({t('you')})</em> : null}
                          </span>
                          <span className="limit-bar" aria-hidden="true" />
                        </span>
                      </span>
                    </td>
                    <td className="delta">
                      {sc.round === undefined ? '—' : sc.round > 0 ? `+${sc.round}` : sc.round}
                    </td>
                    <td className="total">
                      <CountUp value={sc.total} delayMs={rank * COUNT_STAGGER_MS} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {finished ? (
            <div className="cta-row">
              {iAmHost ? (
                <button type="button" className="pixel-btn primary big" onClick={rematch}>
                  {t('rematch')}
                </button>
              ) : (
                <span className="hint">{t('onlyHostRematch')}</span>
              )}
              <button
                type="button"
                className="pixel-btn ghost"
                onClick={() => {
                  leave();
                  reset();
                }}
              >
                {t('backHome')}
              </button>
            </div>
          ) : (
            <p className="waiting-line">
              <span className="spinner" aria-hidden="true" />
              {t('nextRoundSoon')}
            </p>
          )}
        </section>
      </main>
    </PixelStage>
  );
}
