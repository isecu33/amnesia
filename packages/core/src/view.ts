/**
 * Vista filtrada del jugador — docs/02 §3.6 y §6.
 * Invariante I2: aquí no puede salir NI un valor oculto NI un Card.id.
 */
import { legalTypes } from './legal.js';
import { currentOmen, playerOf } from './rules.js';
import type { GameEvent, GameState, PlayerCore, PlayerView, SlotView } from './types.js';

const slotsOf = (p: PlayerCore): SlotView[] => p.slots.map((s) => (s ? 'hidden' : 'empty'));

export function viewFor(s: GameState, playerId: string): PlayerView {
  const me = playerOf(s, playerId);
  const top = s.discard[s.discard.length - 1];
  const scores: PlayerView['scores'] = {};
  for (const p of s.players) {
    scores[p.id] =
      s.phase === 'ROUND_END' || s.phase === 'GAME_END'
        ? { round: p.roundScore, total: p.totalScore }
        : { total: p.totalScore };
  }

  const view: PlayerView = {
    you: {
      id: playerId,
      slots: me ? slotsOf(me) : [],
      sealed: me ? me.sealed : false,
      lockedForMs: me?.matchLockedUntilTick ? Math.max(0, me.matchLockedUntilTick - s.tick) : 0,
      doubleDraw: me?.doubleDrawPending ?? false,
    },
    others: s.players
      .filter((p) => p.id !== playerId)
      .map((p) => ({
        id: p.id,
        slots: slotsOf(p),
        sealed: p.sealed,
        controller: p.controller,
        doubleDraw: p.doubleDrawPending,
      })),
    deckCount: s.deck.length,
    chain: s.chain,
    phase: s.phase,
    activePlayer: s.players[s.activeIdx]?.id ?? '',
    orbit: s.orbit,
    timers: s.timers.map((t) => ({ kind: t.kind, deadlineTick: t.deadlineTick })),
    scores,
    legal: legalTypes(s, playerId),
    tick: s.tick,
  };
  if (top) view.discardTop = top.value;
  if (s.drawn) {
    // E22: el valor de la robada del mazo solo lo ve el ladrón. La del descarte es pública.
    const amThief = s.players[s.activeIdx]?.id === playerId;
    view.drawn =
      s.drawn.source === 'discard' || amThief
        ? { source: s.drawn.source, value: s.drawn.card.value }
        : { source: s.drawn.source };
  }
  const omen = currentOmen(s);
  if (omen) view.omen = omen.id;
  if (s.drawnChoice) {
    // Doble Robo: las dos cartas solo las ve el ladrón (E22).
    const amThief = s.players[s.activeIdx]?.id === playerId;
    view.drawn = { source: 'deck' };
    if (amThief) view.drawnChoice = s.drawnChoice.map((c) => c.value);
  }
  if (s.pendingEffect && s.effectOwner) {
    view.effect = {
      kind: s.pendingEffect,
      owner: s.effectOwner,
      ...(s.effectStep ? { step: s.effectStep } : {}),
    };
  }
  return view;
}

/**
 * Pliega un evento sobre una vista — «el cliente no piensa» (docs/02 §3.3).
 * Solo debe recibir eventos que le corresponden (públicos, o privados dirigidos a él).
 */
