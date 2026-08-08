/**
 * Lógica de sala independiente del transporte — docs/02 §4.2.
 * Colyseus solo la envuelve (room.ts): así toda la autoridad es testeable sin red.
 */
import {
  apply,
  createGame,
  legalActions,
  makeConfig,
  setController,
  viewFor,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerView,
} from '@totem/core';
import { PROTOCOL_VERSION, type ClientAction, type RoomConfig, type Seat } from '@totem/protocol';
import { makeBot, type Bot } from './bots.js';
import { TelemetryCollector } from './telemetry.js';
import type { Clock } from './clock.js';

export interface Sink {
  /** Mensaje dirigido a un jugador (eventos privados, errores, snapshots). */
  send(playerId: string, type: string, payload: unknown): void;
  /** Mensaje para toda la sala. */
  broadcast(type: string, payload: unknown): void;
}

interface SeatInternal extends Seat {
  token: string;
  bot?: Bot;
}

export interface ReplayFile {
  version: number;
  code: string;
  seed: number;
  config: GameConfig;
  playerIds: string[];
  actions: Action[];
  finalPhase: string;
  finalTotals: Record<string, number>;
}

export interface SessionOptions {
  code: string;
  clock: Clock;
  sink: Sink;
  seed?: number;
  rand?: () => number;
  maxPlayers?: number;
}

export class GameSession {
  readonly code: string;
  private readonly clock: Clock;
  private readonly sink: Sink;
  private readonly rand: () => number;
  private readonly maxPlayers: number;

  private seats: SeatInternal[] = [];
  private roomConfig: RoomConfig = { mode: 'classic', timeScale: 1 };
  private seed: number;
  private state?: GameState;
  private timerHandles: unknown[] = [];
  private botHandles = new Map<string, unknown>();
  private graceHandles = new Map<string, unknown>();
  private actionLog: Action[] = [];
  private seq = 0;
  private forcedEnd = false;
  readonly telemetry = new TelemetryCollector();

  constructor(opts: SessionOptions) {
    this.code = opts.code;
    this.clock = opts.clock;
    this.sink = opts.sink;
    this.rand = opts.rand ?? Math.random;
    this.maxPlayers = opts.maxPlayers ?? 6;
    this.seed = opts.seed ?? Math.floor(this.rand() * 2 ** 31);
  }

  // --- lobby ---------------------------------------------------------------

  get started(): boolean {
    return this.state !== undefined;
  }
  get gameState(): GameState | undefined {
    return this.state;
  }
  get seatList(): Seat[] {
    return this.seats.map(({ token: _token, bot: _bot, ...s }) => s);
  }

  addHuman(name: string, avatar = 0): { playerId: string; token: string } | { error: string } {
    if (this.state) return { error: 'GAME_ALREADY_STARTED' };
    if (this.seats.length >= this.maxPlayers) return { error: 'ROOM_FULL' };
    const playerId = `p${++this.seq}`;
    const token = `${this.code}-${playerId}-${Math.floor(this.rand() * 2 ** 40).toString(36)}`;
    this.seats.push({
      playerId,
      name: name.slice(0, 24),
      avatar,
      controller: 'human',
      connected: true,
      host: this.seats.length === 0,
      token,
    });
    this.pushLobby();
    return { playerId, token };
  }

  addBot(kind: 'random' | 'greedy' = 'greedy'): { playerId: string } | { error: string } {
    if (this.state) return { error: 'GAME_ALREADY_STARTED' };
    if (this.seats.length >= this.maxPlayers) return { error: 'ROOM_FULL' };
    const playerId = `p${++this.seq}`;
    this.seats.push({
      playerId,
      name: `${kind === 'greedy' ? 'Zorro' : 'Ratón'} ${playerId}`,
      avatar: 0,
      controller: 'bot',
      connected: true,
      host: false,
      token: '',
      bot: makeBot(kind, playerId, this.rand),
    });
    this.pushLobby();
    return { playerId };
  }

  removeSeat(playerId: string): void {
    if (this.state) return; // en partida el asiento se conserva (E16/E18)
    const wasHost = this.seats.find((s) => s.playerId === playerId)?.host;
    this.seats = this.seats.filter((s) => s.playerId !== playerId);
    const first = this.seats[0];
    if (wasHost && first) first.host = true;
    this.pushLobby();
  }

  configure(cfg: RoomConfig): void {
    if (this.state) return;
    this.roomConfig = { ...this.roomConfig, ...cfg };
    this.pushLobby();
  }

  isHost(playerId: string): boolean {
    return this.seats.find((s) => s.playerId === playerId)?.host === true;
  }

