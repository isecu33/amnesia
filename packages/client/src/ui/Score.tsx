import type { CSSProperties } from 'react';
import { DEFAULT_CONFIG } from '@totem/core';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT } from '../i18n/index.js';
import { leave, rematch } from '../net/client.js';
import { seatSpecies } from '../scene/species.js';
import { PixelStage, SpeciesPortrait } from './PixelArt.js';

/** A partir de esta fracción del límite la barra avisa de peligro. */
const DANGER_RATIO = 0.8;

export function Score(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
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
  const speciesOf = (id: string): (typeof species)[number] | undefined => {
    const i = seats.findIndex((s) => s.playerId === id);
    return i === -1 ? undefined : species[i];
  };
  const winnerSpecies = winner ? speciesOf(winner) : undefined;
  const nameOf = (id: string): string => names[id] ?? id;
  const iWon = winner !== undefined && winner === me;

  return (
    <PixelStage>
      <main className={`home score-screen${big ? ' big-numbers' : ''}`}>
        <section className="pixel-panel">
          <h2 className="panel-title">{finished ? t('gameOver') : t('roundOver')}</h2>
          {winner ? (
            <div className={`winner${finished ? ' final' : ''}`}>
              {winnerSpecies ? (
                <span className="winner-portrait">
                  <SpeciesPortrait id={winnerSpecies} />
                </span>
              ) : null}
              <div className="winner-text">
                <p className="winner-label">{finished ? t('winner') : t('leading')}</p>
                <p className="winner-name">
                  <strong>{nameOf(winner)}</strong>
                </p>
                {finished && iWon ? <p className="winner-you">{t('youWon')}</p> : null}
              </div>
            </div>
          ) : null}
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
                const barStyle = { '--fill': ratio } as CSSProperties;
                const cls = [
                  id === winner ? 'first' : '',
                  id === me ? 'me' : '',
                  ratio >= DANGER_RATIO ? 'at-risk' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={id} className={cls}>
                    <td>
                      <span className="score-name">
                        <span className="rank">{rank + 1}</span>
                        {sp ? <SpeciesPortrait id={sp} className="mini" /> : null}
                        <span className="score-who">
                          <span>
                            {nameOf(id)}
                            {id === me ? <em className="you-mark"> ({t('you')})</em> : null}
                          </span>
                          <span className="limit-bar" style={barStyle} aria-hidden="true" />
                        </span>
                      </span>
                    </td>
                    <td className="delta">
                      {sc.round === undefined ? '—' : sc.round > 0 ? `+${sc.round}` : sc.round}
                    </td>
                    <td className="total">{sc.total}</td>
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
