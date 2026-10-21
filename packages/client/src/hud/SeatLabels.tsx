import { useEffect, useRef } from 'react';
import type { PlayerView } from '@totem/core';
import type { World } from '../scene/world.js';
import { useStore } from '../state/store.js';
import { EMOTES } from './EmoteWheel.js';

/**
 * Nombre + nº de tótems sobre cada rival (docs/01 §11). DOM nítido sobre el
 * render pixel: legible a cualquier resolución interna. La posición se actualiza
 * cada frame sin pasar por React.
 */
export function SeatLabels({
  world,
  view,
  names,
}: {
  world: World | undefined;
  view: PlayerView;
  names: Record<string, string>;
}): JSX.Element {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const emotes = useStore((s) => s.emotes);

  useEffect(() => {
    if (!world) return undefined;
    let raf = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      for (const l of world.seatLabels()) {
        const el = refs.current.get(l.id);
        if (!el) continue;
        el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, -100%)`;
        el.style.opacity = l.onScreen ? '1' : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  return (
    <div className="seat-labels" aria-hidden="true">
      {view.others.map((o) => {
        const active = view.activePlayer === o.id;
        const emote = emotes.filter((e) => e.player === o.id).slice(-1)[0];
        return (
          <div
            key={o.id}
            ref={(el) => {
              if (el) refs.current.set(o.id, el);
              else refs.current.delete(o.id);
            }}
            className={`seat-label${active ? ' active' : ''}${o.sealed ? ' sealed' : ''}`}
          >
            {emote ? <span className="seat-emote">{EMOTES[emote.emote]?.glyph}</span> : null}
            <span className="seat-name">{names[o.id] ?? o.id}</span>
            <span className="seat-count">{o.slots.filter((s) => s === 'hidden').length}</span>
          </div>
        );
      })}
    </div>
  );
}