  get canStart(): boolean {
    return !this.state && this.seats.length >= 2 && this.seats.length <= this.maxPlayers;
  }

  private buildConfig(): GameConfig {
    const { mode = 'classic', timeScale = 1, ...rest } = this.roomConfig;
    const base = makeConfig({ ...rest, mode });
    // Accesibilidad (docs/01 §11): «tiempo ×1,5» escala TODOS los temporizadores.
    const t = (v: number): number => Math.round(v * timeScale * 10) / 10;
    // El autocompletado del vislumbre va siempre por delante del fin de la fase:
    // si el anfitrión acorta initialPeekSeconds, se recalcula.
    const autoPeek = Math.min(base.autoPeekAtSecond, Math.max(1, base.initialPeekSeconds - 3));
    return {
      ...base,
      initialPeekSeconds: t(base.initialPeekSeconds),
      autoPeekAtSecond: t(autoPeek),
      turnSeconds: t(base.turnSeconds),
      effectTargetSeconds: t(base.effectTargetSeconds),
      privateRevealSeconds: t(base.privateRevealSeconds),
      matchFailLockoutSeconds: t(base.matchFailLockoutSeconds),
      revealPauseSeconds: t(base.revealPauseSeconds),
    };
  }

  start(): { error: string } | undefined {
    if (this.state) return { error: 'GAME_ALREADY_STARTED' };
    if (!this.canStart) return { error: 'NOT_ENOUGH_PLAYERS' };
    let config: GameConfig;
    try {
      config = this.buildConfig();
      this.state = createGame(
        config,
        this.seats.map((s) => s.playerId),
        this.seed,
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'BAD_CONFIG' };
    }
    for (const s of this.seats) {
      s.bot?.reset();
      if (s.controller === 'bot') this.applyServerAction({ t: 'FORFEIT', p: s.playerId });
    }
    this.actionLog = [];
    this.telemetry.gameStarted(this.clock.now());
    this.pushLobby();
    this.broadcastEvent({
      e: 'ROUND_STARTED',
      order: this.state.turnOrder.slice(),
      discardTop: (this.state.discard[this.state.discard.length - 1]?.value ?? 0) as 0,
      startingPlayer: this.state.roundStarter,
    });
    this.afterChange();
    return undefined;
  }

  // --- acciones ------------------------------------------------------------

  /** Punto de entrada de una acción de cliente ya validada por zod. */
  handleAction(playerId: string, a: ClientAction): void {
    if (this.forcedEnd) {
      this.sink.send(playerId, 'err', { code: 'GAME_OVER', msg: 'la partida ya ha terminado' });
      return;
    }
    if (!this.state) {
      this.sink.send(playerId, 'err', { code: 'NOT_STARTED', msg: 'la partida no ha empezado' });
      return;
    }
    // El servidor inyecta SIEMPRE `p` y `tick`: nunca se confía en los del cliente.
    const action = { ...a, p: playerId, tick: this.clock.now() } as Action;
    const r = apply(this.state, action);
    if (!r.ok) {
      this.sink.send(playerId, 'err', { code: r.error.code, msg: r.error.msg ?? '' });
      return;
    }
    this.state = r.state;
    this.actionLog.push(action);
    for (const e of r.events) this.routeEvent(e);
    this.afterChange();
  }

  private applyServerAction(a: Action): boolean {
    if (!this.state || this.forcedEnd) return false;
    const action = { ...a, tick: this.clock.now() };
    const r = apply(this.state, action);
    if (!r.ok) return false;
    this.state = r.state;
    this.actionLog.push(action);
    for (const e of r.events) this.routeEvent(e);
    return true;
  }

  private routeEvent(e: GameEvent): void {
    this.telemetry.observe(e, this.state);
    for (const s of this.seats) s.bot?.observe(e);
    if ('to' in e && typeof e.to === 'string') {
      this.sink.send(e.to, 'ev', { e, tick: this.state?.tick ?? 0 });
    } else {
      this.broadcastEvent(e);
    }
  }

  private broadcastEvent(e: GameEvent): void {
    this.sink.broadcast('ev', { e, tick: this.state?.tick ?? 0 });
  }

  /** Reprograma timers, avisa a los bots y manda snapshots. */
  private afterChange(): void {
    this.pushViews();
    this.rescheduleTimers();
    this.scheduleBots();
  }

  // --- temporizadores ------------------------------------------------------

  private clearTimers(): void {
    for (const h of this.timerHandles) this.clock.clearTimeout(h);
    this.timerHandles = [];
  }

