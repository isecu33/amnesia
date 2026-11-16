/**
 * Selector de personaje (P3): carrusel de los 6 tótems con retrato grande animado
 * (respira y parpadea), nombre, lema y color propio de cada especie. Se maneja con
 * flechas en pantalla, teclado (patrón radiogroup), deslizar el retrato o la tira.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { TKey } from '../i18n/index.js';
import { SPECIES, type SpeciesId } from '../scene/species.js';
import { hex, shade } from '../scene/pixel.js';
import { SPECIES_NAME } from './species-names.js';
import { SpeciesPortrait, radioArrowKeys } from './PixelArt.js';
import { useReducedMotion } from './title/motion.js';

const LORE: Record<SpeciesId, TKey> = {
  owl: 'loreOwl',
  fox: 'loreFox',
  bear: 'loreBear',
  deer: 'loreDeer',
  snake: 'loreSnake',
  crow: 'loreCrow',
};

/** Color de acento por especie, sacado de su propia paleta (el rasgo más vivo). */
export function speciesAccent(id: SpeciesId): string {
  const s = SPECIES[id];
  switch (id) {
    case 'owl':
    case 'crow':
      return hex(s.eye);
    case 'deer':
      return hex(s.mark);
    case 'fox':
      return hex(s.fur);
    case 'bear':
      return hex(shade(s.fur, 1.9));
    case 'snake':
      return hex(shade(s.fur, 1.45));
  }
}

const BLINK_EVERY_MS = 3200;
const BLINK_MS = 140;
const SWIPE_PX = 36;
/** Tras un desplazamiento programático, se ignoran los eventos de scroll un rato. */
const SCROLL_SETTLE_MS = 160;
const PROGRAMMATIC_SCROLL_MS = 500;

function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setClosed(true);
      off = setTimeout(() => setClosed(false), BLINK_MS);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(id);
      if (off) clearTimeout(off);
    };
  }, [enabled]);
  return enabled && closed;
}

type Props = {
  options: readonly SpeciesId[];
  value: number;
  onChange: (i: number) => void;
  t: (k: TKey) => string;
  labelId: string;
};

export function CharacterCarousel({ options, value, onChange, t, labelId }: Props): JSX.Element {
  const reduced = useReducedMotion();
  const blink = useBlink(!reduced);
  const stripRef = useRef<HTMLDivElement>(null);
  const swipeFrom = useRef<number | null>(null);
  const ignoreScrollUntil = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const n = options.length;
  const current = options[value] ?? options[0] ?? 'owl';
  const all = options.map(() => true);
  const go = (delta: number): void => onChange((((value + delta) % n) + n) % n);

  // La opción elegida siempre queda centrada en la tira.
  useEffect(() => {
    const card = stripRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[value];
    if (!card?.scrollIntoView) return;
    ignoreScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    card.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [value, reduced]);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Deslizar la tira con el dedo: al parar, se elige la tarjeta que quedó en el centro.
  const onStripScroll = (): void => {
    if (Date.now() < ignoreScrollUntil.current) return;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const mid = strip.getBoundingClientRect().left + strip.clientWidth / 2;
      const cards = [...strip.querySelectorAll<HTMLElement>('[role="radio"]')];
      let best = value;
      let bestD = Infinity;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) [best, bestD] = [i, d];
      });
      if (best !== value) onChange(best);
    }, SCROLL_SETTLE_MS);
  };

  const onPointerDown = (e: PointerEvent): void => {
    swipeFrom.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent): void => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null) return;
    const dx = e.clientX - from;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  const accent = { '--accent': speciesAccent(current) } as CSSProperties;

  return (
    <div className="carousel" style={accent}>
      <div
        className="carousel-hero"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeFrom.current = null)}
      >
        <button
          type="button"
          className="pixel-btn ghost carousel-arrow prev"
          aria-label={t('prevTotem')}
          onClick={() => go(-1)}
        >
          <svg viewBox="0 0 6 8" aria-hidden="true">
            <path d="M4 0h2v2H4v1H3v2h1v1h2v2H4V7H3V6H2V5H1V3h1V2h1V1h1z" />
          </svg>
        </button>
        <div className="hero-portrait" key={current}>
          <span className="hero-halo" aria-hidden="true" />
          <SpeciesPortrait id={current} blink={blink} className="hero" />
          <span className="hero-plinth" aria-hidden="true" />
        </div>
        <div className="hero-copy" aria-live="polite">
          <p className="hero-name">{t(SPECIES_NAME[current])}</p>
          <p className="hero-lore">{t(LORE[current])}</p>
        </div>
        <button
          type="button"
          className="pixel-btn ghost carousel-arrow next"
          aria-label={t('nextTotem')}
          onClick={() => go(1)}
        >
          <svg viewBox="0 0 6 8" aria-hidden="true">
            <path d="M0 0h2v1h1v1h1v1h1v2H4v1H3v1H2v1H0V6h2V5h1V3H2V2H0z" />
          </svg>
        </button>
      </div>
      <div
        className="carousel-strip"
        role="radiogroup"
        aria-labelledby={labelId}
        ref={stripRef}
        onScroll={onStripScroll}
      >
        {options.map((id, i) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === i}
            tabIndex={value === i ? 0 : -1}
            className={`totem-card${value === i ? ' active' : ''}`}
            style={{ '--accent': speciesAccent(id) } as CSSProperties}
            onClick={() => onChange(i)}
            onKeyDown={(e) => radioArrowKeys(e, value, all, onChange)}
          >
            <SpeciesPortrait id={id} />
            <span>{t(SPECIES_NAME[id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
