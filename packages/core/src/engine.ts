/**
 * Motor de reglas de TÓTEM — docs/01 §3–§8 (NORMATIVO), docs/02 §3.
 *
 * Reglas de oro: puro (sin IO, sin Date.now, sin Math.random), inmutable,
 * `apply` nunca lanza (I3) y el estado original queda intacto.
 */
import { secondsToTicks, validateConfig } from './config.js';
import { buildDeck, effectOf } from './deck.js';
import { reduceEffect, resolveTarget } from './effects.js';
import { ERR, type Fail } from './fail.js';
import { legalActions } from './legal.js';
import {
  activePlayer,
  canDrawDeck,
  discardTopCard,
  firstFreeSlot,
  isMatchLocked,
  matchWindowOpen,
  occupiedSlotIndexes,
  playerOf,
  slotCard,
  validEffectTargets,
} from './rules.js';
import { gameWinner, score } from './score.js';
import { nextInt, shuffle } from './rng.js';
import type {
  Action,
  Card,
  CardValue,
  EffectKind,
  EffectTarget,
  GameConfig,
  GameEvent,
  GameState,
  PlayerCore,
  Result,
} from './types.js';

const clone = <T>(v: T): T => structuredClone(v);
const fail = (code: string, msg?: string): Result =>
  msg === undefined ? { ok: false, error: { code } } : { ok: false, error: { code, msg } };

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

