/** Capa de red: colyseus.js + volcado de eventos a la cola del store. */
import { Client, type Room } from 'colyseus.js';
import { DEFAULT_CONFIG, secondsToTicks, type GameEvent, type PlayerView } from '@totem/core';
import {
  PROTOCOL_VERSION,
  makeRoomCode,
  type ClientAction,
  type LobbyStateMsg,
  type RoomConfig,
  type SpeciesId,
} from '@totem/protocol';
import { useStore } from '../state/store.js';
import { describe, emoteSubtitle, resolveName } from '../state/subtitles.js';
import { DICTS, fmt } from '../i18n/index.js';
import { audio } from '../audio/audio.js';
import {
  MAX_RECONNECT_ATTEMPTS,
  backoffMs,
  clearSession,
  shouldClearSessionOnFailure,
  loadSession,
  saveSession,
} from './saved-session.js';
import { resolveServerUrl } from './server-url.js';

const WSS_URL = resolveServerUrl(
  import.meta.env['VITE_WSS_URL'] as string | undefined,
  globalThis.location?.hostname ?? 'localhost',
  globalThis.location?.protocol ?? 'http:',
);

let room: Room | undefined;
let identity = { name: '', avatar: 0, code: '' };
let attempts = 0;
let retryHandle: ReturnType<typeof setTimeout> | undefined;
let leavingOnPurpose = false;

function wire(r: Room): void {
  const st = useStore.getState;
  r.onMessage('joined', (m: { playerId: string; token: string }) => {
    st().setIdentity(m.playerId, m.token);
    attempts = 0;
    saveSession({
      token: m.token,
      code: identity.code,
      name: identity.name,
      avatar: identity.avatar,
    });
  });
  r.onMessage('lobbyState', (m: LobbyStateMsg) => {
    identity.code = m.code;
    st().setLobby(m);
  });
  r.onMessage('view', (m: { v: PlayerView; names: Record<string, string> }) =>
    st().setView(m.v, m.names),
  );
  r.onMessage('ev', (m: { e: GameEvent }) => {
    const s = st();
    s.pushEvent(m.e);
    if (m.e.e === 'ROUND_STARTED') s.clearLog();
    // P1: efecto pendiente y vista privada se aplican al REPRODUCIRSE (presenter/play-effects.ts).
    const nameOf = (id: string): string => resolveName(id, s.names, s.lobby?.seats, s.lang);
    const line = describe(m.e, nameOf, s.lang, s.playerId);
    if (line) s.addLog(line);
    if (m.e.e === 'INITIAL_PEEK_RESULT') {
      const ttlMs = secondsToTicks(DEFAULT_CONFIG.initialPeekSeconds);
      for (const c of m.e.cards)
        s.addLog(fmt(DICTS[s.lang].evSaw, { slot: `#${c.slot + 1}`, value: c.value }), ttlMs);
    }
  });
  r.onMessage('emote', (m: { player: string; id: number }) => {
    const s = st();
    s.pushEmote(m.player, m.id);
    audio.playEmote(m.id);
    s.addLog(emoteSubtitle(resolveName(m.player, s.names, s.lobby?.seats, s.lang), m.id, s.lang));
  });
  r.onMessage('lastHuman', (m: { bots: number }) => st().setLastHumanOffer(m.bots));
  r.onMessage('err', (m: { code: string; msg: string }) => showError(`${m.code}: ${m.msg}`));
  r.onMessage('pong', () => undefined);
  r.onLeave(() => {
    // Un onLeave tardío de una sala vieja no debe tumbar la nueva ni reconectar.
    if (room !== r) return;
    room = undefined;
    if (leavingOnPurpose) return;
    useStore.getState().setConnection('reconnecting');
    scheduleReconnect();
  });
}

/** Lo que se ve de un error del servidor antes de apagarse. */
export const ERROR_SHOW_MS = 3000;

