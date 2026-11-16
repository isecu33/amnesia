/**
 * Movimiento reducido (docs/01 §11): manda el ajuste propio del juego O la
 * preferencia del sistema. Todo lo animado de los menús consulta esto.
 */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../settings/store.js';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPrefersReduced(): boolean {
  try {
    return globalThis.matchMedia?.(QUERY).matches ?? false;
  } catch {
    return false;
  }
}

export function useReducedMotion(): boolean {
  const own = useSettings((s) => s.reducedMotion);
  const [system, setSystem] = useState(systemPrefersReduced);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(QUERY);
    if (!mq) return;
    const on = (): void => setSystem(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return own || system;
}

/**
 * Bucle rAF limitado a `fps` y en pausa con la pestaña oculta. `draw` recibe los
 * ms transcurridos desde que arrancó. Sin rAF (jsdom) o con `enabled=false`, no corre.
 */
export function useFrameLoop(draw: (t: number) => void, fps: number, enabled: boolean): void {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const raf = globalThis.requestAnimationFrame;
    if (!enabled || typeof raf !== 'function') return;
    const minDt = 1000 / fps;
    let id = 0;
    let last = -Infinity;
    let start: number | undefined;
    const tick = (now: number): void => {
      id = raf(tick);
      if (globalThis.document?.hidden) return;
      start ??= now;
      if (now - last < minDt) return;
      last = now;
      drawRef.current(now - start);
    };
    id = raf(tick);
    return () => globalThis.cancelAnimationFrame?.(id);
  }, [fps, enabled]);
}
