import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { leave, rematch } from '../net/client.js';
import { assignSpecies } from '../scene/species.js';
import { PixelStage, SpeciesPortrait } from './PixelArt.js';

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
          <section className="pixel-panel">{t('connecting')}</section>
        </main>
      </PixelStage>
    );

  const rows = Object.entries(view.scores).sort((a, b) => a[1].total - b[1].total);
  const winner = rows[0]?.[0];
  const finished = view.phase === 'GAME_END';
  // Mismo animal que cada jugador tuvo en la mesa (el reparto sigue el orden de asientos).
  const seats = lobby?.seats ?? [];
  const species = assignSpecies(seats.map((s) => s.avatar));
  const speciesOf = (id: string): (typeof species)[number] | undefined => {
    const i = seats.findIndex((s) => s.playerId === id);
    return i === -1 ? undefined : species[i];
  };
  const winnerSpecies = winner ? speciesOf(winner) : undefined;

  return (
    <PixelStage>
      <main className={`home${big ? ' big-numbers' : ''}`}>
        <section className="pixel-panel">
          <h2 className="panel-title">{finished ? t('gameOver') : t('roundOver')}</h2>
          {winner ? (
            <div className="winner">
              {winnerSpecies ? <SpeciesPortrait id={winnerSpecies} /> : null}
              <p>
                {t('winner')}: <strong>{names[winner] ?? winner}</strong>
              </p>
            </div>
          ) : null}
          <table className="scores">
            <thead>
              <tr>
                <th aria-label={t('scores')} />
                <th>{t('round')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, sc]) => {
                const sp = speciesOf(id);
                return (
                  <tr key={id} className={id === winner ? 'first' : ''}>
                    <td>
                      <span className="score-name">
                        {sp ? <SpeciesPortrait id={sp} className="mini" /> : null}
                        {names[id] ?? id}
                      </span>
                    </td>
                    <td>{sc.round ?? '—'}</td>
                    <td>{sc.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {finished ? (
            <div className="row">
              {iAmHost ? (
                <button type="button" className="pixel-btn primary" onClick={rematch}>
                  {t('rematch')}
                </button>
              ) : (
                <span className="muted">{t('onlyHostRematch')}</span>
              )}
              <button
                type="button"
                className="pixel-btn"
                onClick={() => {
                  leave();
                  reset();
                }}
              >
                {t('backHome')}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </PixelStage>
  );
}
