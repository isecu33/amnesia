/** Estado del cliente (zustand): vista + cola de eventos + lobby. */
import { create } from 'zustand';
import type { GameEvent, PlayerView } from '@totem/core';
import type { LobbyStateMsg } from '@totem/protocol';
import type { Lang } from '../i18n/index.js';

export interface LogLine {
  id: number;
  text: string;
}

export type ConnectionState = 'offline' | 'online' | 'reconnecting' | 'lost';

export interface EmoteBubble {
  id: number;
  player: string;
  emote: number;
  at: number;
}

export interface AppState {
  screen: 'home' | 'lobby' | 'table' | 'score' | 'tutorial';
  lang: Lang;
  playerId?: string;
  token?: string;
  code?: string;
  names: Record<string, string>;
  lobby?: LobbyStateMsg;
  view?: PlayerView;
  /** Cola FIFO de eventos: el presenter la consume (docs/02 §5.2). */
  queue: GameEvent[];
  log: LogLine[];
  error?: string;
  /** Revelación privada en curso (Vislumbre / Espionaje). */
  reveal?: { player: string; slot: number; value: number; until: number };
  connection: ConnectionState;
  emotes: EmoteBubble[];
  /** E16: te has quedado solo con bots y el servidor te ofrece salida. */
  lastHumanOffer?: { bots: number };

  setScreen: (s: AppState['screen']) => void;
  setLang: (l: Lang) => void;
  setIdentity: (playerId: string, token: string) => void;
  setLobby: (l: LobbyStateMsg) => void;
  setView: (v: PlayerView, names: Record<string, string>) => void;
  pushEvent: (e: GameEvent) => void;
  shiftEvent: () => GameEvent | undefined;
  addLog: (text: string) => void;
  setError: (msg?: string) => void;
  setReveal: (r: AppState['reveal']) => void;
  setConnection: (c: ConnectionState) => void;
  pushEmote: (player: string, emote: number) => void;
  expireEmotes: (now: number) => void;
  setLastHumanOffer: (bots?: number) => void;
  reset: () => void;
}

export const EMOTE_TTL_MS = 3000;

let logId = 0;

export const useStore = create<AppState>((set, get) => ({
  screen: 'home',
  lang: 'es',
  names: {},
  queue: [],
  log: [],
  connection: 'offline',
  emotes: [],

  setScreen: (screen) => set({ screen }),
  setLang: (lang) => set({ lang }),
  setIdentity: (playerId, token) => set({ playerId, token }),
  setLobby: (lobby) =>
    set((s) => ({
      lobby,
      code: lobby.code,
      screen: lobby.started && s.screen === 'lobby' ? 'table' : s.screen,
    })),
  setView: (view, names) =>
    set((s) => ({
      view,
      names,
      screen: view.phase === 'GAME_END' ? 'score' : s.screen === 'home' ? s.screen : 'table',
    })),
  pushEvent: (e) => set((s) => ({ queue: [...s.queue, e] })),
  shiftEvent: () => {
    const [first, ...rest] = get().queue;
    if (first) set({ queue: rest });
    return first;
  },
  addLog: (text) => set((s) => ({ log: [...s.log.slice(-60), { id: ++logId, text }] })),
  setError: (error) => set({ error }),
  setReveal: (reveal) => set({ reveal }),
  setConnection: (connection) => set({ connection }),
  pushEmote: (player, emote) =>
    set((s) => ({
      emotes: [...s.emotes.slice(-5), { id: ++logId, player, emote, at: Date.now() }],
    })),
  expireEmotes: (now) =>
    set((s) => ({ emotes: s.emotes.filter((e) => now - e.at < EMOTE_TTL_MS) })),
  setLastHumanOffer: (bots) => set({ lastHumanOffer: bots === undefined ? undefined : { bots } }),
  reset: () =>
    set({
      screen: 'home',
      view: undefined,
      lobby: undefined,
      queue: [],
      log: [],
      error: undefined,
      emotes: [],
      lastHumanOffer: undefined,
      connection: 'offline',
    }),
}));
