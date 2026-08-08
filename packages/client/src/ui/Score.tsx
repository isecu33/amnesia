import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { makeT } from '../i18n/index.js';
import { leave, rematch } from '../net/client.js';

export function Score(): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const big = useSettings((s) => s.bigNumbers);
  const view = useStore((s) => s.view);
  const names = useStore((s) => s.names);
  const reset = useStore((s) => s.reset);
  const lobby = useStore((s) => s.lobby);
  const me = useStore((s) => s.playerId);
  const iAmHost = lobby?.seats.find((s) => s.playerId === me)?.host === true;
  if (!view) return <main className="panel">{t('connecting')}</main>;

  const rows = Object.entries(view.scores).sort((a, b) => a[1].total - b[1].total);
  const winner = rows[0]?.[0];
  const finished = view.phase === 'GAME_END';

  return (
    <main className={`panel${big ? ' big-numbers' : ''}`}>
      <h2>{finished ? t('gameOver') : t('roundOver')}</h2>
      {winner ? (
        <p>
          {t('winner')}: <strong>{names[winner] ?? winner}</strong>
        </p>
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
          {rows.map(([id, sc]) => (
            <tr key={id}>
              <td>{names[id] ?? id}</td>
              <td>{sc.round ?? '—'}</td>
              <td>{sc.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {finished ? (
        <div className="row">
          {iAmHost ? (
            <button onClick={rematch}>{t('rematch')}</button>
          ) : (
            <span className="muted">{t('onlyHostRematch')}</span>
          )}
          <button
            onClick={() => {
              leave();
              reset();
            }}
          >
            {t('backHome')}
          </button>
        </div>
      ) : null}
    </main>
  );
}
