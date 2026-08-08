/**
 * Acciones legales — base de I4 y del campo `legal` de la vista.
 * La UI habilita botones SOLO con esto (docs/01 §11).
 */
import {
  activePlayer,
  canDrawDeck,
  isMatchLocked,
  matchWindowOpen,
  occupiedSlotIndexes,
  playerOf,
  subsetsUpTo,
  validEffectTargets,
} from './rules.js';
import type { Action, GameState } from './types.js';

export function legalActions(s: GameState, playerId: string): Action[] {
  const p = playerOf(s, playerId);
  if (!p || s.phase === 'GAME_END' || s.phase === 'ROUND_END' || s.phase === 'ROUND_REVEAL') {
    return [];
  }
  const out: Action[] = [];

  if (s.phase === 'INITIAL_PEEK') {
    if (!s.peekChoices[playerId]) {
      for (const slots of subsetsUpTo(occupiedSlotIndexes(p), s.config.initialPeekCount)) {
        out.push({ t: 'PEEK_INITIAL', p: playerId, slots });
      }
    }
    return out;
  }

  // Descarte Rápido: abierto para todos en TURN_DRAW y TURN_RESOLVE (docs/01 §6).
  if (matchWindowOpen(s) && !p.sealed && !isMatchLocked(s, p, s.tick)) {
    for (const slot of occupiedSlotIndexes(p)) {
      out.push({ t: 'MATCH_ATTEMPT', p: playerId, slot, tick: s.tick });
    }
  }

  const active = activePlayer(s);
  const isActive = active?.id === playerId && !p.sealed;

  if (isActive && s.phase === 'TURN_DRAW') {
    if (!s.ultimaCaller && s.orbit >= s.config.ultimaMinOrbit) {
      out.push({ t: 'CALL_ULTIMA', p: playerId }); // E19
    }
    if (canDrawDeck(s)) out.push({ t: 'DRAW_DECK', p: playerId });
    if (s.discard.length > 0 && occupiedSlotIndexes(p).length > 0) {
      out.push({ t: 'DRAW_DISCARD', p: playerId }); // E2: obliga a sustituir
    }
  }

  if (isActive && s.phase === 'TURN_RESOLVE' && s.drawn) {
    if (s.drawn.source === 'deck') out.push({ t: 'DISCARD_DRAWN', p: playerId });
    for (const slot of occupiedSlotIndexes(p)) out.push({ t: 'SWAP_DRAWN', p: playerId, slot });
  }

  if (s.phase === 'EFFECT_TARGETING' && s.effectOwner === playerId) {
    out.push({ t: 'EFFECT_SKIP', p: playerId });
    for (const target of validEffectTargets(s, playerId)) {
      out.push({ t: 'EFFECT_TARGET', p: playerId, target });
    }
  }

  return out;
}

export function legalTypes(s: GameState, playerId: string): Action['t'][] {
  return [...new Set(legalActions(s, playerId).map((a) => a.t))];
}
