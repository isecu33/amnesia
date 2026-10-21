/**
 * Tutorial guiado de 6 pasos contra un bot scriptado — guion de docs/01 §11.
 * Corre 100 % en local contra `core` (sin servidor), así que es determinista y
 * testeable. Cada paso prepara el estado y solo acepta la acción que enseña.
 */
import {
  apply,
  createGame,
  legalActions,
  makeConfig,
  viewFor,
  type Action,
  type Card,
  type CardValue,
  type GameEvent,
  type GameState,
  type PlayerView,
} from '@totem/core';
import type { ClientAction } from '@totem/protocol';
import type { TKey } from '../i18n/index.js';

export const YOU = 'you';
export const BOT = 'bot';

export interface TutorialStep {
  id: number;
  textKey: TKey;
  /** ¿es esta la acción que el paso está enseñando? */
  accepts(a: Action, s: GameState): boolean;
}

export const STEPS: TutorialStep[] = [
  { id: 1, textKey: 't1', accepts: (a) => a.t === 'PEEK_INITIAL' },
  { id: 2, textKey: 't2', accepts: (a) => a.t === 'SWAP_DRAWN' || a.t === 'DRAW_DECK' },
  {
    id: 3,
    textKey: 't3',
    accepts: (a) => a.t === 'DRAW_DECK' || a.t === 'DISCARD_DRAWN' || a.t === 'EFFECT_TARGET',
  },
  { id: 4, textKey: 't4', accepts: (a) => a.t === 'MATCH_ATTEMPT' },
  { id: 5, textKey: 't5', accepts: (a) => a.t === 'MATCH_ATTEMPT' },
  { id: 6, textKey: 't6', accepts: (a) => a.t === 'CALL_ULTIMA' },
];

/** Cambia el valor de una carta del mazo conservando las 52 (I1). */
function retag(s: GameState, value: CardValue): Card {
  const i = s.deck.findIndex((c) => c.value === value);
  if (i !== -1) return s.deck.splice(i, 1)[0] as Card;
  const any = s.deck.pop();
  if (!any) throw new Error('mazo vacío');
  return { id: any.id, value };
}

function setSlot(s: GameState, pid: string, slot: number, value: CardValue): void {
  const p = s.players.find((x) => x.id === pid);
  if (!p) return;
  const card = retag(s, value);
  const old = p.slots[slot];
  p.slots[slot] = card;
  if (old) s.deck.push(old);
}

function setDeckTop(s: GameState, value: CardValue): void {
  s.deck.push(retag(s, value));
}

function setDiscardTop(s: GameState, value: CardValue): void {
  const card = retag(s, value);
  const old = s.discard.pop();
  if (old) s.deck.push(old);
  s.discard.push(card);
}

export class Tutorial {
  private state: GameState;
  private stepIdx = 0;
  private clock = 10_000;
  readonly events: GameEvent[] = [];

  constructor() {
    this.state = createGame(makeConfig({ mode: 'quick', initialSlots: 4 }), [YOU, BOT], 1);
    // Guion fijo: tus tótems y los del bot son conocidos de antemano.
    setSlot(this.state, YOU, 0, 4);
    setSlot(this.state, YOU, 1, 9);
    setSlot(this.state, YOU, 2, 2);
    setSlot(this.state, YOU, 3, 3);
    setSlot(this.state, BOT, 0, 5);
    setSlot(this.state, BOT, 1, 6);
    setSlot(this.state, BOT, 2, 8);
    setSlot(this.state, BOT, 3, 12);
    this.state.roundStarter = YOU;
    this.state.activeIdx = 0;
    this.enterStep();
  }

  get step(): TutorialStep {
    return STEPS[Math.min(this.stepIdx, STEPS.length - 1)] as TutorialStep;
  }
  get stepNumber(): number {
    return Math.min(this.stepIdx + 1, STEPS.length);
  }
  get done(): boolean {
    return this.stepIdx >= STEPS.length;
  }
  view(): PlayerView {
    return viewFor(this.state, YOU);
  }
  legal(): Action[] {
    return legalActions(this.state, YOU);
  }

