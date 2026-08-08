/** Log de subtítulos de eventos (accesibilidad, docs/01 §11). */
import type { GameEvent } from '@totem/core';
import type { Lang } from '../i18n/index.js';

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

export function describe(e: GameEvent, name: (id: string) => string, lang: Lang): string | null {
  const es = lang === 'es';
  switch (e.e) {
    case 'ROUND_STARTED':
      return es
        ? `Nueva ronda. Empieza ${name(e.startingPlayer)}.`
        : `New round. ${name(e.startingPlayer)} starts.`;
    case 'TURN_STARTED':
      return es
        ? `Turno de ${name(e.player)} (órbita ${e.orbit}).`
        : `${name(e.player)}'s turn (orbit ${e.orbit}).`;
    case 'DREW':
      return es
        ? `${name(e.player)} roba del ${e.source === 'deck' ? 'mazo' : 'descarte'}.`
        : `${name(e.player)} draws from the ${e.source}.`;
    case 'DISCARDED_DRAWN':
      return es
        ? `${name(e.player)} descarta un ${e.value}${e.effect ? ` (${e.effect})` : ''}.`
        : `${name(e.player)} discards a ${e.value}${e.effect ? ` (${e.effect})` : ''}.`;
    case 'SWAPPED_DRAWN':
      return es
        ? `${name(e.player)} sustituye su tótem ${e.slot}; sale un ${e.discardedValue}.`
        : `${name(e.player)} swaps totem ${e.slot}; a ${e.discardedValue} comes out.`;
    case 'EFFECT_PENDING':
      return es
        ? `${name(e.player)} activa ${e.effect}.`
        : `${name(e.player)} triggers ${e.effect}.`;
    case 'EFFECT_RESOLVED': {
      const slots = e.publicInfo.slots.map((s) => `${name(s.player)}#${s.slot}`).join(' ↔ ');
      return es
        ? `${name(e.player)} resuelve ${e.effect}: ${slots}.`
        : `${name(e.player)} resolves ${e.effect}: ${slots}.`;
    }
    case 'EFFECT_SKIPPED':
      return es
        ? `${name(e.player)} omite el efecto (${e.reason}).`
        : `${name(e.player)} skips the effect (${e.reason}).`;
    case 'ULTIMA_CALLED':
      return es ? `¡${name(e.player)} canta ÚLTIMA!` : `${name(e.player)} calls LAST!`;
    case 'MATCH_OK':
      return es
        ? `${name(e.player)} acierta el Descarte Rápido con un ${e.value}.`
        : `${name(e.player)} nails the Quick Discard with a ${e.value}.`;
    case 'MATCH_FAIL':
      return es
        ? `${name(e.player)} falla: era un ${e.value}. Castigo: ${e.penalty === 'card' ? 'un tótem' : '+5 puntos'}.`
        : `${name(e.player)} fails: it was a ${e.value}. Penalty: ${e.penalty === 'card' ? 'a totem' : '+5 points'}.`;
    case 'MATCH_REJECTED':
      return es ? `Intento rechazado (${e.reason}).` : `Attempt rejected (${e.reason}).`;
    case 'PENALTY_CARD':
      return es
        ? `${name(e.player)} recibe un tótem de castigo en el ${e.slot}.`
        : `${name(e.player)} gets a penalty totem in ${e.slot}.`;
    case 'DECK_RESHUFFLED':
      return es ? `Se rebaraja el mazo (${e.deckCount}).` : `Deck reshuffled (${e.deckCount}).`;
    case 'ROUND_REVEAL':
      return es ? 'Revelación de manos.' : 'Hands revealed.';
    case 'ROUND_SCORED':
      return es ? 'Puntuación de la ronda.' : 'Round scored.';
    case 'GAME_ENDED':
      return es ? `Fin de partida. Gana ${name(e.winner)}.` : `Game over. ${name(e.winner)} wins.`;
    case 'PLAYER_SEAT':
      return es
        ? `${name(e.player)} pasa a ${e.controller === 'bot' ? 'bot' : 'humano'}.`
        : `${name(e.player)} is now ${e.controller}.`;
    default:
      return null;
  }
}
