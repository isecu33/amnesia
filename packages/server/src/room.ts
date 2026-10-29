/** Sala Colyseus `totem_room` — adaptador fino sobre GameSession (docs/02 §4.2). */
import { Room, type Client } from '@colyseus/core';
import {
  PROTOCOL_VERSION,
  RATE_LIMITS,
  RateLimiter,
  parseC2S,
  type C2SType,
  type SpeciesId,
} from '@totem/protocol';
import { GameSession, type Sink } from './session.js';
import { makeRoomCode } from './codes.js';
import { realClock, type Clock } from './clock.js';

interface Conn {
  client: Client;
  playerId: string;
  token: string;
  msgLimiter: RateLimiter;
  matchLimiter: RateLimiter;
}

export interface TotemRoomOptions {
  code?: string;
  seed?: number;
  clock?: Clock;
  /** TTL de la sala en ms (docs/02 §4.2: 2 h). */
  ttlMs?: number;
}

export class TotemRoom extends Room {
  override maxClients = 6;
  private session!: GameSession;
  private conns = new Map<string, Conn>();
  private srvClock: Clock = realClock;
  private replaySaved = false;

  override onCreate(options: TotemRoomOptions = {}): void {
    this.srvClock = options.clock ?? realClock;
    const code = options.code ?? makeRoomCode();
    this.setMetadata({ code });
    this.roomId = this.roomId ?? code;

    const sink: Sink = {
      send: (playerId, type, payload) => {
        const conn = this.conns.get(playerId);
        conn?.client.send(type, payload);
      },
      broadcast: (type, payload) => this.broadcast(type, payload),
    };
    const sessionOpts: ConstructorParameters<typeof GameSession>[0] = {
      code,
      clock: this.srvClock,
      sink,
    };
    if (options.seed !== undefined) sessionOpts.seed = options.seed;
    this.session = new GameSession(sessionOpts);

    this.registerHandlers();
    this.setSimulationInterval(() => undefined, 60_000);
    this.srvClock.setTimeout(() => this.disconnect(), options.ttlMs ?? 2 * 60 * 60 * 1000);
  }

  private registerHandlers(): void {
    const guard =
      <K extends C2SType>(type: K, fn: (conn: Conn, data: never) => void) =>
      (client: Client, payload: unknown): void => {
        const conn = this.connOf(client);
        if (!conn) return;
        if (!conn.msgLimiter.allow(this.srvClock.now())) {
          client.send('err', {
            code: 'RATE_LIMITED',
            msg: `máx. ${RATE_LIMITS.messagesPerSecond}/s`,
          });
          return;
        }
        const parsed = parseC2S(type, payload);
        if (!parsed.ok) {
          client.send('err', { code: parsed.code, msg: parsed.msg });
          return;
        }
        fn(conn, parsed.data as never);
      };

    // `hello` es el primer mensaje del cliente (docs/02 §4.1): responde con su
    // identidad y token. Así el cliente controla cuándo recibe `joined` y no hay
    // carrera con el registro de sus manejadores.
    this.onMessage(
      'hello',
      guard('hello', (conn) => {
        conn.client.send('joined', {
          playerId: conn.playerId,
          token: conn.token,
          protocolVersion: PROTOCOL_VERSION,
        });
        this.session.pushLobby();
      }),
    );
    this.onMessage(
      'configure',
      guard('configure', (conn, d: { config: object }) => {
        if (!this.session.isHost(conn.playerId)) {
          conn.client.send('err', { code: 'NOT_HOST', msg: 'solo el anfitrión configura' });
          return;
        }
        this.session.configure(d.config);
      }),
    );
    this.onMessage(
      'addBot',
      guard('addBot', (conn, d: { kind?: 'random' | 'greedy' }) => {
        if (!this.session.isHost(conn.playerId)) return;
        this.session.addBot(d.kind ?? 'greedy');
      }),
    );
    this.onMessage(
      'startGame',
      guard('startGame', (conn) => {
        if (!this.session.isHost(conn.playerId)) {
          conn.client.send('err', { code: 'NOT_HOST', msg: 'solo el anfitrión empieza' });
          return;
        }
        const err = this.session.start();
        if (err) conn.client.send('err', { code: 'CANNOT_START', msg: err.error });
      }),
    );
    this.onMessage(
      'rematch',
      guard('rematch', (conn) => {
        if (!this.session.isHost(conn.playerId)) {
          conn.client.send('err', { code: 'NOT_HOST', msg: 'solo el anfitrión pide revancha' });
          return;
        }
        const err = this.session.rematch();
        if (err) conn.client.send('err', { code: 'CANNOT_REMATCH', msg: err.error });
      }),
    );
    this.onMessage(
      'resolveLastHuman',
      guard('resolveLastHuman', (conn, d: { choice: 'win' | 'continue' }) => {
        const err = this.session.resolveLastHuman(conn.playerId, d.choice);
        if (err) conn.client.send('err', { code: 'CANNOT_RESOLVE', msg: err.error });
      }),
    );
    this.onMessage(
      'action',
      guard('action', (conn, d: { a: { t: string } }) => {
        if (d.a.t === 'MATCH_ATTEMPT' && !conn.matchLimiter.allow(this.srvClock.now())) {
          conn.client.send('err', { code: 'RATE_LIMITED', msg: 'máx. 1 intento/s' });
          return;
        }
        this.session.handleAction(conn.playerId, d.a as never);
      }),
    );
    this.onMessage(
      'chooseSpecies',
      guard('chooseSpecies', (conn, d: { species: SpeciesId }) => {
        const err = this.session.chooseSpecies(conn.playerId, d.species);
        if (err) conn.client.send('err', { code: err.error, msg: 'no se pudo elegir el animal' });
      }),
    );
    this.onMessage(
      'emote',
      guard('emote', (conn, d: { id: number }) => this.session.emote(conn.playerId, d.id)),
    );
    this.onMessage(
      'ping',
      guard('ping', (conn) => conn.client.send('pong', { t: this.srvClock.now() })),
    );
  }