  /** Prepara el estado para que el paso actual sea siempre jugable. */
  private enterStep(): void {
    const s = this.state;
    switch (this.stepIdx + 1) {
      case 1:
        s.phase = 'INITIAL_PEEK';
        break;
      case 2:
        this.toYourTurn();
        setDeckTop(s, 1); // robarás un 1: mejora clarísima
        break;
      case 3:
        this.toYourTurn();
        setDeckTop(s, 7); // Búho: activa Vislumbre
        break;
      case 4:
        // El bot acaba de descartar un 4 y tú tienes un 4 en el slot 0.
        this.toYourTurn();
        setSlot(s, YOU, 0, 4);
        setDiscardTop(s, 4);
        this.clock += 1000;
        break;
      case 5:
        this.toYourTurn();
        setDiscardTop(s, 13); // nadie tiene un 13: cualquier intento falla
        this.clock += 1000;
        break;
      case 6:
        this.toYourTurn();
        s.orbit = Math.max(s.orbit, s.config.ultimaMinOrbit);
        delete s.ultimaCaller;
        break;
      default:
        break;
    }
  }

  private toYourTurn(): void {
    const s = this.state;
    s.phase = 'TURN_DRAW';
    s.activeIdx = s.players.findIndex((p) => p.id === YOU);
    delete s.drawn;
    delete s.pendingEffect;
    delete s.effectOwner;
    s.timers = [{ kind: 'turn', deadlineTick: this.clock + 30_000 }];
    const you = s.players.find((p) => p.id === YOU);
    if (you) delete you.matchLockedUntilTick;
    delete s.firstMatchAttemptTick;
  }

  /** Aplica una acción del jugador. Solo avanza si es la que enseña el paso. */
  submit(a: ClientAction): {
    ok: boolean;
    events: GameEvent[];
    advanced: boolean;
    /** vista justo tras aplicar, ANTES de que el paso siguiente recoloque la mesa */
    viewAfter: PlayerView;
  } {
    this.clock += 400;
    const action = { ...a, p: YOU, tick: this.clock } as Action;
    const r = apply(this.state, action);
    if (!r.ok) return { ok: false, events: [], advanced: false, viewAfter: this.view() };
    this.state = r.state;
    this.events.push(...r.events);
    const viewAfter = this.view();

    const step = this.step;
    const teaches = step.accepts(action, this.state);
    // El paso se completa cuando el turno vuelve a estar libre (o el efecto se cerró).
    const finished =
      teaches &&
      (this.state.phase === 'TURN_DRAW' ||
        this.state.phase === 'INITIAL_PEEK' ||
        this.state.phase === 'ROUND_REVEAL' ||
        step.id === 4 ||
        step.id === 5);
    if (!finished) {
      const events = teaches ? r.events : [...r.events, ...this.recoverOffScript()];
      return { ok: true, events, advanced: false, viewAfter };
    }

    this.stepIdx++;
    if (!this.done) this.enterStep();
    return { ok: true, events: r.events, advanced: true, viewAfter };
  }

  /** El bot juega su turno (guion fijo: roba y descarta sin efecto). */
  playBotTurn(): GameEvent[] {
    this.clock += 800;
    const s = this.state;
    if (s.players[s.activeIdx]?.id !== BOT) return [];
    const r = apply(s, { t: 'TIMER_FIRED', timer: 'turn', tick: this.clock });
    if (!r.ok) return [];
    this.state = r.state;
    this.events.push(...r.events);
    return r.events;
  }

  /**
   * Si el jugador se sale del guion y su turno acaba, el bot juega el suyo y el
   * paso se vuelve a preparar: sin esto el turno quedaba en manos de un bot que
   * nadie movía y el tutorial se bloqueaba.
   */
  private recoverOffScript(): GameEvent[] {
    const s = this.state;
    if (s.players[s.activeIdx]?.id !== BOT) return [];
    const events = this.playBotTurn();
    this.enterStep();
    return events;
  }

  skip(): void {
    this.stepIdx = STEPS.length;
  }
}
