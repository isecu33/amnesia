import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../settings/store.js';
import { resolveName } from '../state/subtitles.js';
import { useStore } from '../state/store.js';
import {
  BANNER_FADE_MS,
  bannerText,
  bannerVisible,
  stealFrac,
  type BannerModel,
} from '../presenter/effect-banner.js';
import { EFFECT_COLORS, EFFECT_ICONS, OMEN_ICONS } from '../presenter/effects.js';
import { OMEN_COLORS } from '../presenter/hud-v2.js';
import './effect-banner.css';

export interface EffectBannerProps {
  banner: BannerModel | undefined;
  /** reloj del presenter (performance.now): el mismo con que se creó el modelo */
  now?: () => number;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function PixelIcon({ rows, color }: { rows: readonly string[]; color: string }): JSX.Element {
  const w = rows[0]?.length ?? 0;
  return (
    <svg
      className="eb-icon"
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '#' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
          ) : null,
        ),
      )}
    </svg>
  );
}

/**
 * ANUNCIO DE EFECTO (P1): cartel no modal (pointer-events: none) arriba a la
 * izquierda, lejos de tu fila de tótems. La barra de la ventana de robo se pinta
 * por rAF sin pasar por React, para no robar ni un frame a los reflejos.
 */
export function EffectBanner({
  banner,
  now = () => performance.now(),
}: EffectBannerProps): JSX.Element | null {
  const lang = useSettings((s) => s.lang);
  const reduced = useSettings((s) => s.reducedMotion);
  const names = useStore((s) => s.names);
  const seats = useStore((s) => s.lobby?.seats);
  const selfId = useStore((s) => s.playerId);
  const barRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (!banner) {
      setShown(false);
      return;
    }
    setShown(true);
    setLeaving(false);
    let raf = 0;
    let done: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      const t = nowRef.current();
      if (barRef.current) barRef.current.style.transform = `scaleX(${stealFrac(banner, t)})`;
      if (bannerVisible(banner, t)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      raf = 0;
      setLeaving(true);
      done = setTimeout(() => setShown(false), BANNER_FADE_MS);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (done) clearTimeout(done);
    };
  }, [banner]);

  if (!banner || !shown) return null;
  const name = (id: string): string => resolveName(id, names, seats, lang);
  const txt = bannerText(banner, lang, name, selfId);
  const color = hex(
    'effect' in txt.icon ? EFFECT_COLORS[txt.icon.effect] : OMEN_COLORS[txt.icon.omen],
  );
  const rows = 'effect' in txt.icon ? EFFECT_ICONS[txt.icon.effect] : OMEN_ICONS[txt.icon.omen];
  const cls = [
    'effect-banner',
    `eb-${banner.kind}`,
    reduced ? 'eb-reduced' : '',
    leaving ? 'eb-leaving' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      key={`${banner.kind}:${banner.startedAt}`}
      className={cls}
      role="status"
      aria-live="polite"
      style={{ ['--eb-color' as string]: color }}
    >
      <PixelIcon rows={rows} color={color} />
      <div className="eb-body">
        <strong className="eb-title">{txt.title}</strong>
        <span className="eb-by">{txt.by}</span>
        <span className="eb-rule">{txt.rule}</span>
        {txt.cta ? (
          <span className="eb-steal">
            <span className="eb-cta">{txt.cta}</span>
            <span className="eb-bar" aria-hidden="true">
              <span ref={barRef} className="eb-bar-fill" />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
