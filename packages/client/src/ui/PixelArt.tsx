import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  BACKDROP_H,
  BACKDROP_LAYERS,
  BACKDROP_W,
  FX_STEP_MS,
  paintLayer,
} from '../scene/backdrop.js';
import {
  LOGO_TEXT,
  PORTRAIT_SIZE,
  drawLogoFrame,
  drawPortrait,
  logoFrameSize,
  type LogoColors,
} from '../scene/portrait.js';
import { PALETTE } from '../scene/palette.js';
import { shade } from '../scene/pixel.js';
import type { SpeciesId } from '../scene/species.js';
import { useFrameLoop, useReducedMotion } from './title/motion.js';

/** Hook mínimo: pinta en un canvas diminuto una vez (o cuando cambian las dependencias). */
function usePaint(
  width: number,
  height: number,
  paint: (c: CanvasRenderingContext2D) => void,
  deps: unknown[],
): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = context(ref.current, width, height);
    if (c) paint(c);
  }, deps);
  return ref;
}

const NO_2D = new WeakSet<HTMLCanvasElement>();

/** Contexto 2D dimensionado; `undefined` sin canvas (jsdom): la pantalla sigue funcionando. */
function context(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
): CanvasRenderingContext2D | undefined {
  if (!canvas || NO_2D.has(canvas)) return undefined;
  const c = canvas.getContext('2d');
  if (!c) {
    NO_2D.add(canvas); // no reintentar en cada fotograma
    return undefined;
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return c;
}

/** Retrato pixel de un animal totémico, ampliado sin suavizado. */
export function SpeciesPortrait({
  id,
  className = '',
  blink = false,
}: {
  id: SpeciesId;
  className?: string;
  blink?: boolean;
}): JSX.Element {
  const ref = usePaint(PORTRAIT_SIZE, PORTRAIT_SIZE, (c) => drawPortrait(c, id, { blink }), [
    id,
    blink,
  ]);
  return <canvas ref={ref} className={`portrait ${className}`} aria-hidden="true" />;
}

const LOGO_COLORS: LogoColors = {
  fill: PALETTE.ivory,
  warm: shade(PALETTE.candle, 1.12),
  outline: shade(PALETTE.bg, 0.5),
  shadow: shade(PALETTE.woodDark, 0.8),
  shine: 0xffffff,
  flame: PALETTE.candle,
  flameCore: 0xfff0c0,
};
const LOGO_FPS = 24;
/** Tras la entrada, el logo queda fijo si hay movimiento reducido. */
const LOGO_SETTLED_MS = 5000;

/** Logo «TÓTEM» animado: entrada letra a letra, ola, brillo y llama en la tilde. */
export function Logo(): JSX.Element {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = logoFrameSize();
  const draw = (t: number): void => {
    const c = context(ref.current, width, height);
    if (c) drawLogoFrame(c, t, LOGO_COLORS);
  };
  useEffect(() => {
    if (reduced) draw(LOGO_SETTLED_MS);
  }, [reduced]);
  useFrameLoop(draw, LOGO_FPS, !reduced);
  return (
    <h1 className="logo">
      <canvas ref={ref} className="logo-canvas" aria-hidden="true" />
      <span className="sr-only">{LOGO_TEXT}</span>
    </h1>
  );
}

/** Desplazamiento máximo del parallax, en píxeles del fondo (no de pantalla). */
const PARALLAX_X = 6;
const PARALLAX_Y = 3;
const STAGE_FPS = 30;
const POINTER_EASE = 0.12;
/** Deriva lenta en táctil (sin sensores): un lazo cada ~50 s. */
const DRIFT_SPEED = 0.00012;
/** Los lienzos son un 8 % más grandes que la pantalla para que el parallax no enseñe bordes. */
const OVERSCAN = 1.08;

/**
 * Escenario de las pantallas previas a la partida: fondo nocturno por capas con
 * parallax (puntero en escritorio, deriva lenta en táctil) + contenido centrado.
 */
export function PixelStage({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const lastStep = useRef(-1);

  // Capas estáticas una vez; las animadas en su fotograma 0 (estado de movimiento reducido).
  useEffect(() => {
    BACKDROP_LAYERS.forEach((l, i) => {
      const c = context(layerRefs.current[i] ?? null, BACKDROP_W, BACKDROP_H);
      if (c) paintLayer(c, l.id, 0);
    });
    lastStep.current = 0;
  }, []);

  useEffect(() => {
    if (reduced) {
      layerRefs.current.forEach((el) => el && (el.style.transform = ''));
      return;
    }
    const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (coarse) return;
    const onMove = (e: PointerEvent): void => {
      const w = globalThis.innerWidth || 1;
      const h = globalThis.innerHeight || 1;
      target.current = { x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 };
    };
    globalThis.addEventListener('pointermove', onMove, { passive: true });
    return () => globalThis.removeEventListener('pointermove', onMove);
  }, [reduced]);

  // Se consulta una vez por montaje, no en cada frame.
  const coarsePointer = useRef(globalThis.matchMedia?.('(pointer: coarse)').matches ?? false);
  useFrameLoop(
    (t) => {
      if (coarsePointer.current)
        target.current = {
          x: Math.sin(t * DRIFT_SPEED),
          y: Math.cos(t * DRIFT_SPEED * 0.7) * 0.5,
        };
      pos.current = {
        x: pos.current.x + (target.current.x - pos.current.x) * POINTER_EASE,
        y: pos.current.y + (target.current.y - pos.current.y) * POINTER_EASE,
      };
      const root = rootRef.current;
      const unit = root ? (root.clientWidth * OVERSCAN) / BACKDROP_W : 1;
      const step = Math.floor(t / FX_STEP_MS);
      const repaint = step !== lastStep.current;
      lastStep.current = step;
      BACKDROP_LAYERS.forEach((l, i) => {
        const el = layerRefs.current[i];
        if (!el) return;
        // a saltos de píxel del fondo: el parallax también es pixel-art
        const dx = Math.round(-pos.current.x * PARALLAX_X * l.depth) * unit;
        const dy = Math.round(-pos.current.y * PARALLAX_Y * l.depth) * unit;
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        if (l.animated && repaint) {
          const c = context(el, BACKDROP_W, BACKDROP_H);
          if (c) paintLayer(c, l.id, t);
        }
      });
    },
    STAGE_FPS,
    !reduced,
  );

  return (
    <div className={`stage ${className}`} ref={rootRef}>
      <div className="backdrop" aria-hidden="true">
        {BACKDROP_LAYERS.map((l, i) => (
          <canvas
            key={l.id}
            ref={(el) => {
              layerRefs.current[i] = el;
            }}
            className={`backdrop-layer layer-${l.id}`}
          />
        ))}
        <span className="backdrop-vignette" />
      </div>
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
