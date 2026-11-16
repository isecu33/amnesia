/**
 * Lo que el store recibe cuando el presenter REPRODUCE un evento (no al llegar
 * por red): el valor de una vista privada aparece con su animación y dura lo
 * que dura el beat (P1, docs/06). Puro respecto a la escena: se testea con un
 * sumidero falso.
 */
import type { EffectKind, GameEvent, PlayerView } from '@totem/core';

export interface RevealState {
  player: string;
  slot: number;
  value: number;
  until: number;
}

export interface PlaySink {
  playerId?: string;
  view?: PlayerView;
  reveal?: RevealState;
  setReveal: (r: RevealState | undefined) => void;
  setPendingEffect: (k?: EffectKind) => void;
}

/** `nowMs` = reloj de pared (Date.now), el mismo que usa `reveal.until`. */
export function onPlayed(e: GameEvent, s: PlaySink, nowMs: number): void {
  switch (e.e) {
    case 'EFFECT_PENDING':
      // Con lag la vista puede ir por delante: sin objetivo que elegir, no se arma.
      if (e.player === s.playerId && s.view?.legal.includes('EFFECT_TARGET') !== false)
        s.setPendingEffect(e.effect);
      return;
    case 'EFFECT_RESOLVED':
    case 'EFFECT_SKIPPED':
      if (e.player === s.playerId) s.setPendingEffect(undefined);
      return;
    case 'PRIVATE_REVEAL':
      if (e.to !== s.playerId) return;
      s.setReveal({ player: e.player, slot: e.slot, value: e.value, until: nowMs + e.ttlMs });
      return;
    default:
      return;
  }
}

/**
 * El beat terminó (o se recortó). Si se recortó (D-042) la vista privada NO se
 * apaga antes de su `ttlMs`: en un juego de memoria es la información por la que
 * pagaste el turno. Devuelve los ms que faltan para apagarla (el llamador programa
 * `expireReveal`), o 0 si ya se apagó.
 */
export function onEnded(e: GameEvent, s: PlaySink, nowMs: number): number {
  if (e.e !== 'PRIVATE_REVEAL') return 0;
  const r = s.reveal;
  if (!r || r.player !== e.player || r.slot !== e.slot) return 0;
  if (nowMs >= r.until) {
    s.setReveal(undefined);
    return 0;
  }
  return r.until - nowMs;
}

/** Apaga `r` solo si sigue siendo la vista privada en curso (otra más nueva no se toca). */
export function expireReveal(s: PlaySink, r: RevealState | undefined): void {
  if (r && s.reveal === r) s.setReveal(undefined);
}

/** ¿Algún evento posterior movió o vació esa casilla? (su valor visto ya no es el de la carta que hay). */
function slotTouched(later: readonly GameEvent[], player: string, slot: number): boolean {
  return later.some((e) => {
    switch (e.e) {
      case 'SWAPPED_DRAWN':
        return e.player === player && e.slot === slot;
      case 'MATCH_OK':
        return (e.owner ?? e.player) === player && e.slot === slot;
      case 'EFFECT_RESOLVED':
        return e.publicInfo.slots.some((p) => p.player === player && p.slot === slot);
      case 'WILD_GIFT':
        return (e.from === player && e.fromSlot === slot) || (e.to === player && e.toSlot === slot);
      case 'ROUND_STARTED':
      case 'ROUND_REVEAL':
        return true;
      default:
        return false;
    }
  });
}

/**
 * Vistas privadas que merece la pena re-mostrar tras un colapso de la cola: las
 * últimas `keep` cuya casilla no cambió después (si no, pintaríamos un valor viejo
 * sobre otra carta). `skip` = la que ya se estaba mostrando (no se repite).
 */
export function revealsToReplay(
  all: readonly GameEvent[],
  keep: number,
  skip?: GameEvent,
): GameEvent[] {
  const out: GameEvent[] = [];
  all.forEach((e, i) => {
    if (e.e !== 'PRIVATE_REVEAL' || e === skip) return;
    if (!slotTouched(all.slice(i + 1), e.player, e.slot)) out.push(e);
  });
  return out.slice(-keep);
}
