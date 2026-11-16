/** P3 · título y menús: nombres de bot, portapapeles, rejilla de asientos, podio, giro. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@totem/core';
import type { LobbyStateMsg } from '@totem/protocol';
import { useStore } from '../../state/store.js';
import { useSettings } from '../../settings/store.js';
import { Lobby } from '../Lobby.js';
import { Score } from '../Score.js';
import { App } from '../App.js';
import { displaySeatName } from './bot-name.js';
import { copyText } from './clipboard.js';

const addBot = vi.fn();
vi.mock('../../net/client.js', () => ({
  addBot: (...a: unknown[]) => addBot(...a),
  configure: vi.fn(),
  startGame: vi.fn(),
  chooseSpecies: vi.fn(),
  rematch: vi.fn(),
  leave: vi.fn(),
  tryReconnect: vi.fn(async () => false),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

type SeatMsg = LobbyStateMsg['seats'][number];
const seat = (
  playerId: string,
  name: string,
  opts: { host?: boolean; bot?: boolean } = {},
): SeatMsg => ({
  playerId,
  name,
  avatar: 0,
  controller: opts.bot ? 'bot' : 'human',
  connected: true,
  host: opts.host ?? false,
});

const setLobby = (seats: SeatMsg[]): void => {
  useStore.getState().setIdentity('p1', 'tok');
  useStore.getState().setLobby({
    code: 'ABCDE',
    seats,
    config: { mode: 'classic', gameEndScore: 100 },
    canStart: true,
    started: false,
  });
};

beforeEach(() => {
  useStore.getState().reset();
  useSettings.getState().set({ lang: 'es', reducedMotion: false });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('nombres de bot localizados (sin cambio de protocolo)', () => {
  it('traduce el formato del servidor solo en asientos bot', () => {
    expect(displaySeatName({ name: 'Bot listo 3', controller: 'bot' }, 'en')).toBe('Smart bot 3');
    expect(displaySeatName({ name: 'Bot torpe 1', controller: 'bot' }, 'en')).toBe('Dumb bot 1');
    expect(displaySeatName({ name: 'Bot listo 3', controller: 'bot' }, 'es')).toBe('Bot listo 3');
    expect(displaySeatName({ name: 'Bot listo 3', controller: 'human' }, 'en')).toBe('Bot listo 3');
    expect(displaySeatName({ name: 'Robotín', controller: 'bot' }, 'en')).toBe('Robotín');
  });

  it('la sala muestra el bot en el idioma elegido', () => {
    useSettings.getState().set({ lang: 'en' });
    setLobby([seat('p1', 'Ana', { host: true }), seat('p2', 'Bot listo 1', { bot: true })]);
    render(<Lobby />);
    expect(screen.getAllByText('Smart bot 1').length).toBeGreaterThan(0);
  });
});

describe('copiar el código de sala', () => {
  it('si el portapapeles rechaza, NO dice «Copiado» y explica qué hacer', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    setLobby([seat('p1', 'Ana', { host: true })]);
    render(<Lobby />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    });
    expect(screen.queryByText('Copiado')).toBeNull();
    expect(screen.getByText(/No se pudo copiar/)).toBeTruthy();
  });

  it('si copia de verdad, confirma', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setLobby([seat('p1', 'Ana', { host: true })]);
    render(<Lobby />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    });
    expect(writeText).toHaveBeenCalledWith('ABCDE');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
  });

  it('copyText devuelve false sin API ni execCommand', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyText('X')).toBe(false);
  });
});

describe('rejilla de asientos estable (bug: doble clic en «Añadir bot»)', () => {
  it('siempre 6 tarjetas y los botones de bot ANTES de la rejilla: añadir no los desplaza', () => {
    setLobby([seat('p1', 'Ana', { host: true })]);
    const { rerender, container } = render(<Lobby />);
    const cards = (): number => container.querySelectorAll('.seats > li.seat-card').length;
    expect(cards()).toBe(6);
    const btn = screen.getByRole('button', { name: 'Añadir bot listo' });
    const list = container.querySelector('.seats');
    expect(list).toBeTruthy();
    // el botón precede a la lista: que la lista cambie no lo mueve
    expect(
      btn.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(addBot).toHaveBeenCalledTimes(2);
    setLobby([seat('p1', 'Ana', { host: true }), seat('p2', 'Bot listo 1', { bot: true })]);
    rerender(<Lobby />);
    expect(cards()).toBe(6);
    expect(screen.getByRole('button', { name: 'Añadir bot listo' })).toBe(btn);
  });

  it('el anfitrión lleva corona y el bot su insignia', () => {
    setLobby([seat('p1', 'Ana', { host: true }), seat('p2', 'Bot torpe 2', { bot: true })]);
    render(<Lobby />);
    expect(screen.getByRole('img', { name: 'anfitrión' })).toBeTruthy();
    const bot = screen.getAllByText('Bot torpe 2')[0]?.closest('li');
    expect(bot).toBeTruthy();
    expect(within(bot as HTMLElement).getByText('bot')).toBeTruthy();
  });
});

describe('puntuación: podio', () => {
  it('con movimiento reducido muestra los totales finales y el podio en orden 2-1-3', () => {
    useSettings.getState().set({ reducedMotion: true });
    setLobby([seat('p1', 'Ana', { host: true }), seat('p2', 'Bea'), seat('p3', 'Cris')]);
    const view = {
      phase: 'GAME_END',
      scores: {
        p1: { round: 1, total: 20 },
        p2: { round: 2, total: 50 },
        p3: { round: 3, total: 80 },
      },
      legal: [],
    } as unknown as PlayerView;
    useStore.getState().setView(view, { p1: 'Ana', p2: 'Bea', p3: 'Cris' });
    const { container } = render(<Score />);
    const podium = [...container.querySelectorAll('.podium-step .podium-name')].map(
      (n) => n.textContent,
    );
    expect(podium).toEqual(['Bea', 'Ana', 'Cris']);
    const totals = [...container.querySelectorAll('td.total [aria-hidden="true"]')].map(
      (n) => n.textContent,
    );
    expect(totals).toEqual(['20', '50', '80']);
  });
});

describe('App', () => {
  it('el aviso de girar existe en todas las pantallas y el título no lleva cabecera', () => {
    render(<App />);
    expect(screen.getByText('Gira el dispositivo para jugar en horizontal')).toBeTruthy();
    expect(document.querySelector('.topbar')).toBeNull();
    act(() => useStore.getState().setScreen('tutorial'));
    expect(screen.getByText('Gira el dispositivo para jugar en horizontal')).toBeTruthy();
    expect(document.querySelector('.topbar')).toBeTruthy();
  });

  it('«Menos movimiento» marca la app para congelar las animaciones de menú', () => {
    useSettings.getState().set({ reducedMotion: true });
    const { container } = render(<App />);
    expect(container.querySelector('.app.reduce-motion')).toBeTruthy();
  });
});
