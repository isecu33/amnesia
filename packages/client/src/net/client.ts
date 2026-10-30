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
    if (m.e.e === 'EFFECT_PENDING' && m.e.player === s.playerId) s.setPendingEffect(m.e.effect);
    if (m.e.e === 'EFFECT_RESOLVED' || m.e.e === 'EFFECT_SKIPPED') s.setPendingEffect(undefined);
    const nameOf = (id: string): string => resolveName(id, s.names, s.lobby?.seats, s.lang);
    const line = describe(m.e, nameOf, s.lang);
    if (line) s.addLog(line);
    if (m.e.e === 'PRIVATE_REVEAL') {
      s.setReveal({
        player: m.e.player,
        slot: m.e.slot,
        value: m.e.value,
        until: Date.now() + m.e.ttlMs,
      });
      setTimeout(() => useStore.getState().setReveal(undefined), m.e.ttlMs);
    }
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
  r.onMessage('err', (m: { code: string; msg: string }) => {
    st().setError(`${m.code}: ${m.msg}`);
    setTimeout(() => useStore.getState().setError(undefined), 3000);
  });
  r.onMessage('pong', () => undefined);
  r.onLeave(() => {
    room = undefined;
    if (leavingOnPurpose) return;
    useStore.getState().setConnection('reconnecting');
    scheduleReconnect();
  });
}

/** E18: reintento automático con backoff mientras la sala siga viva. */
function scheduleReconnect(): void {
  if (retryHandle) clearTimeout(retryHandle);
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
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
  try {
    const client = new Client(WSS_URL);
    room = await client.join('totem_room', {
      name: saved.name,
      avatar: saved.avatar,
      code: saved.code,
      token: saved.token,
    });
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
