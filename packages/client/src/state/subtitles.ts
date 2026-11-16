/** Log de subtítulos de eventos (accesibilidad, docs/01 §11). */
import type { EffectKind, GameEvent, OmenId } from '@totem/core';
import { DICTS, fmt, type Dict, type Lang } from '../i18n/index.js';
import { displaySeatName } from '../ui/title/bot-name.js';
import { effectKindOf, isResolvedEffect } from '../presenter/effects.js';

/** Sujeto de la frase (para la variante en segunda persona). */
function subjectOf(e: GameEvent): string | undefined {
  if ('player' in e) return e.player;
  switch (e.e) {
    case 'ROUND_STARTED':
      return e.startingPlayer;
    case 'STEAL_WINDOW_OPENED':
      return e.owner;
    case 'WILD_GIFT':
      return e.from;
    default:
      return undefined;
  }
}

export const effectName = (d: Dict, k: EffectKind): string => d[`eff${k}`];
export const omenName = (d: Dict, o: OmenId): string => d[`omen${o}`];
export const omenRule = (d: Dict, o: OmenId): string => d[`omenRule${o}`];

/** Los emotes también son sonido: necesitan subtítulo (docs/01 §11). */
const EMOTE_NAMES: Record<Lang, string[]> = {
  es: ['saluda', 'se ríe', 'sospecha', 'aplaude', 'está triste', 'se asusta'],
  en: ['waves', 'laughs', 'is suspicious', 'applauds', 'is sad', 'is scared'],
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
  seats: readonly { playerId: string; name: string; controller?: 'human' | 'bot' }[] | undefined,
  lang: Lang,
): string {
  const seat = seats?.find((x) => x.playerId === id);
  const raw = names[id] ?? seat?.name;
  if (raw === undefined) return DICTS[lang].someone;
  // Los bots los bautiza el servidor en español: se traducen aquí.
  return displaySeatName({ name: raw, controller: seat?.controller ?? 'human' }, lang);
}

export function describe(
  e: GameEvent,
  name: (id: string) => string,
  lang: Lang,
  selfId?: string,
): string | null {
  const dict = DICTS[lang];
  // Si el sujeto es el jugador local, usa la variante en segunda persona ("Robas…", no "tú roba…").
  const subject = subjectOf(e);
  const d: Dict =
    selfId !== undefined && subject === selfId
      ? (new Proxy(dict, {
          get: (t, k) => t[`${String(k)}You` as keyof Dict] ?? t[k as keyof Dict],
        }) as Dict)
      : dict;
  const slotNo = (i: number): number => i + 1; // la UI numera 1..N
  // EFFECT_RESOLVED trae el paso (SEER_LOOK/SEER_SWAP): se nombra por su efecto.
  const eff = (k: string): string =>
    isResolvedEffect(k) ? effectName(dict, effectKindOf(k)) : (d[`eff${k}` as keyof Dict] ?? k);
  const isMe = (id: string): boolean => selfId !== undefined && id === selfId;
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
      // «Ana ha espiado tu tótem 3» (docs/01 §11): el espiado lo oye en primera persona.
      const spied = e.effect === 'SPY' ? e.publicInfo.slots[0] : undefined;
      if (spied && isMe(spied.player) && !isMe(e.player))
        return fmt(dict.evSpiedYours, { name: name(e.player), slot: slotNo(spied.slot) });
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
    case 'STEAL_WINDOW_OPENED':
      return fmt(d.evStealOpen, { name: name(e.owner), effect: eff(e.effect) });
    case 'EFFECT_STOLEN': {
      const vars = { thief: name(e.thief), owner: name(e.owner), effect: eff(e.effect) };
      if (isMe(e.thief)) return fmt(dict.evStolenYou, vars);
      if (isMe(e.owner)) return fmt(dict.evStolenFromYou, vars);
      return fmt(dict.evStolen, vars);
    }
    case 'CHAIN_LINK':
      return fmt(e.bonus !== 0 ? d.evChainLinkBonus : d.evChainLink, {
        name: name(e.player),
        link: e.link,
        bonus: e.bonus,
      });
    case 'CHAIN_BROKEN':
      return fmt(d.evChainBroken, { links: e.links });
    case 'OMEN_CHANGED':
      return e.omen
        ? fmt(d.evOmen, { omen: omenName(d, e.omen), rule: omenRule(d, e.omen) })
        : d.evOmenGone;
    case 'DOUBLE_DRAW_PENDING':
      return fmt(d.evDoubleDrawPending, { name: name(e.player) });
    case 'DOUBLE_DRAW_CLEARED':
      return fmt(e.reason === 'used' ? d.evDoubleDrawUsed : d.evDoubleDrawLost, {
        name: name(e.player),
      });
    case 'DOUBLE_DRAW_REJECTED':
      return fmt(d.evDoubleDrawRejected, { name: name(e.player), value: e.value });
    case 'WILD_GIFT':
      return isMe(e.to)
        ? fmt(dict.evWildGiftToYou, { name: name(e.from) })
        : fmt(d.evWildGift, { name: name(e.from), to: name(e.to) });
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

/** Línea privada (solo su destinatario) con su caducidad: I2 en cliente (D-041). */
export interface PrivateLine {
  text: string;
  ttlMs: number;
}

/** Subtítulo de los eventos privados; caduca a la vez que lo que se vio. */
export function privateLine(
  e: GameEvent,
  name: (id: string) => string,
  lang: Lang,
  selfId: string | undefined,
  ttlMs: number,
): PrivateLine | null {
  const d = DICTS[lang];
  if (e.e === 'PRIVATE_REVEAL' && e.to === selfId) {
    const slot = `#${e.slot + 1}`;
    const text =
      e.player === selfId
        ? fmt(d.evSaw, { slot, value: e.value })
        : fmt(d.evSawOf, { slot, owner: name(e.player), value: e.value });
    return { text, ttlMs: e.ttlMs };
  }
  if (e.e === 'DOUBLE_DREW_VALUES' && e.to === selfId) {
    const [a, b] = e.values;
    if (a === undefined || b === undefined) return null;
    return { text: fmt(d.evDoubleDrew, { a, b }), ttlMs };
  }
  return null;
}