export function applyEventToView(v: PlayerView, e: GameEvent): PlayerView {
  const next: PlayerView = structuredClone(v);
  const seat = (
    id: string,
  ): { slots: SlotView[]; sealed: boolean; doubleDraw?: boolean } | undefined =>
    id === next.you.id ? next.you : next.others.find((o) => o.id === id);

  switch (e.e) {
    case 'ROUND_STARTED':
      next.discardTop = e.discardTop;
      next.activePlayer = e.startingPlayer;
      next.orbit = 1;
      next.phase = 'INITIAL_PEEK';
      next.you.sealed = false;
      delete next.omen;
      next.chain = 0;
      next.you.lockedForMs = 0;
      for (const o of next.others) o.sealed = false;
      delete next.drawn;
      break;
    case 'TURN_STARTED':
      next.activePlayer = e.player;
      next.orbit = e.orbit;
      next.phase = 'TURN_DRAW';
      next.timers = [{ kind: 'turn', deadlineTick: e.deadlineTick }];
      delete next.drawn;
      delete next.drawnChoice;
      delete next.effect;
      break;
    case 'ULTIMA_CALLED': {
      const s = seat(e.player);
      if (s) s.sealed = true;
      break;
    }
    case 'DREW':
      next.phase = 'TURN_RESOLVE';
      next.drawn = { source: e.source };
      if (e.source === 'deck') next.deckCount = Math.max(0, next.deckCount - (e.count ?? 1));
      // D-008: al llevarse la superior del descarte queda a la vista la de debajo,
      // cuyo valor el cliente no conoce por eventos. Se marca como desconocida y el
      // servidor manda un snapshot `view` justo después (docs/02 §4.1).
      else delete next.discardTop;
      break;
    case 'DREW_VALUE':
      if (next.drawn) next.drawn.value = e.value;
      break;
    case 'DISCARDED_DRAWN':
      next.discardTop = e.value;
      delete next.drawn;
      break;
    case 'SWAPPED_DRAWN':
      next.discardTop = e.discardedValue;
      delete next.drawn;
      break;
    case 'EFFECT_PENDING':
      next.phase = 'EFFECT_TARGETING';
      next.timers = [{ kind: 'effect', deadlineTick: e.deadlineTick }];
      next.effect = { kind: e.effect, owner: e.player, ...(e.step ? { step: e.step } : {}) };
      break;
    case 'EFFECT_RESOLVED':
    case 'EFFECT_SKIPPED':
      next.timers = [];
      delete next.effect;
      break;
    case 'DOUBLE_DREW_VALUES':
      next.drawnChoice = e.values.slice();
      break;
    case 'DOUBLE_DRAW_REJECTED':
      next.discardTop = e.value;
      delete next.drawnChoice;
      break;
    case 'DOUBLE_DRAW_PENDING':
    case 'DOUBLE_DRAW_CLEARED': {
      const s = seat(e.player);
      if (s) s.doubleDraw = e.e === 'DOUBLE_DRAW_PENDING';
      break;
    }
    case 'MATCH_OK': {
      const s = seat(e.player);
      if (s) s.slots[e.slot] = 'empty'; // E21: hueco, no se compacta
      next.discardTop = e.value;
      break;
    }
    case 'PENALTY_CARD': {
      const s = seat(e.player);
      if (s) {
        if (e.slot >= s.slots.length) s.slots.push('hidden');
        else s.slots[e.slot] = 'hidden';
      }
      if (next.deckCount > 0) next.deckCount -= 1;
      break;
    }
    case 'CHAIN_LINK':
      next.chain = e.link;
      break;
    case 'OMEN_CHANGED':
      if (e.omen) next.omen = e.omen;
      else delete next.omen;
      break;
    case 'CHAIN_BROKEN':
      next.chain = 0;
      break;
    case 'STEAL_WINDOW_OPENED':
      next.phase = 'STEAL_WINDOW';
      next.timers = [{ kind: 'steal', deadlineTick: e.deadlineTick }];
      next.effect = { kind: e.effect, owner: e.owner };
      break;
    case 'EFFECT_STOLEN':
      if (next.effect) next.effect = { ...next.effect, owner: e.thief };
      break;
    case 'DECK_RESHUFFLED':
      next.deckCount = e.deckCount;
      break;
    case 'ROUND_REVEAL':
      next.phase = 'ROUND_REVEAL';
      next.timers = [];
      break;
    case 'ROUND_SCORED':
      next.phase = 'ROUND_END';
      for (const [id, sc] of Object.entries(e.scores)) next.scores[id] = sc;
      break;
    case 'GAME_ENDED':
      next.phase = 'GAME_END';
      next.legal = [];
      break;
    case 'PLAYER_SEAT': {
      const o = next.others.find((x) => x.id === e.player);
      if (o) o.controller = e.controller;
      break;
    }
    // Eventos sin efecto estructural sobre la vista (solo presentación).
    case 'INITIAL_PEEK_RESULT':
    case 'PRIVATE_REVEAL':
    case 'MATCH_FAIL':
    case 'MATCH_REJECTED':
      break;
  }
  return next;
}