  private connOf(client: Client): Conn | undefined {
    for (const conn of this.conns.values())
      if (conn.client.sessionId === client.sessionId) return conn;
    return undefined;
  }

  override onJoin(
    client: Client,
    options: { name?: string; token?: string; avatar?: unknown } = {},
  ): void {
    if (options.token) {
      // El asiento se busca ANTES de reconectar: la conexión tiene que estar
      // registrada cuando la sesión mande el snapshot, o el `view` se pierde.
      const playerId = this.session.seatByToken(options.token);
      if (playerId) {
        this.attach(client, playerId, options.token);
        this.session.reconnect(options.token);
        return;
      }
    }
    const r = this.session.addHuman(options.name ?? 'Invitado', safeAvatar(options.avatar));
    if ('error' in r) {
      client.send('err', { code: r.error, msg: 'no se pudo entrar' });
      client.leave();
      return;
    }
    this.attach(client, r.playerId, r.token);
  }

  private attach(client: Client, playerId: string, token: string): void {
    this.conns.set(playerId, {
      client,
      playerId,
      token,
      msgLimiter: new RateLimiter(RATE_LIMITS.messagesPerSecond),
      matchLimiter: new RateLimiter(RATE_LIMITS.matchAttemptsPerSecond),
    });
    // En el siguiente tick: si se envía dentro de onJoin, el cliente todavía no
    // tiene registrados sus manejadores y el mensaje se pierde.
    this.srvClock.setTimeout(() => {
      client.send('joined', { playerId, token, protocolVersion: PROTOCOL_VERSION });
      this.session.pushLobby();
    }, 0);
  }

  override onLeave(client: Client): void {
    const conn = this.connOf(client);
    if (!conn) return;
    this.conns.delete(conn.playerId);
    this.session.setDisconnected(conn.playerId);
  }

  override async onDispose(): Promise<void> {
    // Hay que esperar al volcado: si no, el proceso puede morir a medio escribir
    // y el replay queda truncado (fichero de 0 bytes).
    if (!this.replaySaved) {
      this.replaySaved = true;
      await saveReplay(this.session);
    }
    this.session.dispose();
  }

  /** Acceso para tests de integración. */
  get sessionForTests(): GameSession {
    return this.session;
  }
}

/** El avatar del cliente solo es una preferencia: cualquier valor raro cae en 0. */
function safeAvatar(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 11 ? v : 0;
}

async function saveReplay(session: GameSession): Promise<void> {
  if (!session.gameState) return;
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = process.env['REPLAY_DIR'] ?? 'replays';
    await mkdir(dir, { recursive: true });
    const name = `${dir}/${session.code}-${Date.now()}.json`;
    await writeFile(name, JSON.stringify(session.toReplay(), null, 2), 'utf8');
  } catch {
    // el volcado de replays nunca debe tumbar la sala
  }
}