  private rescheduleTimers(): void {
    this.clearTimers();
    const s = this.state;
    if (!s || s.phase === 'GAME_END') return;
    for (const t of s.timers) {
      const delay = Math.max(0, t.deadlineTick - this.clock.now());
      const kind = t.kind;
      this.timerHandles.push(
        this.clock.setTimeout(() => {
          if (!this.state || this.state.phase === 'GAME_END') return;
          if (this.applyServerAction({ t: 'TIMER_FIRED', timer: kind })) this.afterChange();
        }, delay),
      );
    }
    // Entre rondas el servidor reparte solo tras la pausa de puntuación.
    if (s.phase === 'ROUND_END') {
      this.timerHandles.push(
        this.clock.setTimeout(() => {
          if (this.applyServerAction({ t: 'START_ROUND' })) {
            const st = this.state;
            if (st) {
              this.broadcastEvent({
                e: 'ROUND_STARTED',
                order: st.turnOrder.slice(),
                discardTop: (st.discard[st.discard.length - 1]?.value ?? 0) as 0,
                startingPlayer: st.roundStarter,
              });
            }
            this.afterChange();
          }
        }, 3000),
      );
    }
  }

  // --- bots ----------------------------------------------------------------

  private scheduleBots(): void {
    const s = this.state;
    for (const [, h] of this.botHandles) this.clock.clearTimeout(h);
    this.botHandles.clear();
    if (!s || s.phase === 'GAME_END' || s.phase === 'ROUND_END' || s.phase === 'ROUND_REVEAL')
      return;

    for (const seat of this.seats) {
      const bot = seat.bot;
      if (!bot) continue;
      const p = s.players.find((x) => x.id === seat.playerId);
      if (!p || p.controller !== 'bot') continue;
      const { botTurnDelayMsMin: lo, botTurnDelayMsMax: hi } = s.config;
      const delay = lo + Math.floor(this.rand() * Math.max(1, hi - lo));
      this.botHandles.set(
        seat.playerId,
        this.clock.setTimeout(() => this.runBot(seat.playerId), delay),
      );
    }
  }

  private runBot(playerId: string): void {
    const s = this.state;
    if (!s || s.phase === 'GAME_END') return;
    const seat = this.seats.find((x) => x.playerId === playerId);
    const bot = seat?.bot;
    if (!bot) return;
    const p = s.players.find((x) => x.id === playerId);
    if (!p || p.controller !== 'bot') return;

    const view = this.viewOf(playerId);
    const legal = legalActions(s, playerId);
    const action = bot.decide(view, legal);
    if (!action) return;
    const stamped = { ...action, p: playerId, tick: this.clock.now() } as Action;
    const r = apply(s, stamped);
    if (!r.ok) return;
    this.state = r.state;
    this.actionLog.push(stamped);
    for (const e of r.events) this.routeEvent(e);
    this.afterChange();
  }

  // --- conexión ------------------------------------------------------------

