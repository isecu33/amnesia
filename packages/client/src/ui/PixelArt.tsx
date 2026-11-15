import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { BACKDROP_H, BACKDROP_W, paintBackdrop } from '../scene/backdrop.js';
import { LOGO_TEXT, PORTRAIT_SIZE, drawLogo, drawPortrait, logoBitmap } from '../scene/portrait.js';
import type { SpeciesId } from '../scene/species.js';

/** Hook mínimo: pinta en un canvas diminuto una vez (o cuando cambian las dependencias). */
function usePaint(
  width: number,
  height: number,
  paint: (c: CanvasRenderingContext2D) => void,
  deps: unknown[],
): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !c) return; // sin canvas (tests en jsdom) el resto de la pantalla sigue funcionando
    canvas.width = width;
    canvas.height = height;
    paint(c);
  }, deps);
  return ref;
}

/** Retrato pixel de un animal totémico, ampliado sin suavizado. */
export function SpeciesPortrait({
  id,
  className = '',
}: {
  id: SpeciesId;
  className?: string;
}): JSX.Element {
  const ref = usePaint(PORTRAIT_SIZE, PORTRAIT_SIZE, (c) => drawPortrait(c, id), [id]);
  return <canvas ref={ref} className={`portrait ${className}`} aria-hidden="true" />;
}

/** Logo «TÓTEM» en letras de bitmap. */
export function Logo(): JSX.Element {
  const b = logoBitmap();
  const ref = usePaint(
    b.width + 1,
    b.height + 1,
    (c) => drawLogo(c, { fill: '#f2e8d5', shadow: '#7a4a1e' }),
    [],
  );
  return (
    <h1 className="logo">
      <canvas ref={ref} className="logo-canvas" aria-hidden="true" />
      <span className="sr-only">{LOGO_TEXT}</span>
    </h1>
  );
}

/** Escenario de las pantallas previas a la partida: fondo nocturno + contenido centrado. */
export function PixelStage({ children }: { children: ReactNode }): JSX.Element {
  const ref = usePaint(BACKDROP_W, BACKDROP_H, (c) => paintBackdrop(c), []);
  return (
    <div className="stage">
      <canvas ref={ref} className="backdrop" aria-hidden="true" />
      <div className="stage-content">{children}</div>
    </div>
  );
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Teclado de un `radiogroup` de botones (patrón WAI-ARIA): las flechas mueven la
 * selección entre las opciones habilitadas y llevan el foco a la nueva.
 * `enabled[i]` = la opción i se puede elegir.
 */
export function radioArrowKeys(
  e: KeyboardEvent<HTMLElement>,
  current: number,
  enabled: readonly boolean[],
  select: (i: number) => void,
): void {
  const step = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
  if (step === 0 || enabled.length === 0) return;
  e.preventDefault();
  const n = enabled.length;
  for (let k = 1; k <= n; k++) {
    const i = (((current + step * k) % n) + n) % n;
    if (!enabled[i]) continue;
    select(i);
    const group = e.currentTarget.closest('[role="radiogroup"]');
    const target = group?.querySelectorAll<HTMLElement>('[role="radio"]')[i];
    target?.focus();
    return;
  }
}
