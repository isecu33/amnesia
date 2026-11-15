import { useEffect, useRef } from 'react';
import type { PlayerView } from '@totem/core';
import type { World } from '../scene/world.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { resolveName } from '../state/subtitles.js';
import { EmoteIcon } from './EmoteIcon.js';
import { avoidBottom, type Box } from './seat-avoid.js';

/** Las placas no suben de aquí: así nunca quedan bajo el temporizador central. */
const SEAT_LABEL_MIN_Y_PX = 100;
/** Cada cuánto se retiran los emotes caducados (D-045: visibles ~1,2 s). */
const EMOTE_EXPIRE_TICK_MS = 200;
/** Fracción del hueco que recorre la etiqueta por frame al esquivar la placa. */
const SEAT_AVOID_EASE = 0.25;

/** Zona de la placa de turno (con instrucción y última jugada) relativa a la mesa. */
function plateBox(root: HTMLElement | null): Box | undefined {
  const plate = root?.parentElement?.querySelector('.turn-plate-wrap');
  if (!root || !plate) return undefined;
  const o = root.getBoundingClientRect();
  const r = plate.getBoundingClientRect();
  if (r.width === 0) return undefined;
  return {
    left: r.left - o.left,
    top: r.top - o.top,
    right: r.right - o.left,
    bottom: r.bottom - o.top,
  };
}

/**
 * Nombre + nº de tótems sobre cada rival (docs/01 §11). DOM nítido sobre el
 * render pixel: legible a cualquier resolución interna. La posición se actualiza
 * cada frame sin pasar por React.
 */
export function SeatLabels({
  world,
  view,
  names,
  targetRival,
}: {
  world: World | undefined;
  view: PlayerView;
  names: Record<string, string>;
  targetRival?: string | undefined;
}): JSX.Element {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const rootRef = useRef<HTMLDivElement>(null);
  const emotes = useStore((s) => s.emotes);
  const expireEmotes = useStore((s) => s.expireEmotes);
  const seats = useStore((s) => s.lobby?.seats);
  const lang = useSettings((s) => s.lang);

  useEffect(() => {
    if (emotes.length === 0) return undefined;
    const id = setInterval(() => expireEmotes(Date.now()), EMOTE_EXPIRE_TICK_MS);
    return () => clearInterval(id);
  }, [emotes.length, expireEmotes]);

  useEffect(() => {
    if (!world) return undefined;
    let raf = 0;
    const shown = new Map<string, number>();
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const avoid = plateBox(rootRef.current);
      for (const l of world.seatLabels()) {
        const el = refs.current.get(l.id);
        if (!el) continue;
        const base = Math.max(l.y, SEAT_LABEL_MIN_Y_PX);
        const target = avoidBottom(l.x, base, el.offsetWidth, el.offsetHeight, avoid);
        // Suavizado: la placa crece/encoge con la instrucción; la etiqueta no debe saltar.
        const prev = shown.get(l.id) ?? target;
        const y = Math.abs(target - prev) < 0.5 ? target : prev + (target - prev) * SEAT_AVOID_EASE;
        shown.set(l.id, y);
        el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
        el.style.opacity = l.onScreen ? '1' : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  return (
    <div className="seat-labels" aria-hidden="true" ref={rootRef}>
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
            className={`seat-label${active ? ' active' : ''}${o.sealed ? ' sealed' : ''}${targetRival === o.id ? ' targeted' : ''}`}
          >
            {emote ? (
              <span key={emote.id} className="seat-emote">
                <EmoteIcon id={emote.emote} />
              </span>
            ) : null}
            <span className="seat-name">{resolveName(o.id, names, seats, lang)}</span>
            <span className="seat-count">{o.slots.filter((s) => s === 'hidden').length}</span>
          </div>
        );
      })}
    </div>
  );
}
