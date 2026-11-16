import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HudIndicators } from '../presenter/hud-model.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT, type Lang, type TKey } from '../i18n/index.js';
import { resolveName } from '../state/subtitles.js';
import { timerView, type GuideText, type TurnGuide } from './turn-guide.js';
import { faceBoxes, placePlate, type PlatePlacement } from './seat-avoid.js';
import { setHint } from './hint-store.js';

export interface TurnPlateProps {
  guide: TurnGuide;
  /** aviso del efecto en curso: manda sobre la instrucción de la guía */
  effectHint: TKey | undefined;
  /** indicadores del último frame (reloj interpolado), leídos fuera de React */
  readHud: () => HudIndicators | undefined;
}

/** Perímetro del aro del reloj en unidades de `pathLength`. */
const RING_LEN = 100;
const PLATE_MARGIN_PX = 8;
/** Ancho aproximado de la versión compacta (solo el reloj). */
const COMPACT_W = 56;

/**
 * Placa de turno compacta (docs/01 §11): una sola línea — reloj en aro, quién
 * juega — que se coloca en el borde superior en el primer hueco que no tape la
 * cara de ningún rival. La instrucción vive en el dock de acciones. El aro se
 * pinta por rAF sin pasar por React; la vela diegética sigue siendo el reloj en la mesa.
 */
