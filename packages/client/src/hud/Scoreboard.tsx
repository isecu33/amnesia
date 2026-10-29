import { useEffect } from 'react';
import type { PlayerView } from '@totem/core';
import { useSettings } from '../settings/store.js';
import { useStore } from '../state/store.js';
import { makeT } from '../i18n/index.js';
import { EmoteIcon } from './EmoteIcon.js';

/** Marcador tallado en el borde de la mesa (docs/01 §11). */
export function Scoreboard({
  view,
  names,
}: {
  view: PlayerView;
  names: Record<string, string>;
}): JSX.Element {
  const t = makeT(useSettings((s) => s.lang));
  const big = useSettings((s) => s.bigNumbers);
  const emotes = useStore((s) => s.emotes);
  const expireEmotes = useStore((s) => s.expireEmotes);
  const rows = [view.you.id, ...view.others.map((o) => o.id)];

  useEffect(() => {
    if (emotes.length === 0) return;
    const id = setInterval(() => expireEmotes(Date.now()), 200);
    return () => clearInterval(id);
  }, [emotes.length, expireEmotes]);
  return (
    <div className={`scoreboard${big ? ' big' : ''}`} aria-label={t('scores')}>
      {rows.map((id) => {
        const isYou = id === view.you.id;
        const other = view.others.find((o) => o.id === id);
        const active = view.activePlayer === id;
        return (
          <div
            key={id}
            className={`plate${active ? ' active' : ''}${other?.sealed || (isYou && view.you.sealed) ? ' sealed' : ''}`}
          >
            <span className="plate-name">{names[id] ?? id}</span>
            <span className="plate-slots">
              {(isYou ? view.you.slots : (other?.slots ?? [])).filter((s) => s === 'hidden').length}
            </span>
            <span className="plate-score">{view.scores[id]?.total ?? 0}</span>
            {emotes
              .filter((e) => e.player === id)
              .slice(-1)
              .map((e) => (
                <span key={e.id} className="plate-emote" aria-label={t('emotes')}>
                  <EmoteIcon id={e.emote} />
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}
