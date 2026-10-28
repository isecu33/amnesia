/**
 * Contratos de red C2S/S2C — docs/02 §4.1 (NORMATIVO).
 * Validados con zod en AMBOS extremos. Cualquier cambio de forma → bump de
 * PROTOCOL_VERSION + entrada en docs/decisiones.md.
 */
import { z } from 'zod';
import type { GameEvent, PlayerView } from '@totem/core';

export * from './codes.js';

/** v2: `mapId` en la config de sala y `map` en `lobbyState` (D-044). */
export const PROTOCOL_VERSION = 2;

/** docs/02 §4.2: payloads mayores se rechazan. */
export const MAX_PAYLOAD_BYTES = 2048;

export function withinPayloadLimit(payload: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(payload ?? null)).length <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Acciones de juego que puede originar un cliente.
// El servidor SIEMPRE inyecta `p` y `tick`: nunca se confía en los del cliente.
// ---------------------------------------------------------------------------

const slot = z.number().int().min(0).max(9);

export const ClientActionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('PEEK_INITIAL'), slots: z.array(slot).min(1).max(3) }),
  z.object({ t: z.literal('CALL_ULTIMA') }),
  z.object({ t: z.literal('DRAW_DECK') }),
  z.object({ t: z.literal('DRAW_DISCARD') }),
  z.object({ t: z.literal('DISCARD_DRAWN') }),
  z.object({ t: z.literal('SWAP_DRAWN'), slot }),
  z.object({
    t: z.literal('EFFECT_TARGET'),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('PEEK'), slot }),
      z.object({ kind: z.literal('SPY'), player: z.string().min(1).max(64), slot }),
      z.object({
        kind: z.literal('SWAP'),
        ownSlot: slot,
        player: z.string().min(1).max(64),
        theirSlot: slot,
      }),
    ]),
  }),
  z.object({ t: z.literal('EFFECT_SKIP') }),
  z.object({ t: z.literal('MATCH_ATTEMPT'), slot }),
]);
export type ClientAction = z.infer<typeof ClientActionSchema>;

// ---------------------------------------------------------------------------
// Mapas (D-044): opción cosmética de sala. `core` la ignora por completo.
// ---------------------------------------------------------------------------

export const MAP_IDS = [
  'candle-night',
  'frozen-cave',
  'jungle-temple',
  'fog-marsh',
  'totem-canyon',
] as const;
export type MapId = (typeof MAP_IDS)[number];
export const DEFAULT_MAP_ID: MapId = 'candle-night';

/** Lo que elige el anfitrión: un mapa o «random» (se resuelve en el servidor al empezar). */
export const MapChoiceSchema = z.enum([...MAP_IDS, 'random']);
export type MapChoice = z.infer<typeof MapChoiceSchema>;

/**
 * Pura: convierte la elección del anfitrión en un mapa concreto. El RNG se
 * inyecta (no se llama a `Math.random` aquí) y solo se consume con «random».
 */
export function resolveMapChoice(choice: MapChoice | undefined, rand: () => number): MapId {
  if (choice === undefined) return DEFAULT_MAP_ID;
  if (choice !== 'random') return choice;
  const i = Math.floor(rand() * MAP_IDS.length);
  return MAP_IDS[Math.min(MAP_IDS.length - 1, Math.max(0, i))] ?? DEFAULT_MAP_ID;
}

// ---------------------------------------------------------------------------
// Config de sala editable por el host: subconjunto de la tabla de docs/01 §9.
// ---------------------------------------------------------------------------

export const RoomConfigSchema = z
  .object({
    initialSlots: z.number().int().min(3).max(5),
    initialPeekCount: z.number().int().min(1).max(3),
    initialPeekSeconds: z.number().int().min(5).max(20),
    turnSeconds: z.number().int().min(15).max(60),
    effectTargetSeconds: z.number().int().min(5).max(20),
    matchFailLockoutSeconds: z.number().int().min(3).max(10),
    gameEndScore: z.number().int().min(50).max(200),
    mode: z.enum(['quick', 'classic']),
    /** accesibilidad: multiplica todos los temporizadores (docs/01 §11) */
    timeScale: z.number().min(1).max(2),
    /** cosmética (D-044): `core` no la ve; la quita el servidor antes de `makeConfig` */
    mapId: MapChoiceSchema,
  })
  .partial();
export type RoomConfig = z.infer<typeof RoomConfigSchema>;

// ---------------------------------------------------------------------------
// Cliente → Servidor
// ---------------------------------------------------------------------------