export function TurnPlate({ guide, effectHint, readHud }: TurnPlateProps): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const big = useSettings((s) => s.bigNumbers);
  const subtitles = useSettings((s) => s.subtitles);
  const players = useStore((s) => (s.view ? s.view.others.length + 1 : 2));
  const t = makeT(lang);
  const text = (g: GuideText): string => {
    const tv = Object.fromEntries(Object.entries(g.tvars ?? {}).map(([k, v]) => [k, t(v)]));
    return fmt(t(g.key), { ...g.vars, ...tv });
  };
  const secsRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ultimaRef = useRef<HTMLSpanElement>(null);
  const stealRef = useRef<HTMLSpanElement>(null);
  const stealFillRef = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<PlatePlacement>({
    x: PLATE_MARGIN_PX,
    y: PLATE_MARGIN_PX,
    compact: false,
  });

  const ultimaOn = guide.ultima;
  useEffect(() => {
    let raf = 0;
    let lastSecs = -1;
    let lastUltima = '';
    let lastUrgent: boolean | undefined;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const hud = readHud();
      const c = hud?.candle;
      const tv = timerView(c);
      const secs = tv ? tv.secs : -1;
      if (secsRef.current && secs !== lastSecs) {
        secsRef.current.textContent = secs >= 0 ? String(secs) : '';
        lastSecs = secs;
      }
      // Aro suave: se consume de forma continua, no a saltos de segundo.
      ringRef.current?.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - (tv?.frac ?? 0))));
      plateRef.current?.classList.toggle('timed', !!tv);
      if (tv?.urgent !== lastUrgent) {
        plateRef.current?.classList.toggle('urgent', !!tv?.urgent);
        lastUrgent = tv?.urgent;
      }
      // Ventana de Robo: barra aparte (la fracción viene de hud-model).
      const steal = hud?.steal;
      if (stealRef.current) stealRef.current.hidden = !steal;
      if (stealFillRef.current && steal)
        stealFillRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, steal.frac))})`;
      // Los turnos que quedan salen de la mesa (eventos); si ya hay otra ronda en la instantánea, se oculta.
      const u = ultimaOn ? hud?.ultima : undefined;
      const label = !u
        ? ''
        : u.turnsLeft <= 1
          ? t('plateUltimaOne')
          : fmt(t('plateUltima'), { n: u.turnsLeft });
      if (ultimaRef.current && label !== lastUltima) {
        ultimaRef.current.textContent = label;
        ultimaRef.current.hidden = label === '';
        lastUltima = label;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readHud, lang, ultimaOn]);

  const hint = effectHint ? t(effectHint) : guide.hint ? text(guide.hint) : undefined;
  const titleText = text(guide.title);

  // La instrucción se pinta en el dock de acciones, no sobre la mesa.
  useEffect(() => {
    setHint(hint);
    return () => setHint(undefined);
  }, [hint]);

  // Colocación: primer hueco del borde superior que no pise la cara de un rival.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const host = wrap?.parentElement;
    if (!wrap || !host) return undefined;
    const run = (): void => {
      const vw = host.clientWidth;
      const vh = host.clientHeight;
      if (vw === 0 || vh === 0) return;
      const was = wrap.classList.contains('compact');
      wrap.classList.remove('compact');
      const full = { w: wrap.offsetWidth, h: wrap.offsetHeight };
      if (was) wrap.classList.add('compact');
      const next = placePlate(
        faceBoxes(players, vw, vh),
        full,
        { w: COMPACT_W, h: full.h },
        vw,
        PLATE_MARGIN_PX,
      );
      setPlace((p) => (p.x === next.x && p.y === next.y && p.compact === next.compact ? p : next));
    };
    run();
    globalThis.addEventListener('resize', run);
    return () => globalThis.removeEventListener('resize', run);
  }, [players, titleText, big, lang]);

  return (
    <div
      ref={wrapRef}
      className={`turn-plate-wrap${big ? ' big' : ''}${place.compact ? ' compact' : ''}`}
      style={{ left: place.x, top: place.y }}
    >
      {/* La key reinicia la animación de entrada en cada cambio de turno o fase. */}
      <div
        key={`${guide.tone}:${titleText}`}
        ref={plateRef}
        className={`turn-plate tone-${guide.tone}`}
        role="status"
        aria-live="polite"
      >
        <span className="turn-clock" aria-hidden={false}>
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle className="turn-clock-track" cx="18" cy="18" r="15" />
            <circle
              ref={ringRef}
              className="turn-clock-arc"
              cx="18"
              cy="18"
              r="15"
              pathLength={RING_LEN}
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN}
              transform="rotate(-90 18 18)"
            />
          </svg>
          <span className="turn-clock-secs" ref={secsRef} aria-label={t('plateSeconds')} />
          <span className="turn-clock-alert" role="img" aria-label={t('plateUrgent')} />
        </span>
        <span className="turn-plate-title">{titleText}</span>
      </div>
      <span className="steal-bar" ref={stealRef} hidden>
        <span className="steal-bar-fill" ref={stealFillRef} />
        <span className="steal-bar-label">{t('plateStealLeft')}</span>
      </span>
      <span className="turn-plate-ultima" ref={ultimaRef} hidden />
      {subtitles ? null : <LastAction />}
    </div>
  );
}

/** Textos del registro que anuncian que tu propio asiento cambia de control. */
function ownSeatLines(
  me: string | undefined,
  names: Record<string, string>,
  seats: Parameters<typeof resolveName>[2],
  lang: Lang,
): string {
  if (!me) return '';
  const name = resolveName(me, names, seats, lang);
  const t = makeT(lang);
  return [fmt(t('evSeatHuman'), { name }), fmt(t('evSeatBot'), { name })].join('\n');
}

/** Última jugada (docs/01 §11): una línea que se desvanece sola. */
function LastAction(): JSX.Element | null {
  const last = useStore((s) => s.log[s.log.length - 1]);
  const own = useStore((s) => ownSeatLines(s.playerId, s.names, s.lobby?.seats, s.lang));
  const maxSeen = useRef(0);
  // Una línea privada caducada no debe resucitar la anterior: solo se enseña lo nuevo.
  if (!last || last.id < maxSeen.current) return null;
  maxSeen.current = last.id;
  // Tu propio cambio de control de asiento (al entrar/reconectar) no es una jugada.
  if (own.split('\n').includes(last.text)) return null;
  return (
    <p key={last.id} className="last-action">
      {last.text}
    </p>
  );
}
