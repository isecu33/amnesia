/**
 * Modelo del ANUNCIO DE EFECTO (docs/06, P1): qué cartel enseñar, cuándo y
 * cuánto, derivado solo de eventos públicos (nunca valores, I2). Puro: el
 * componente `hud/EffectBanner.tsx` solo lo pinta, y no bloquea la entrada.
 */
import type { EffectKind, GameEvent, OmenId } from '@totem/core';
import { DICTS, fmt, type Lang } from '../i18n/index.js';
import { effectName, omenName, omenRule } from '../state/subtitles.js';

/** El cartel se queda un poco tras cerrarse la ventana para poder leerlo. */
export const BANNER_LINGER_MS = 600;
export const STOLEN_SHOW_MS = 1800;
export const OMEN_SHOW_MS = 2200;
/** Duración del fundido de salida (CSS). */
export const BANNER_FADE_MS = 250;

interface BannerBase {
  /** reloj de la página (performance.now) en que empezó */
  startedAt: number;
  /** momento en que deja de verse (antes del fundido) */
  endsAt: number;
}

export type BannerModel =
  | (BannerBase & {
      kind: 'announce';
      effect: EffectKind;
      owner: string;
      /** fin de la ventana de robo (reloj de la página) */
      windowEndsAt: number;
      windowMs: number;
    })
  | (BannerBase & { kind: 'stolen'; effect: EffectKind; thief: string; owner: string })
  | (BannerBase & { kind: 'omen'; omen: OmenId });

export interface BannerCtx {
  nowMs: number;
  /** `stealWindowMs` de la sala */
  windowMs: number;
}

/** Eventos que cierran la ventana de robo: el cartel se retira enseguida. */
const CLOSES_WINDOW: GameEvent['e'][] = [
  'EFFECT_PENDING',
  'EFFECT_SKIPPED',
  'EFFECT_RESOLVED',
  'DOUBLE_DRAW_PENDING',
  'TURN_STARTED',
  'ROUND_REVEAL',
];

function announce(effect: EffectKind, owner: string, ctx: BannerCtx): BannerModel {
  const windowEndsAt = ctx.nowMs + ctx.windowMs;
  return {
    kind: 'announce',
    effect,
    owner,
    startedAt: ctx.nowMs,
    windowEndsAt,
    windowMs: ctx.windowMs,
    endsAt: windowEndsAt + BANNER_LINGER_MS,
  };
}

/**
 * Siguiente cartel tras reproducirse `e`. El C1 con efecto (DISCARDED_DRAWN) lo
 * abre al caer la carta, que es cuando se puede igualar; STEAL_WINDOW_OPENED
 * solo lo abre si no estaba ya (no reinicia la barra).
 */
export function nextBanner(
  prev: BannerModel | undefined,
  e: GameEvent,
  ctx: BannerCtx,
): BannerModel | undefined {
  switch (e.e) {
    case 'DISCARDED_DRAWN':
      return e.effect ? announce(e.effect, e.player, ctx) : prev;
    case 'STEAL_WINDOW_OPENED':
      if (
        prev?.kind === 'announce' &&
        prev.owner === e.owner &&
        prev.effect === e.effect &&
        ctx.nowMs < prev.windowEndsAt
      )
        return prev;
      return announce(e.effect, e.owner, ctx);
    case 'EFFECT_STOLEN':
      return {
        kind: 'stolen',
        effect: e.effect,
        thief: e.thief,
        owner: e.owner,
        startedAt: ctx.nowMs,
        endsAt: ctx.nowMs + STOLEN_SHOW_MS,
      };
    case 'OMEN_CHANGED':
      // Un cartel de efecto manda sobre el del presagio (la ventana es urgente).
      if (!e.omen || (prev?.kind === 'announce' && ctx.nowMs < prev.endsAt)) return prev;
      return { kind: 'omen', omen: e.omen, startedAt: ctx.nowMs, endsAt: ctx.nowMs + OMEN_SHOW_MS };
    default:
      if (prev?.kind === 'announce' && CLOSES_WINDOW.includes(e.e)) {
        const at = Math.min(prev.endsAt, ctx.nowMs);
        return { ...prev, windowEndsAt: Math.min(prev.windowEndsAt, at), endsAt: at };
      }
      return prev;
  }
}

/** Fracción restante de la ventana de robo (1 → 0); 0 si no aplica. */
export function stealFrac(b: BannerModel | undefined, nowMs: number): number {
  if (b?.kind !== 'announce' || b.windowMs <= 0) return 0;
  return Math.max(0, Math.min(1, (b.windowEndsAt - nowMs) / b.windowMs));
}

export function bannerVisible(b: BannerModel | undefined, nowMs: number): boolean {
  return b !== undefined && nowMs < b.endsAt;
}

export interface BannerText {
  /** efecto (o presagio) que da icono y color */
  icon: { effect: EffectKind } | { omen: OmenId };
  title: string;
  /** «de Ana» / «Ana roba Vislumbre a Bea» */
  by: string;
  rule: string;
  /** llamada a la acción de la ventana de robo */
  cta?: string;
}

/** Textos del cartel vía i18n. `selfId` cambia «de Ana» por «tu efecto». */
export function bannerText(
  b: BannerModel,
  lang: Lang,
  name: (id: string) => string,
  selfId?: string,
): BannerText {
  const d = DICTS[lang];
  switch (b.kind) {
    case 'announce': {
      const mine = b.owner === selfId;
      return {
        icon: { effect: b.effect },
        title: effectName(d, b.effect),
        by: mine ? d.bannerByYou : fmt(d.bannerBy, { owner: name(b.owner) }),
        rule: d[`ruleSum${b.effect}`],
        cta: mine ? d.bannerStealOwn : d.bannerSteal,
      };
    }
    case 'stolen': {
      const vars = { thief: name(b.thief), owner: name(b.owner), effect: effectName(d, b.effect) };
      const tpl =
        b.thief === selfId ? d.evStolenYou : b.owner === selfId ? d.evStolenFromYou : d.evStolen;
      return {
        icon: { effect: b.effect },
        title: effectName(d, b.effect),
        by: fmt(tpl, vars),
        rule: d[`ruleSum${b.effect}`],
      };
    }
    case 'omen':
      return {
        icon: { omen: b.omen },
        title: omenName(d, b.omen),
        by: d.bannerOmen,
        rule: omenRule(d, b.omen),
      };
  }
}