export function createGame(config: GameConfig, playerIds: string[], seed: number): GameState {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new Error(`Config inválida: ${issues.map((i) => `${i.key}: ${i.msg}`).join('; ')}`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new Error('playerIds duplicados');
  if (playerIds.length < config.minPlayers || playerIds.length > config.maxPlayers) {
    throw new Error(`Número de jugadores fuera de [${config.minPlayers}, ${config.maxPlayers}]`);
  }
  if (!Number.isInteger(seed)) throw new Error('seed debe ser entero');

  const players: PlayerCore[] = playerIds.map((id) => ({
    id,
    slots: [],
    roundScore: 0,
    totalScore: 0,
    sealed: false,
    controller: 'human',
    penaltyPoints: 0,
    doubleDrawPending: false,
    chainPoints: 0,
  }));

  const s: GameState = {
    config,
    seed,
    rngCounter: 0,
    deck: [],
    discard: [],
    players,
    turnOrder: playerIds.slice(),
    activeIdx: 0,
    orbit: 1,
    phase: 'INITIAL_PEEK',
    reshuffles: 0,
    tick: 0,
    lastDiscardChangeTick: 0,
    race: { open: true, hit: false },
    chain: 0,
    peekChoices: {},
    peekAutoCompleted: false,
    timers: [],
    roundStarter: playerIds[0] as string,
    round: 1,
  };

  // Ronda 1: empieza un jugador aleatorio (docs/01 §3.5).
  const [idx, c] = nextInt(seed, s.rngCounter, playerIds.length);
  s.rngCounter = c;
  setupRound(s, playerIds[idx] as string);
  return s;
}

/** Prepara una ronda: baraja, reparte, voltea la primera al descarte (E1). */
function setupRound(s: GameState, startingPlayerId: string): void {
  const c = s.config;
  const [deck, counter] = shuffle(buildDeck(), s.seed, s.rngCounter);
  s.rngCounter = counter;
  s.deck = deck;
  s.discard = [];

  for (const p of s.players) {
    p.slots = s.deck.splice(0, c.initialSlots);
    p.roundScore = 0;
    p.penaltyPoints = 0;
    p.doubleDrawPending = false;
    p.chainPoints = 0;
    p.sealed = false;
    delete p.matchLockedUntilTick;
  }

  const first = s.deck.pop();
  if (first) s.discard.push(first); // E1: la carta inicial nunca activa efecto

  s.phase = 'INITIAL_PEEK';
  s.peekChoices = {};
  s.peekAutoCompleted = false;
  s.orbit = 1;
  s.roundStarter = startingPlayerId;
  s.activeIdx = Math.max(
    0,
    s.players.findIndex((p) => p.id === startingPlayerId),
  );
  delete s.ultimaCaller;
  delete s.turnsLeftAfterUltima;
  delete s.drawn;
  delete s.pendingEffect;
  delete s.effectOwner;
  delete s.emptyAltarWinner;
  delete s.firstMatchAttemptTick;
  delete s.drawnChoice;
  s.reshuffles = 0;
  s.lastDiscardChangeTick = s.tick;
  s.race = { open: true, hit: false }; // #16: la carta inicial también abre carrera
  s.chain = 0;
  s.timers = [
    { kind: 'peek', deadlineTick: s.tick + secondsToTicks(c.autoPeekAtSecond) },
    { kind: 'peek', deadlineTick: s.tick + secondsToTicks(c.initialPeekSeconds) },
  ];
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function apply(s: GameState, a: Action): Result {
  try {
    return dispatch(s, a);
  } catch (err) {
    // I3: apply NUNCA lanza. Un fallo interno deja el estado original intacto.
    return fail('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

function dispatch(prev: GameState, a: Action): Result {
  if (!a || typeof a !== 'object' || typeof a.t !== 'string') return fail('BAD_ACTION');
  if (prev.phase === 'GAME_END') return fail('GAME_OVER'); // I7: absorbente

  const s = clone(prev);
  const ev: GameEvent[] = [];
  const at = typeof a.tick === 'number' && Number.isFinite(a.tick) ? a.tick : s.tick;
  if (at > s.tick) s.tick = at;

  switch (a.t) {
    case 'PEEK_INITIAL':
      return finish(s, ev, peekInitial(s, ev, a.p, a.slots));
    case 'CALL_ULTIMA':
      return finish(s, ev, callUltima(s, ev, a.p));
    case 'DRAW_DECK':
      return finish(s, ev, drawDeck(s, ev, a.p));
    case 'DRAW_DISCARD':
      return finish(s, ev, drawDiscard(s, ev, a.p));
    case 'DISCARD_DRAWN':
      return finish(s, ev, discardDrawn(s, ev, a.p));
    case 'SWAP_DRAWN':
      return finish(s, ev, swapDrawn(s, ev, a.p, a.slot));
    case 'EFFECT_TARGET':
      return finish(s, ev, effectTarget(s, ev, a.p, a.target));
    case 'DOUBLE_DRAW_KEEP':
      return finish(s, ev, doubleDrawKeep(s, ev, a.p, a.index));
    case 'EFFECT_SKIP':
      return finish(s, ev, effectSkip(s, ev, a.p));
    case 'MATCH_ATTEMPT':
      return finish(s, ev, matchAttempt(s, ev, a.p, a.slot, at));
    case 'TIMER_FIRED':
      return finish(s, ev, timerFired(s, ev, a.timer));
    case 'START_ROUND':
      return finish(s, ev, startRound(s, ev));
    case 'FORFEIT':
      return finish(s, ev, forfeit(s, ev, a.p));
    default:
      return fail('UNKNOWN_ACTION');
  }
}

function finish(s: GameState, events: GameEvent[], err: Fail): Result {
  if (err) return fail(err.code, err.msg);
  return { ok: true, state: s, events };
}

// ---------------------------------------------------------------------------
// Vislumbre inicial (docs/01 §3.4)
// ---------------------------------------------------------------------------

function peekInitial(s: GameState, ev: GameEvent[], pid: string, slots: number[]): Fail {
  if (s.phase !== 'INITIAL_PEEK') return ERR('WRONG_PHASE');
  const p = playerOf(s, pid);
  if (!p) return ERR('NO_SUCH_PLAYER');
  if (s.peekChoices[pid]) return ERR('ALREADY_PEEKED');
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > s.config.initialPeekCount) {
    return ERR('BAD_PEEK_COUNT');
  }
  if (new Set(slots).size !== slots.length) return ERR('DUPLICATE_SLOTS');
  for (const slot of slots) if (!slotCard(p, slot)) return ERR('BAD_SLOT');

  const sorted = slots.slice().sort((x, y) => x - y);
  s.peekChoices[pid] = sorted;
  ev.push(revealChoices(p, sorted));
  return null;
}

function revealChoices(p: PlayerCore, slots: number[]): GameEvent {
  return {
    e: 'INITIAL_PEEK_RESULT',
    to: p.id,
    cards: slots.map((slot) => ({ slot, value: (p.slots[slot] as Card).value })),
  };
}

/** autoPeekAtSecond: completa las elecciones que falten empezando por el slot 0. */
function autoCompletePeek(s: GameState, ev: GameEvent[]): void {
  for (const p of s.players) {
    const already = s.peekChoices[p.id] ?? [];
    if (already.length >= s.config.initialPeekCount) continue;
    const chosen = already.slice();
    for (const slot of occupiedSlotIndexes(p)) {
      if (chosen.length >= s.config.initialPeekCount) break;
      if (!chosen.includes(slot)) chosen.push(slot);
    }
    chosen.sort((x, y) => x - y);
    s.peekChoices[p.id] = chosen;
    const added = chosen.filter((sl) => !already.includes(sl));
    if (added.length > 0) ev.push(revealChoices(p, added));
  }
  s.peekAutoCompleted = true;
}

// ---------------------------------------------------------------------------
// Ciclo de turno (docs/01 §4)
// ---------------------------------------------------------------------------

function beginTurn(s: GameState, ev: GameEvent[]): void {
  const p = activePlayer(s);
  if (!p) return;
  s.phase = 'TURN_DRAW';
  delete s.drawn;
  delete s.pendingEffect;
  delete s.effectOwner;
  const deadlineTick = s.tick + secondsToTicks(s.config.turnSeconds);
  s.timers = [{ kind: 'turn', deadlineTick }];
  ev.push({ e: 'TURN_STARTED', player: p.id, orbit: s.orbit, deadlineTick });

  // E3 (cola): si el jugador activo no tiene ninguna acción de turno posible
  // (ni robar del mazo, ni del descarte, ni cantar), la ronda termina.
  const turnActions = legalActions(s, p.id).filter((a) => a.t !== 'MATCH_ATTEMPT');
  if (turnActions.length === 0) revealRound(s, ev);
}

function endTurn(s: GameState, ev: GameEvent[], wasUltimaCall = false): void {
  if (s.phase === 'ROUND_REVEAL' || s.phase === 'ROUND_END' || s.phase === 'GAME_END') return;

  if (s.ultimaCaller && !wasUltimaCall) {
    s.turnsLeftAfterUltima = (s.turnsLeftAfterUltima ?? 0) - 1;
    if (s.turnsLeftAfterUltima <= 0) {
      revealRound(s, ev);
      return;
    }
  }

  const n = s.players.length;
  let next = s.activeIdx;
  let orbitBump = false;
  for (let step = 0; step < n; step++) {
    next = (next + 1) % n;
    if ((s.players[next] as PlayerCore).id === s.roundStarter) orbitBump = true;
    if (!(s.players[next] as PlayerCore).sealed) break;
    if (step === n - 1) {
      revealRound(s, ev); // todos sellados: no queda nadie por jugar
      return;
    }
  }
  s.activeIdx = next;
  if (orbitBump) s.orbit += 1;
  beginTurn(s, ev);
}

function requireActive(s: GameState, pid: string): PlayerCore | Fail {
  const p = playerOf(s, pid);
  if (!p) return ERR('NO_SUCH_PLAYER');
  if ((activePlayer(s) as PlayerCore).id !== pid) return ERR('NOT_YOUR_TURN');
  if (p.sealed) return ERR('SEALED');
  return p;
}
const isFail = (v: PlayerCore | Fail): v is Fail => v === null || !('id' in (v as object));

/** E3: rebaraja el descarte salvo la superior la primera vez que el mazo se vacía. */
function reshuffleDiscardIntoDeck(s: GameState, ev: GameEvent[]): boolean {
  if (s.reshuffles !== 0 || s.discard.length <= 1) return false;
  const top = s.discard.pop() as Card;
  const [shuffled, counter] = shuffle(s.discard, s.seed, s.rngCounter);
  s.rngCounter = counter;
  s.deck = shuffled;
  s.discard = [top];
  s.reshuffles = 1;
  ev.push({ e: 'DECK_RESHUFFLED', deckCount: s.deck.length });
  return true;
}

/** Saca una carta del mazo, rebarajando si hace falta. undefined = no hay carta. */
function takeFromDeck(s: GameState, ev: GameEvent[]): Card | undefined {
  if (s.deck.length === 0) reshuffleDiscardIntoDeck(s, ev);
  return s.deck.pop();
}

function drawDeck(s: GameState, ev: GameEvent[], pid: string): Fail {
  if (s.phase !== 'TURN_DRAW') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  if (!canDrawDeck(s)) return ERR('DECK_EMPTY');

  if (s.deck.length === 0 && s.reshuffles > 0) {
    revealRound(s, ev); // 2º agotamiento del mazo (docs/01 §7.3, E3)
    return null;
  }
  const card = takeFromDeck(s, ev);
  if (!card) {
    revealRound(s, ev);
    return null;
  }
  s.phase = 'TURN_RESOLVE';
  const second = p.doubleDrawPending && s.deck.length > 0 ? s.deck.pop() : undefined;
  if (p.doubleDrawPending) clearDoubleDraw(s, ev, p, 'used');
  if (second) {
    // E31: con 1 sola carta en el mazo solo se ve esa; si no, se eligen 1 de 2.
    s.drawnChoice = [card, second];
    ev.push({ e: 'DREW', player: pid, source: 'deck', count: 2 });
    ev.push({ e: 'DOUBLE_DREW_VALUES', to: pid, values: [card.value, second.value] });
    return null;
  }
  s.drawn = { card, source: 'deck' };
  ev.push({ e: 'DREW', player: pid, source: 'deck' });
  ev.push({ e: 'DREW_VALUE', to: pid, value: card.value }); // E22: solo el ladrón
  return null;
}

function clearDoubleDraw(
  s: GameState,
  ev: GameEvent[],
  p: PlayerCore,
  reason: 'used' | 'passed' | 'lost',
): void {
  if (!p.doubleDrawPending) return;
  p.doubleDrawPending = false;
  ev.push({ e: 'DOUBLE_DRAW_CLEARED', player: p.id, reason });
}

/** Concede el Doble Robo (no acumulable, E30) y termina el turno. */
function grantDoubleDraw(s: GameState, ev: GameEvent[], p: PlayerCore): void {
  if (!p.doubleDrawPending) {
    p.doubleDrawPending = true;
    ev.push({ e: 'DOUBLE_DRAW_PENDING', player: p.id });
  }
  endTurn(s, ev);
}

function doubleDrawKeep(s: GameState, ev: GameEvent[], pid: string, index: number): Fail {
  if (s.phase !== 'TURN_RESOLVE') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  const pair = s.drawnChoice;
  if (!pair) return ERR('NOTHING_TO_CHOOSE');
  if (index !== 0 && index !== 1) return ERR('BAD_INDEX');
  const kept = pair[index] as Card;
  const rejected = pair[1 - index] as Card;
  delete s.drawnChoice;
  s.drawn = { card: kept, source: 'deck' };
  s.discard.push(rejected); // E32: boca arriba y sin efecto
  touchDiscard(s, ev);
  ev.push({ e: 'DOUBLE_DRAW_REJECTED', player: pid, value: rejected.value });
  ev.push({ e: 'DREW_VALUE', to: pid, value: kept.value });
  return null;
}

function drawDiscard(s: GameState, ev: GameEvent[], pid: string): Fail {
  if (s.phase !== 'TURN_DRAW') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  if (s.discard.length === 0) return ERR('DISCARD_EMPTY');
  // E2: robar del descarte obliga a sustituir, así que hace falta un slot ocupado.
  if (occupiedSlotIndexes(p).length === 0) return ERR('NO_SLOT_TO_SWAP');

  const card = s.discard.pop() as Card;
  s.drawn = { card, source: 'discard' };
  clearDoubleDraw(s, ev, p, 'lost'); // E29: robar del descarte pierde el Doble Robo
  s.phase = 'TURN_RESOLVE';
  touchDiscard(s, ev, false); // la expuesta no abre carrera (#16)
  ev.push({ e: 'DREW', player: pid, source: 'discard' });
  return null;
}

/** La carta superior del descarte ha cambiado: reinicia el ancla de arbitraje (E5/E7). */
function touchDiscard(s: GameState, ev: GameEvent[], opensRace = true): void {
  s.lastDiscardChangeTick = s.tick;
  delete s.firstMatchAttemptTick;
  if (opensRace) openRace(s, ev);
  else s.race = { ...s.race, open: false };
}

/**
 * #16: un descarte normal abre una carrera nueva (máx. un acierto). Si la
 * anterior terminó sin acierto, la cadena se rompe.
 */
function openRace(s: GameState, ev: GameEvent[]): void {
  if (!s.race.hit && s.chain > 0) {
    ev.push({ e: 'CHAIN_BROKEN', links: s.chain });
    s.chain = 0;
  }
  s.race = { open: true, hit: false };
}

/** Un acierto cierra la carrera, alarga la cadena y, desde el 2.º eslabón, premia (#16). */
function registerHit(s: GameState, ev: GameEvent[], p: PlayerCore): void {
  s.race = { open: false, hit: true };
  s.chain += 1;
  const bonus = s.chain >= 2 ? s.config.chainBonusPerLink : 0;
  p.chainPoints += bonus;
  ev.push({ e: 'CHAIN_LINK', player: p.id, link: s.chain, bonus });
}

function discardDrawn(s: GameState, ev: GameEvent[], pid: string): Fail {
  if (s.phase !== 'TURN_RESOLVE') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  if (!s.drawn) return ERR('NOTHING_DRAWN');
  if (s.drawn.source === 'discard') return ERR('CANNOT_RETURN_TO_DISCARD'); // E2

  const card = s.drawn.card;
  delete s.drawn;
  s.discard.push(card);
  touchDiscard(s, ev);
  const effect = effectOf(card.value);
  ev.push(
    effect === undefined
      ? { e: 'DISCARDED_DRAWN', player: pid, value: card.value }
      : { e: 'DISCARDED_DRAWN', player: pid, value: card.value, effect },
  );
  if (effect) return openStealWindow(s, ev, pid, effect); // E23
  endTurn(s, ev);
  return null;
}

/** #14: ventana de Robo de efecto con el Descarte Rápido abierto, antes del targeting. */
function openStealWindow(s: GameState, ev: GameEvent[], pid: string, effect: EffectKind): Fail {
  s.phase = 'STEAL_WINDOW';
  s.pendingEffect = effect;
  s.effectOwner = pid;
  const deadlineTick = s.tick + s.config.stealWindowMs;
  s.timers = [{ kind: 'steal', deadlineTick }];
  ev.push({ e: 'STEAL_WINDOW_OPENED', owner: pid, effect, deadlineTick });
  return null;
}

/** La ventana termina (por reloj o porque el dueño acertó): el efecto se ejecuta para `pid`. */
function runEffect(s: GameState, ev: GameEvent[], pid: string): Fail {
  const effect = s.pendingEffect as EffectKind;
  if (effect === 'DOUBLE_DRAW') {
    closeEffect(s);
    grantDoubleDraw(s, ev, playerOf(s, pid) as PlayerCore);
    return null;
  }
  return openEffect(s, ev, pid, effect);
}

function swapDrawn(s: GameState, ev: GameEvent[], pid: string, slot: number): Fail {
  if (s.phase !== 'TURN_RESOLVE') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  if (!s.drawn) return ERR('NOTHING_DRAWN');
  const out = slotCard(p, slot);
  if (!out) return ERR('BAD_SLOT');

  p.slots[slot] = s.drawn.card;
  delete s.drawn;
  s.discard.push(out);
  touchDiscard(s, ev);
  // El efecto de la carta que SALE nunca se activa (docs/01 §4 C2).
  ev.push({ e: 'SWAPPED_DRAWN', player: pid, slot, discardedValue: out.value });
  endTurn(s, ev);
  return null;
}

// ---------------------------------------------------------------------------
// Efectos (docs/01 §5, #13)
// ---------------------------------------------------------------------------

function openEffect(s: GameState, ev: GameEvent[], pid: string, effect: EffectKind): Fail {
  const kind = reduceEffect(s, pid, effect);
  s.pendingEffect = kind;
  s.effectOwner = pid;
  if (kind === 'SEER') s.effectStep = 1;
  if (validEffectTargets(s, pid).length === 0) {
    // E8: sin objetivos válidos, se omite automáticamente.
    closeEffect(s);
    ev.push({ e: 'EFFECT_SKIPPED', player: pid, reason: 'noTargets' });
    endTurn(s, ev);
    return null;
  }
  s.phase = 'EFFECT_TARGETING';
  const deadlineTick = s.tick + secondsToTicks(s.config.effectTargetSeconds);
  s.timers = [{ kind: 'effect', deadlineTick }];
  ev.push(
    kind === 'SEER'
      ? { e: 'EFFECT_PENDING', player: pid, effect: kind, deadlineTick, step: 1 }
      : { e: 'EFFECT_PENDING', player: pid, effect: kind, deadlineTick },
  );
  return null;
}

function closeEffect(s: GameState): void {
  delete s.pendingEffect;
  delete s.effectOwner;
  delete s.effectStep;
}

function effectTarget(s: GameState, ev: GameEvent[], pid: string, target: EffectTarget): Fail {
  if (s.phase !== 'EFFECT_TARGETING') return ERR('WRONG_PHASE');
  if (s.effectOwner !== pid) return ERR('NOT_EFFECT_OWNER');
  const out = resolveTarget(s, ev, pid, target);
  if (out === 'STEP2') return null;
  if (out !== 'DONE') return out;
  closeEffect(s);
  endTurn(s, ev);
  return null;
}

function effectSkip(s: GameState, ev: GameEvent[], pid: string): Fail {
  if (s.phase === 'TURN_DRAW') {
    // «Pasar» el Doble Robo pendiente: el turno sigue con un robo normal de 1.
    const p = requireActive(s, pid);
    if (isFail(p)) return p;
    if (!p.doubleDrawPending) return ERR('WRONG_PHASE');
    clearDoubleDraw(s, ev, p, 'passed');
    return null;
  }
  if (s.phase !== 'EFFECT_TARGETING') return ERR('WRONG_PHASE');
  if (s.effectOwner !== pid) return ERR('NOT_EFFECT_OWNER');
  closeEffect(s);
  ev.push({ e: 'EFFECT_SKIPPED', player: pid, reason: 'chosen' });
  endTurn(s, ev);
  return null;
}

// ---------------------------------------------------------------------------
// Descarte Rápido (docs/01 §6)
// ---------------------------------------------------------------------------

function matchAttempt(
  s: GameState,
  ev: GameEvent[],
  pid: string,
  slot: number,
  atTick: number,
): Fail {
  const p = playerOf(s, pid);
  if (!p) return ERR('NO_SUCH_PLAYER');

  // E20: ventana cerrada → rechazado sin castigo, con feedback.
  if (!matchWindowOpen(s)) {
    ev.push({ e: 'MATCH_REJECTED', player: pid, reason: 'window' });
    return null;
  }
  // I6: el cantor sellado no puede hacer Descarte Rápido.
  if (p.sealed || isMatchLocked(s, p, atTick)) {
    ev.push({ e: 'MATCH_REJECTED', player: pid, reason: 'locked' });
    return null;
  }
  // E5: solo se procesa el primer intento sobre una carta superior dada.
  if (
    s.firstMatchAttemptTick !== undefined &&
    atTick - s.firstMatchAttemptTick < s.config.matchArbitrationMs
  ) {
    ev.push({ e: 'MATCH_REJECTED', player: pid, reason: 'tooLate' });
    return null;
  }
  const top = discardTopCard(s);
  if (!top) {
    ev.push({ e: 'MATCH_REJECTED', player: pid, reason: 'window' });
    return null;
  }
  // #16: tras un acierto el tótem acertado queda arriba pero NO es casable.
  if (!s.race.open) {
    ev.push({ e: 'MATCH_REJECTED', player: pid, reason: 'tooLate' });
    return null;
  }
  const card = slotCard(p, slot);
  if (!card) return ERR('BAD_SLOT');

  s.firstMatchAttemptTick = atTick;

  // E7: se evalúa contra la carta superior vigente en el momento de recepción.
  if (card.value === top.value) {
    p.slots[slot] = null; // E21: hueco, jamás compactar
    s.discard.push(card);
    s.lastDiscardChangeTick = atTick;
    // E5: el ancla de arbitraje NO se reinicia con el propio acierto.
    ev.push({ e: 'MATCH_OK', player: pid, slot, value: card.value });
    const inWindow = s.phase === 'STEAL_WINDOW';
    registerHit(s, ev, p);
    if (occupiedSlotIndexes(p).length === 0) {
      s.emptyAltarWinner = pid; // E6: victoria de ronda instantánea
      revealRound(s, ev); // E27: cancela también la ventana/efecto
    }
    if (inWindow && s.phase === 'STEAL_WINDOW') {
      const owner = s.effectOwner as string;
      if (pid === owner) return runEffect(s, ev, owner); // E24: conserva el efecto
      // E25: el primer acierto de rival se lleva el efecto (la carrera ya quedó cerrada).
      ev.push({ e: 'EFFECT_STOLEN', thief: pid, owner, effect: s.pendingEffect as EffectKind });
      s.effectOwner = pid;
      return runEffect(s, ev, pid);
    }
    return null;
  }

  applyMatchPenalty(s, ev, p, slot, card.value, atTick);
  return null;
}

function applyMatchPenalty(
  s: GameState,
  ev: GameEvent[],
  p: PlayerCore,
  slot: number,
  value: CardValue,
  atTick: number,
): void {
  const c = s.config;
  const drawnCards: { slot: number; card: Card }[] = [];
  const pending: GameEvent[] = [];
  let pointsAdded = 0;

  for (let i = 0; i < c.matchFailPenaltyCards; i++) {
    const free = firstFreeSlot(p, c.maxSlots);
    const card = free === -1 ? undefined : takeFromDeck(s, pending);
    if (free === -1 || !card) {
      // E13 (mano llena) y E4 (mazo agotado) → puntos en lugar de carta.
      pointsAdded += c.fullHandPenaltyPoints;
      continue;
    }
    if (free === p.slots.length) p.slots.push(card);
    else p.slots[free] = card;
    drawnCards.push({ slot: free, card });
  }

  p.penaltyPoints += pointsAdded;
  const penalty: 'card' | 'points' = drawnCards.length > 0 ? 'card' : 'points';
  ev.push({ e: 'MATCH_FAIL', player: p.id, slot, value, penalty });
  ev.push(...pending); // DECK_RESHUFFLED si robar el castigo obligó a rebarajar
  for (const d of drawnCards) ev.push({ e: 'PENALTY_CARD', player: p.id, slot: d.slot });

  p.matchLockedUntilTick = atTick + secondsToTicks(c.matchFailLockoutSeconds);
}

// ---------------------------------------------------------------------------
// ÚLTIMA, fin de ronda y puntuación (docs/01 §7–§8)
// ---------------------------------------------------------------------------

function callUltima(s: GameState, ev: GameEvent[], pid: string): Fail {
  if (s.phase !== 'TURN_DRAW') return ERR('WRONG_PHASE');
  const p = requireActive(s, pid);
  if (isFail(p)) return p;
  if (s.ultimaCaller) return ERR('ULTIMA_ALREADY_CALLED');
  if (s.orbit < s.config.ultimaMinOrbit) return ERR('ULTIMA_TOO_EARLY'); // E19

  clearDoubleDraw(s, ev, p, 'lost'); // E29
  s.ultimaCaller = pid;
  p.sealed = true; // E10: sellado como objetivo de todo efecto
  s.turnsLeftAfterUltima = s.players.length - 1;
  ev.push({ e: 'ULTIMA_CALLED', player: pid });
  endTurn(s, ev, true);
  return null;
}

function revealRound(s: GameState, ev: GameEvent[]): void {
  if (s.phase === 'ROUND_REVEAL' || s.phase === 'ROUND_END' || s.phase === 'GAME_END') return;
  // I1: la carta en mano vuelve al descarte para que se conserven las 52.
  if (s.drawn) {
    s.discard.push(s.drawn.card);
    delete s.drawn;
  }
  if (s.drawnChoice) {
    s.discard.push(...s.drawnChoice);
    delete s.drawnChoice;
  }
  closeEffect(s);
  s.phase = 'ROUND_REVEAL';
  const hands: Record<string, (CardValue | null)[]> = {};
  for (const p of s.players) hands[p.id] = p.slots.map((sl) => (sl ? sl.value : null));
  ev.push({ e: 'ROUND_REVEAL', hands });
  s.timers = [
    { kind: 'reveal', deadlineTick: s.tick + secondsToTicks(s.config.revealPauseSeconds) },
  ];
}

function scoreRound(s: GameState, ev: GameEvent[]): void {
  const result = score(s);
  const scores: Record<string, { round: number; total: number }> = {};
  for (const p of s.players) {
    const r = result.perPlayer[p.id];
    p.roundScore = r ? r.round : 0;
    p.totalScore += p.roundScore;
    scores[p.id] = { round: p.roundScore, total: p.totalScore };
  }
  ev.push(
    result.ultimaSuccess === undefined
      ? { e: 'ROUND_SCORED', scores }
      : { e: 'ROUND_SCORED', scores, ultimaSuccess: result.ultimaSuccess },
  );

  const over =
    s.config.mode === 'quick' || s.players.some((p) => p.totalScore >= s.config.gameEndScore);
  if (over) {
    s.phase = 'GAME_END';
    s.winner = gameWinner(s);
    const totals: Record<string, number> = {};
    for (const p of s.players) totals[p.id] = p.totalScore;
    ev.push({ e: 'GAME_ENDED', winner: s.winner, totals });
  } else {
    s.phase = 'ROUND_END';
  }
  s.timers = [];
}

function startRound(s: GameState, ev: GameEvent[]): Fail {
  if (s.phase !== 'ROUND_END') return ERR('WRONG_PHASE');
  // docs/01 §3.5: empieza quien menos puntuó; desempate aleatorio.
  const min = Math.min(...s.players.map((p) => p.roundScore));
  const tied = s.players.filter((p) => p.roundScore === min).map((p) => p.id);
  let starter = tied[0] as string;
  if (tied.length > 1) {
    const [i, c] = nextInt(s.seed, s.rngCounter, tied.length);
    s.rngCounter = c;
    starter = tied[i] as string;
  }
  s.round += 1;
  setupRound(s, starter);
  ev.push({
    e: 'ROUND_STARTED',
    order: s.turnOrder.slice(),
    discardTop: (discardTopCard(s) as Card).value,
    startingPlayer: starter,
  });
  return null;
}

function forfeit(s: GameState, ev: GameEvent[], pid: string): Fail {
  const p = playerOf(s, pid);
  if (!p) return ERR('NO_SUCH_PLAYER');
  if (p.controller === 'bot') return ERR('ALREADY_BOT');
  p.controller = 'bot'; // E16: un bot juega su asiento
  ev.push({ e: 'PLAYER_SEAT', player: pid, controller: 'bot' });
  return null;
}

/** Devuelve el asiento a un humano (reconexión, E18). Additivo sobre la API congelada. */
export function setController(s: GameState, pid: string, controller: 'human' | 'bot'): Result {
  const next = clone(s);
  const p = playerOf(next, pid);
  if (!p) return fail('NO_SUCH_PLAYER');
  p.controller = controller;
  return { ok: true, state: next, events: [{ e: 'PLAYER_SEAT', player: pid, controller }] };
}

// ---------------------------------------------------------------------------
// Timers (el tiempo entra en core solo por aquí)
// ---------------------------------------------------------------------------

function timerFired(s: GameState, ev: GameEvent[], timer: string): Fail {
  switch (timer) {
    case 'peek': {
      if (s.phase !== 'INITIAL_PEEK') return ERR('WRONG_PHASE');
      if (!s.peekAutoCompleted) {
        autoCompletePeek(s, ev);
        return null;
      }
      s.timers = [];
      beginTurn(s, ev);
      return null;
    }
    case 'turn': {
      if (s.phase === 'TURN_DRAW') return autoTurn(s, ev);
      if (s.phase === 'TURN_RESOLVE') return autoResolve(s, ev);
      return ERR('WRONG_PHASE');
    }
    case 'steal': {
      if (s.phase !== 'STEAL_WINDOW') return ERR('WRONG_PHASE');
      return runEffect(s, ev, s.effectOwner as string);
    }
    case 'effect': {
      if (s.phase !== 'EFFECT_TARGETING') return ERR('WRONG_PHASE');
      const owner = s.effectOwner as string;
      closeEffect(s);
      ev.push({ e: 'EFFECT_SKIPPED', player: owner, reason: 'timeout' }); // E9
      endTurn(s, ev);
      return null;
    }
    case 'reveal': {
      if (s.phase !== 'ROUND_REVEAL') return ERR('WRONG_PHASE');
      scoreRound(s, ev);
      return null;
    }
    default:
      return ERR('UNKNOWN_TIMER');
  }
}

/** E15: timeout de turno = robar del mazo y descartar SIN activar efecto. */
function autoTurn(s: GameState, ev: GameEvent[]): Fail {
  const p = activePlayer(s) as PlayerCore;
  clearDoubleDraw(s, ev, p, 'lost'); // E29: el reloj de turno pierde el Doble Robo
  const card = canDrawDeck(s) ? takeFromDeck(s, ev) : undefined;
  if (!card) {
    endTurn(s, ev);
    return null;
  }
  ev.push({ e: 'DREW', player: p.id, source: 'deck' });
  ev.push({ e: 'DREW_VALUE', to: p.id, value: card.value });
  s.discard.push(card);
  touchDiscard(s, ev);
  ev.push({ e: 'DISCARDED_DRAWN', player: p.id, value: card.value }); // sin `effect`
  endTurn(s, ev);
  return null;
}

/** Timeout con carta ya en mano: se resuelve sin efecto. */
function autoResolve(s: GameState, ev: GameEvent[]): Fail {
  const p = activePlayer(s) as PlayerCore;
  if (s.drawnChoice) {
    // Doble Robo sin elegir al expirar el reloj: ambas al descarte, sin efecto (E15).
    for (const c of s.drawnChoice.slice().reverse()) {
      s.discard.push(c);
      ev.push({ e: 'DOUBLE_DRAW_REJECTED', player: p.id, value: c.value });
    }
    delete s.drawnChoice;
    touchDiscard(s, ev);
    endTurn(s, ev);
    return null;
  }
  if (!s.drawn) return ERR('NOTHING_DRAWN');
  const { card, source } = s.drawn;
  delete s.drawn;
  if (source === 'deck') {
    s.discard.push(card);
    touchDiscard(s, ev);
    ev.push({ e: 'DISCARDED_DRAWN', player: p.id, value: card.value });
  } else {
    // E2: la robada del descarte obliga a sustituir; se usa el primer slot ocupado.
    const slot = occupiedSlotIndexes(p)[0];
    if (slot === undefined) {
      s.discard.push(card);
      touchDiscard(s, ev);
      ev.push({ e: 'DISCARDED_DRAWN', player: p.id, value: card.value });
    } else {
      const out = p.slots[slot] as Card;
      p.slots[slot] = card;
      s.discard.push(out);
      touchDiscard(s, ev);
      ev.push({ e: 'SWAPPED_DRAWN', player: p.id, slot, discardedValue: out.value });
    }
  }
  endTurn(s, ev);
  return null;
}