export const HelloSchema = z.object({
  name: z.string().min(1).max(24),
  avatar: z.number().int().min(0).max(11).optional(),
  protocolVersion: z.number().int(),
});
export const CreateRoomSchema = z.object({ config: RoomConfigSchema.optional() });
export const JoinRoomSchema = z.object({ code: z.string().length(5) });
export const StartGameSchema = z.object({ bots: z.number().int().min(0).max(5).optional() });
export const ActionMsgSchema = z.object({ a: ClientActionSchema });
export const ReconnectSchema = z.object({ token: z.string().min(8).max(64) });
export const EmoteSchema = z.object({ id: z.number().int().min(0).max(5) });
export const ConfigureSchema = z.object({ config: RoomConfigSchema });
export const AddBotSchema = z.object({ kind: z.enum(['random', 'greedy']).optional() });
export const RematchSchema = z.object({}).passthrough();
/** E16: el último humano decide si termina con victoria o sigue contra bots. */
export const ResolveLastHumanSchema = z.object({ choice: z.enum(['win', 'continue']) });
export const PingSchema = z.object({}).passthrough();

export const C2S = {
  hello: HelloSchema,
  createRoom: CreateRoomSchema,
  joinRoom: JoinRoomSchema,
  configure: ConfigureSchema,
  addBot: AddBotSchema,
  startGame: StartGameSchema,
  action: ActionMsgSchema,
  rematch: RematchSchema,
  resolveLastHuman: ResolveLastHumanSchema,
  reconnect: ReconnectSchema,
  emote: EmoteSchema,
  ping: PingSchema,
} as const;
export type C2SType = keyof typeof C2S;

/** Valida un mensaje entrante: tipo conocido, tamaño y forma. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; code: string; msg: string };

export function parseC2S<K extends C2SType>(
  type: K,
  payload: unknown,
): ParseResult<z.infer<(typeof C2S)[K]>> {
  if (!withinPayloadLimit(payload)) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', msg: `máximo ${MAX_PAYLOAD_BYTES} bytes` };
  }
  const schema = C2S[type];
  if (!schema) return { ok: false, code: 'UNKNOWN_MESSAGE', msg: String(type) };
  const r = schema.safeParse(payload);
  if (!r.success)
    return { ok: false, code: 'BAD_PAYLOAD', msg: r.error.issues[0]?.message ?? 'inválido' };
  return { ok: true, data: r.data as z.infer<(typeof C2S)[K]> };
}

// ---------------------------------------------------------------------------
// Servidor → Cliente (tipos; el cliente confía en el servidor, no revalida forma)
// ---------------------------------------------------------------------------

export interface Seat {
  playerId: string;
  name: string;
  avatar: number;
  controller: 'human' | 'bot';
  connected: boolean;
  host: boolean;
}

export interface LobbyStateMsg {
  code: string;
  seats: Seat[];
  config: Required<Pick<RoomConfig, 'mode'>> & RoomConfig;
  canStart: boolean;
  started: boolean;
  /** mapa concreto de la partida en curso (con «random» ya resuelto); solo si `started` */
  map?: MapId;
}
export interface JoinedMsg {
  playerId: string;
  token: string;
  protocolVersion: number;
}
export interface ViewMsg {
  v: PlayerView;
  names: Record<string, string>;
}
export interface EvMsg {
  e: GameEvent;
  tick: number;
}
export interface ErrMsg {
  code: string;
  msg: string;
}
export interface EmoteMsg {
  player: string;
  id: number;
}
/** E16: solo queda un humano en la sala. */
export interface LastHumanMsg {
  bots: number;
}

export const S2C_TYPES = ['lobbyState', 'joined', 'view', 'ev', 'err', 'emote', 'pong'] as const;
export type S2CType = (typeof S2C_TYPES)[number];

export interface S2CMap {
  lobbyState: LobbyStateMsg;
  joined: JoinedMsg;
  view: ViewMsg;
  ev: EvMsg;
  err: ErrMsg;
  emote: EmoteMsg;
  lastHuman: LastHumanMsg;
  pong: { t: number };
}

// ---------------------------------------------------------------------------
// Límites de tasa (docs/02 §4.2)
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  messagesPerSecond: 10,
  matchAttemptsPerSecond: 1,
} as const;

/** Ventana deslizante simple, compartida por sala y cliente. */
export class RateLimiter {
  private hits: number[] = [];
  constructor(
    private readonly limit: number,
    private readonly windowMs = 1000,
  ) {}
  allow(nowMs: number): boolean {
    this.hits = this.hits.filter((t) => nowMs - t < this.windowMs);
    if (this.hits.length >= this.limit) return false;
    this.hits.push(nowMs);
    return true;
  }
}
