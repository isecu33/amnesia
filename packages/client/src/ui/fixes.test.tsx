/** Tests de los siete arreglos que tocan el cliente. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Score } from './Score.js';
import { Scoreboard } from '../hud/Scoreboard.js';
import { ConnectionBanner } from '../hud/ConnectionBanner.js';
import { LastHumanDialog } from '../hud/LastHumanDialog.js';
import { EMOTE_TTL_MS, useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { emoteSubtitle } from '../state/subtitles.js';
import { EMOTE_MOTIFS } from '../audio/audio.js';
import { EMOTES } from '../hud/EmoteWheel.js';
import { BLOOM_STRENGTH, GrainVignetteShader } from '../scene/postfx.js';
import type { LobbyStateMsg } from '@totem/protocol';
import type { PlayerView } from '@totem/core';

const resolveLastHuman = vi.fn();
const tryReconnect = vi.fn();
const rematch = vi.fn();
vi.mock('../net/client.js', () => ({
  resolveLastHuman: (...a: unknown[]) => resolveLastHuman(...a),
  tryReconnect: () => tryReconnect(),
  rematch: () => rematch(),
  leave: vi.fn(),
  act: vi.fn(),
  sendEmote: vi.fn(),
}));

const view = {
  you: { id: 'p1', slots: ['hidden', 'hidden'], sealed: false, lockedForMs: 0 },
  others: [{ id: 'p2', slots: ['hidden'], sealed: false, controller: 'human' }],
  deckCount: 10,
  phase: 'GAME_END',
  activePlayer: 'p1',
  orbit: 3,
  timers: [],
  scores: { p1: { round: 3, total: 30 }, p2: { round: 9, total: 90 } },
  legal: [],
  tick: 0,
} as unknown as PlayerView;

const lobby = (hostId: string): LobbyStateMsg => ({
  code: 'ABCDE',
  seats: [
    {
      playerId: 'p1',
      name: 'Ana',
      avatar: 0,
      controller: 'human',
      connected: true,
      host: hostId === 'p1',
    },
    {
      playerId: 'p2',
      name: 'Bea',
      avatar: 0,
      controller: 'human',
      connected: true,
      host: hostId === 'p2',
    },
  ],
  config: { mode: 'classic' },
  canStart: false,
  started: true,
});

beforeEach(() => {
  useStore.getState().reset();
  useSettings.getState().set({ lang: 'es' });
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('arreglo 6 · la revancha solo la pide el anfitrión', () => {
  it('el anfitrión ve el botón', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby(lobby('p1'));
    useStore.getState().setView(view, { p1: 'Ana', p2: 'Bea' });
    render(<Score />);
    fireEvent.click(screen.getByRole('button', { name: 'Revancha' }));
    expect(rematch).toHaveBeenCalled();
  });

  it('el resto ve la explicación y ningún botón que falle', () => {
    useStore.getState().setIdentity('p2', 'tok');
    useStore.getState().setLobby(lobby('p1'));
    useStore.getState().setView(view, { p1: 'Ana', p2: 'Bea' });
    render(<Score />);
    expect(screen.queryByRole('button', { name: 'Revancha' })).toBeNull();
    expect(screen.getByText('Solo el anfitrión puede pedir revancha')).toBeTruthy();
  });
});

describe('arreglo 2 · los emotes se ven, se oyen y se subtitulan', () => {
  it('cada gesto tiene su motivo sonoro propio', () => {
    expect(EMOTE_MOTIFS).toHaveLength(EMOTES.length);
    const serialized = EMOTE_MOTIFS.map((m) => m.join(','));
    expect(new Set(serialized).size).toBe(EMOTES.length); // ninguno repetido
  });

  it('todo emote genera subtítulo en ambos idiomas (alternativa visual)', () => {
    for (let i = 0; i < EMOTES.length; i++) {
      expect(emoteSubtitle('Ana', i, 'es')).toMatch(/^Ana .+\.$/);
      expect(emoteSubtitle('Ana', i, 'en')).toMatch(/^Ana .+\.$/);
    }
    expect(emoteSubtitle('Ana', 99, 'es')).toContain('Ana');
  });

  it('la burbuja aparece sobre la placa del jugador y caduca', () => {
    const playing = { ...view, phase: 'TURN_DRAW' } as PlayerView;
    useStore.getState().setView(playing, { p1: 'Ana', p2: 'Bea' });
    useStore.getState().pushEmote('p2', 1);
    const { container } = render(<Scoreboard view={playing} names={{ p1: 'Ana', p2: 'Bea' }} />);
    // D-045: icono pixel (canvas) en lugar de texto, ~1,2 s.
    expect(container.querySelector('.plate-emote canvas.emote-icon')).toBeTruthy();
    const at = useStore.getState().emotes[0]!.at;
    useStore.getState().expireEmotes(at + EMOTE_TTL_MS - 1);
    expect(useStore.getState().emotes).toHaveLength(1);

    useStore.getState().expireEmotes(at + EMOTE_TTL_MS);
    expect(useStore.getState().emotes).toHaveLength(0);
  });
});

describe('arreglo 1 · estado de conexión y reintento (E18)', () => {
  it('no molesta cuando todo va bien', () => {
    useStore.getState().setConnection('online');
    const { container } = render(<ConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('avisa mientras reconecta y ofrece reintento manual al agotarse', () => {
    useStore.getState().setConnection('reconnecting');
    const { rerender } = render(<ConnectionBanner />);
    expect(screen.getByText('Reconectando…')).toBeTruthy();

    useStore.getState().setConnection('lost');
    rerender(<ConnectionBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(tryReconnect).toHaveBeenCalled();
  });
});

describe('arreglo 5 · oferta al último humano (E16)', () => {
  it('no aparece si no hay oferta', () => {
    const { container } = render(<LastHumanDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('ofrece terminar con victoria o seguir, y manda la elección', () => {
    useStore.getState().setLastHumanOffer(2);
    render(<LastHumanDialog />);
    expect(screen.getByText('Te has quedado solo con los bots')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terminar con victoria' }));
    expect(resolveLastHuman).toHaveBeenCalledWith('win');
    expect(useStore.getState().lastHumanOffer).toBeUndefined();

    cleanup();
    useStore.getState().setLastHumanOffer(1);
    render(<LastHumanDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Seguir contra bots' }));
    expect(resolveLastHuman).toHaveBeenCalledWith('continue');
  });
});

describe('arreglo 3 · postproceso de docs/02 §5.3', () => {
  it('el bloom usa la intensidad del documento', () => {
    expect(BLOOM_STRENGTH).toBe(0.3);
  });

  it('el shader combina viñeta y grano y expone sus uniformes', () => {
    expect(Object.keys(GrainVignetteShader.uniforms).sort()).toEqual([
      'tDiffuse',
      'uGrain',
      'uTime',
      'uVignette',
    ]);
    expect(GrainVignetteShader.fragmentShader).toContain('vig');
    expect(GrainVignetteShader.fragmentShader).toContain('uGrain');
  });
});
