import { useEffect, useRef } from 'react';
import { EMOTE_ICON_SIZE, emoteIconRects } from './emote-icons.js';

/** Icono pixel de una reacción (D-045), ampliado sin suavizado por CSS. */
export function EmoteIcon({ id, className = '' }: { id: number; className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !c) return; // sin canvas (jsdom) el resto de la pantalla sigue funcionando
    canvas.width = EMOTE_ICON_SIZE;
    canvas.height = EMOTE_ICON_SIZE;
    c.clearRect(0, 0, EMOTE_ICON_SIZE, EMOTE_ICON_SIZE);
    for (const r of emoteIconRects(id)) {
      c.fillStyle = r.color;
      c.fillRect(r.x, r.y, r.w, r.h);
    }
  }, [id]);
  return <canvas ref={ref} className={`emote-icon ${className}`} aria-hidden="true" />;
}