  /** Desconexión: se reserva el asiento y, pasada la gracia, entra un bot (E16/E18). */
  setDisconnected(playerId: string): void {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat) return;
    seat.connected = false;
    this.pushLobby();
    if (!this.state) {
      this.removeSeat(playerId);
      return;
    }
    const graceMs = this.state.config.reconnectGraceSeconds * 1000;
    this.graceHandles.set(
      playerId,
      this.clock.setTimeout(() => {
        const s = this.seats.find((x) => x.playerId === playerId);
        if (!s || s.connected) return;
        s.bot = s.bot ?? makeBot('greedy', playerId, this.rand);
        s.controller = 'bot';
        if (this.applyServerAction({ t: 'FORFEIT', p: playerId })) {
          this.pushLobby();
          this.afterChange();
        }
        this.offerToLastHuman();
      }, graceMs),
    );
  }

  /** Asiento asociado a un token, sin efectos secundarios. */
  seatByToken(token: string): string | undefined {
    return this.seats.find((s) => s.token !== '' && s.token === token)?.playerId;
  }

  /** Reconexión con token: devuelve el asiento al humano y manda snapshot (E18). */
  reconnect(token: string): { playerId: string } | { error: string } {
    const seat = this.seats.find((s) => s.token !== '' && s.token === token);
    if (!seat) return { error: 'BAD_TOKEN' };
    const h = this.graceHandles.get(seat.playerId);
    if (h) this.clock.clearTimeout(h);
    this.graceHandles.delete(seat.playerId);
    seat.connected = true;
    seat.controller = 'human';
    this.telemetry.reconnected();
    if (this.state) {
      const r = setController(this.state, seat.playerId, 'human');
      if (r.ok) {
        this.state = r.state;
        for (const e of r.events) this.routeEvent(e);
      }
      this.sink.send(seat.playerId, 'view', {
        v: this.viewOf(seat.playerId),
        names: this.names(),
      });
      this.scheduleBots();
    }
    this.pushLobby();
    return { playerId: seat.playerId };
  }

  /** Revancha: mismos asientos, semilla nueva, marcador a cero (docs/03 WP-13). */
  rematch(): { error: string } | undefined {
    if (!this.state) return { error: 'NOT_STARTED' };
    if (this.state.phase !== 'GAME_END' && !this.forcedEnd) return { error: 'GAME_NOT_FINISHED' };
    this.telemetry.gameEnded(this.clock.now());
    this.dispose();
    this.seed = Math.floor(this.rand() * 2 ** 31);
    this.state = undefined;
    this.forcedEnd = false;
    for (const s of this.seats) s.bot?.reset();
    return this.start();
  }

  /** E16: si solo queda un humano jugando, se le ofrece salida. */
  private offerToLastHuman(): void {
    if (!this.state || this.forcedEnd || this.state.phase === 'GAME_END') return;
    const humans = this.seats.filter((s) => s.controller === 'human' && s.connected);
    const bots = this.seats.length - humans.length;
    const last = humans[0];
    if (humans.length !== 1 || bots === 0 || !last) return;
    this.sink.send(last.playerId, 'lastHuman', { bots });
  }

  /**
   * E16: el último humano elige. `win` cierra la partida en su favor sin tocar
   * las reglas de core (D-019): es una decisión de sala, no del motor.
   */
  resolveLastHuman(playerId: string, choice: 'win' | 'continue'): { error: string } | undefined {
    const s = this.state;
    if (!s) return { error: 'NOT_STARTED' };
    const seat = this.seats.find((x) => x.playerId === playerId);
    if (!seat || seat.controller !== 'human') return { error: 'NOT_A_PLAYER' };
    const humans = this.seats.filter((x) => x.controller === 'human' && x.connected);
    if (humans.length !== 1 || humans[0]?.playerId !== playerId) return { error: 'NOT_LAST_HUMAN' };
    if (choice === 'continue') return undefined;

    this.forcedEnd = true;
    this.dispose();
    const totals: Record<string, number> = {};
    for (const p of s.players) totals[p.id] = p.totalScore;
    this.telemetry.gameEnded(this.clock.now());
    this.broadcastEvent({ e: 'GAME_ENDED', winner: playerId, totals });
    this.pushLobby();
    return undefined;
  }

  get finishedByForfeit(): boolean {
    return this.forcedEnd;
  }

  emote(playerId: string, id: number): void {
    this.sink.broadcast('emote', { player: playerId, id });
  }

  dispose(): void {
    this.clearTimers();
    for (const [, h] of this.botHandles) this.clock.clearTimeout(h);
    for (const [, h] of this.graceHandles) this.clock.clearTimeout(h);
    this.botHandles.clear();
    this.graceHandles.clear();
  }

  // --- salida --------------------------------------------------------------

  viewOf(playerId: string): PlayerView {
    if (!this.state) throw new Error('la partida no ha empezado');
    return viewFor(this.state, playerId);
  }

  private names(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of this.seats) out[s.playerId] = s.name;
    return out;
  }

  private pushViews(): void {
    if (!this.state) return;
    // D-010 (MVP): snapshot tras cada cambio. Los eventos siguen mandando la
    // animación; el snapshot garantiza cero desincronización en el gray-box.
    for (const seat of this.seats) {
      if (seat.controller === 'bot' && !seat.token) continue;
      this.sink.send(seat.playerId, 'view', {
        v: viewFor(this.state, seat.playerId),
        names: this.names(),
      });
    }
  }

  pushLobby(): void {
    this.sink.broadcast('lobbyState', {
      code: this.code,
      seats: this.seatList,
      config: { mode: 'classic', ...this.roomConfig },
      canStart: this.canStart,
      started: this.started,
    });
  }

  /** Volcado de la partida para `pnpm replay` (docs/02 §7). */
  toReplay(): ReplayFile {
    const s = this.state;
    const totals: Record<string, number> = {};
    for (const p of s?.players ?? []) totals[p.id] = p.totalScore;
    return {
      version: PROTOCOL_VERSION,
      code: this.code,
      seed: this.seed,
      config: s?.config ?? this.buildConfig(),
      playerIds: this.seats.map((x) => x.playerId),
      actions: this.actionLog,
      finalPhase: s?.phase ?? 'NOT_STARTED',
      finalTotals: totals,
    };
  }
}