/** Muestra el error y lo apaga a los ERROR_SHOW_MS, salvo que ya lo haya sustituido otro más nuevo. */
export function showError(msg: string): void {
  useStore.getState().setError(msg);
  setTimeout(() => {
    if (useStore.getState().error === msg) useStore.getState().setError(undefined);
  }, ERROR_SHOW_MS);
}

/**
 * Tras reconectar llega una instantánea nueva: los eventos encolados (y lo
 * privado ligado a ellos) son de antes del corte y no deben animarse.
 */
export function resyncAfterReconnect(): void {
  const s = useStore.getState();
  while (s.shiftEvent()) {
    /* vaciar la cola */
  }
  s.clearLog();
  s.setReveal(undefined);
  s.setPendingEffect(undefined);
}

/** E18: reintento automático con backoff mientras la sala siga viva. */
function scheduleReconnect(): void {
  if (retryHandle) clearTimeout(retryHandle);
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    if (shouldClearSessionOnFailure(useStore.getState().screen)) clearSession();
    useStore.getState().setConnection('lost');
    return;
  }
  const delay = backoffMs(attempts++);
  retryHandle = setTimeout(() => {
    void tryReconnect();
  }, delay);
}

/** Vuelve a la sala guardada usando el token. Devuelve false si no había. */
export async function tryReconnect(): Promise<boolean> {
  const saved = loadSession();
  if (!saved) {
    useStore.getState().setConnection('offline');
    return false;
  }
  identity = { name: saved.name, avatar: saved.avatar, code: saved.code };
  // Un leave() manual previo no debe impedir el auto-reconectado de esta sala nueva.
  leavingOnPurpose = false;
  try {
    const client = new Client(WSS_URL);
    room = await client.join('totem_room', {
      name: saved.name,
      avatar: saved.avatar,
      code: saved.code,
      token: saved.token,
    });
    resyncAfterReconnect();
    wire(room);
    room.send('hello', {
      name: saved.name,
      avatar: saved.avatar,
      protocolVersion: PROTOCOL_VERSION,
    });
    useStore.getState().setConnection('online');
    return true;
  } catch {
    scheduleReconnect();
    return false;
  }
}

export async function createRoom(
  name: string,
  avatar = 0,
  config: RoomConfig = {},
): Promise<string> {
  const client = new Client(WSS_URL);
  const code = makeRoomCode();
  identity = { name, avatar, code };
  leavingOnPurpose = false;
  room = await client.create('totem_room', { name, avatar, code });
  wire(room);
  room.send('hello', { name, avatar, protocolVersion: PROTOCOL_VERSION });
  if (Object.keys(config).length > 0) room.send('configure', { config });
  useStore.getState().setConnection('online');
  useStore.getState().setScreen('lobby');
  return code;
}

export async function joinRoom(name: string, avatar = 0, code = ''): Promise<void> {
  const client = new Client(WSS_URL);
  identity = { name, avatar, code };
  leavingOnPurpose = false;
  room = await client.join('totem_room', { name, avatar, code });
  wire(room);
  room.send('hello', { name, avatar, protocolVersion: PROTOCOL_VERSION });
  useStore.getState().setConnection('online');
  useStore.getState().setScreen('lobby');
}

export function send(type: string, payload: unknown): void {
  room?.send(type, payload);
}

export const act = (a: ClientAction): void => send('action', { a });
export const addBot = (kind: 'random' | 'greedy'): void => send('addBot', { kind });
export const configure = (config: RoomConfig): void => send('configure', { config });
export const startGame = (): void => send('startGame', {});
export const chooseSpecies = (species: SpeciesId): void => send('chooseSpecies', { species });
export const sendEmote = (id: number): void => send('emote', { id });
export const rematch = (): void => send('rematch', {});
export const resolveLastHuman = (choice: 'win' | 'continue'): void =>
  send('resolveLastHuman', { choice });

export const leave = (): void => {
  leavingOnPurpose = true;
  if (retryHandle) clearTimeout(retryHandle);
  attempts = 0;
  clearSession();
  void room?.leave();
  room = undefined;
  useStore.getState().setConnection('offline');
};
