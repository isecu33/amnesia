/** Log de subtítulos de eventos (accesibilidad, docs/01 §11). */
import type { GameEvent } from '@totem/core';
import { DICTS, fmt, type Dict, type Lang } from '../i18n/index.js';

/** Los emotes también son sonido: necesitan subtítulo (docs/01 §11). */
const EMOTE_NAMES: Record<Lang, string[]> = {
  es: ['saluda', 'se ríe', 'sospecha', 'aplaude', 'resopla', 'te mete prisa'],
  en: ['waves', 'laughs', 'is suspicious', 'applauds', 'sighs', 'tells you to hurry'],
};

export function emoteSubtitle(name: string, id: number, lang: Lang): string {
  const list = EMOTE_NAMES[lang];
  const verb = list[Math.max(0, Math.min(list.length - 1, id))] ?? list[0];
  return `${name} ${verb}.`;
}

/** Nombre visible: vista → asientos del lobby → genérico. Nunca el id interno. */
export function resolveName(
  id: string,
  names: Record<string, string>,
  seats: readonly { playerId: string; name: string }[] | undefined,
  lang: Lang,
): string {
  return names[id] ?? seats?.find((x) => x.playerId === id)?.name ?? DICTS[lang].someone;
}

export function describe(e: GameEvent, name: (id: string) => string, lang: Lang): string | null {
  const d = DICTS[lang];
  const slotNo = (i: number): number => i + 1; // la UI numera 1..N
  const eff = (k: string): string => d[`eff${k}` as keyof Dict] ?? k;
  switch (e.e) {
    case 'ROUND_STARTED':
      return fmt(d.evRoundStarted, { name: name(e.startingPlayer) });
    case 'TURN_STARTED':
      return fmt(d.evTurnStarted, { name: name(e.player), orbit: e.orbit });
    case 'DREW':
      return fmt(e.source === 'deck' ? d.evDrewDeck : d.evDrewDiscard, { name: name(e.player) });
    case 'DISCARDED_DRAWN':
      return e.effect
        ? fmt(d.evDiscardedEffect, { name: name(e.player), value: e.value, effect: eff(e.effect) })
        : fmt(d.evDiscarded, { name: name(e.player), value: e.value });
    case 'SWAPPED_DRAWN':
      return fmt(d.evSwapped, {
        name: name(e.player),
        slot: slotNo(e.slot),
        value: e.discardedValue,
      });
    case 'EFFECT_PENDING':
      return fmt(d.evEffectPending, { name: name(e.player), effect: eff(e.effect) });
    case 'EFFECT_RESOLVED': {
      const slots = e.publicInfo.slots
        .map((s) => `${name(s.player)}#${slotNo(s.slot)}`)
        .join(' ↔ ');
      return fmt(d.evEffectResolved, { name: name(e.player), effect: eff(e.effect), slots });
    }
    case 'EFFECT_SKIPPED':
      return fmt(d.evEffectSkipped, { name: name(e.player), reason: reasonText(d, e.reason) });
    case 'ULTIMA_CALLED':
      return fmt(d.evUltima, { name: name(e.player) });
    case 'MATCH_OK':
      return fmt(d.evMatchOk, { name: name(e.player), value: e.value });
    case 'MATCH_FAIL':
      return fmt(d.evMatchFail, {
        name: name(e.player),
        value: e.value,
        penalty: e.penalty === 'card' ? d.penaltyCard : d.penaltyPoints,
      });
    case 'MATCH_REJECTED':
      return fmt(d.evMatchRejected, { reason: reasonText(d, e.reason) });
    case 'PENALTY_CARD':
      return fmt(d.evPenaltyCard, { name: name(e.player), slot: slotNo(e.slot) });
    case 'DECK_RESHUFFLED':
      return fmt(d.evReshuffled, { count: e.deckCount });
    case 'ROUND_REVEAL':
      return d.evReveal;
    case 'ROUND_SCORED':
      return d.evScored;
    case 'GAME_ENDED':
      return fmt(d.evGameEnded, { name: name(e.winner) });
    case 'PLAYER_SEAT':
      return fmt(e.controller === 'bot' ? d.evSeatBot : d.evSeatHuman, { name: name(e.player) });
    default:
      return null;
  }
}

type Reason = 'timeout' | 'chosen' | 'noTargets' | 'tooLate' | 'window' | 'locked';
const REASON_KEY: Record<Reason, keyof Dict> = {
  timeout: 'reasonTimeout',
  chosen: 'reasonChosen',
  noTargets: 'reasonNoTargets',
  tooLate: 'reasonTooLate',
  window: 'reasonWindow',
  locked: 'reasonLocked',
};
const reasonText = (d: Dict, r: Reason): string => d[REASON_KEY[r]];
