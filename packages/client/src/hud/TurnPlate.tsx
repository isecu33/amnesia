import { useEffect, useRef } from 'react';
import type { HudIndicators } from '../presenter/hud-model.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { fmt, makeT, type Lang, type TKey } from '../i18n/index.js';
import { resolveName } from '../state/subtitles.js';
import { displaySeconds, type GuideText, type TurnGuide } from './turn-guide.js';

export interface TurnPlateProps {
  guide: TurnGuide;
  /** aviso del efecto en curso: manda sobre la instrucción de la guía */
  effectHint: TKey | undefined;
  /** indicadores del último frame (reloj interpolado), leídos fuera de React */
  readHud: () => HudIndicators | undefined;
}

/**
 * Placa de turno (docs/01 §11, «arriba centro»): quién juega, segundos que le
 * quedan, qué toca hacer y la última jugada. El reloj se pinta por rAF sin pasar
 * por React; la vela diegética sigue siendo el reloj principal en la mesa.
 */
export function TurnPlate({ guide, effectHint, readHud }: TurnPlateProps): JSX.Element {
  const lang = useSettings((s) => s.lang);
  const big = useSettings((s) => s.bigNumbers);
  const subtitles = useSettings((s) => s.subtitles);
  const t = makeT(lang);
  const text = (g: GuideText): string => {
    const tv = Object.fromEntries(Object.entries(g.tvars ?? {}).map(([k, v]) => [k, t(v)]));
    return fmt(t(g.key), { ...g.vars, ...tv });
  };
  const secsRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const ultimaRef = useRef<HTMLSpanElement>(null);

  const ultimaOn = guide.ultima;
  useEffect(() => {
    let raf = 0;
    let lastSecs = -1;
    let lastUltima = '';
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const hud = readHud();
      const c = hud?.candle;
      const secs = c ? displaySeconds(c.remainingMs) : -1;
      if (secsRef.current && secs !== lastSecs) {
        secsRef.current.textContent = secs >= 0 ? String(secs) : '';
        lastSecs = secs;
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${c ? c.frac : 0})`;
      plateRef.current?.classList.toggle('danger', !!c?.danger);
      plateRef.current?.classList.toggle('timed', !!c);
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

  return (
    <div className={`turn-plate-wrap${big ? ' big' : ''}`}>
      {/* La key reinicia la animación de entrada en cada cambio de turno o fase. */}
      <div
        key={`${guide.tone}:${titleText}`}
        ref={plateRef}
        className={`turn-plate tone-${guide.tone}`}
        role="status"
        aria-live="polite"
      >
        <span className="turn-plate-flame" aria-hidden="true" />
        <span className="turn-plate-title">{titleText}</span>
        <span className="turn-plate-secs" ref={secsRef} aria-label={t('plateSeconds')} />
        <span className="turn-plate-bar" aria-hidden="true">
          <span ref={barRef} />
        </span>
      </div>
      <span className="turn-plate-ultima" ref={ultimaRef} hidden />
      {hint ? (
        <p key={hint} className="turn-hint" role="status" aria-live="polite">
          {hint}
        </p>
      ) : null}
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
