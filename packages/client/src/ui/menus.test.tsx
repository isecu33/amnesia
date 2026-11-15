import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PlayerView } from '@totem/core';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { Home } from './Home.js';
import { Lobby } from './Lobby.js';
import { Score } from './Score.js';

const createRoom = vi.fn(async () => 'ABCDE');
const leave = vi.fn();
vi.mock('../net/client.js', () => ({
  createRoom: (...a: unknown[]) => createRoom(...(a as [])),
  joinRoom: vi.fn(async () => undefined),
  addBot: vi.fn(),
  configure: vi.fn(),
  startGame: vi.fn(),
  chooseSpecies: vi.fn(),
  rematch: vi.fn(),
  leave: () => leave(),
}));

const seat = (playerId: string, name: string, host = false) => ({
  playerId,
  name,
  avatar: 0,
  controller: 'human' as const,
  connected: true,
  host,
});

beforeEach(() => {
  useStore.getState().reset();
  useSettings.getState().set({ lang: 'es' });
  vi.clearAllMocks();
  globalThis.localStorage?.clear();
});
afterEach(cleanup);

describe('menús · Home', () => {
  it('las flechas mueven la selección de tótem (radiogroup accesible)', () => {
    render(<Home />);
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    expect(radios[0]!.getAttribute('tabindex')).toBe('0');
    expect(radios[1]!.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' });
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(radios[1]!, { key: 'ArrowLeft' });
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' }); // da la vuelta
    expect(radios[radios.length - 1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('el código solo admite letras del alfabeto de sala', () => {
    render(<Home />);
    const code = screen.getByLabelText('Código de sala') as HTMLInputElement;
    fireEvent.change(code, { target: { value: 'ab1-cdI' } });
    expect(code.value).toBe('ABCD');
  });

  it('explica por qué no se puede crear sala y Enter la crea con nombre', () => {
    render(<Home />);
    expect(screen.getByText(/Escribe tu nombre/)).toBeTruthy();
    const name = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(name, { target: { value: '  Iker ' } });
    fireEvent.submit(name.closest('form')!);
    expect(createRoom).toHaveBeenCalledWith('Iker', expect.any(Number), {});
  });
});

describe('menús · Sala', () => {
  const setLobby = (hostIsMe: boolean): void => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby({
      code: 'ABCDE',
      seats: [seat('p1', 'Ana', hostIsMe), seat('p2', 'Bea', !hostIsMe)],
      config: { mode: 'quick', turnSeconds: 40 },
      canStart: true,
      started: false,
    });
  };

  it('muestra cupo y asientos libres hasta el máximo de jugadores', () => {
    setLobby(true);
    render(<Lobby />);
    expect(screen.getByText('2/6 jugadores')).toBeTruthy();
    expect(screen.getAllByText('Asiento libre')).toHaveLength(4);
  });

  it('salir de la sala desconecta y vuelve al inicio', () => {
    setLobby(true);
    useStore.getState().setScreen('lobby');
    render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la sala' }));
    expect(leave).toHaveBeenCalled();
    expect(useStore.getState().screen).toBe('home');
  });

  it('el invitado ve un resumen de las reglas, sin controles', () => {
    setLobby(false);
    render(<Lobby />);
    expect(screen.getByText('Reglas de la sala')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('menús · Puntuación', () => {
  it('celebra al ganador propio y numera el ranking', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby({
      code: 'ABCDE',
      seats: [seat('p1', 'Ana', true), seat('p2', 'Bea')],
      config: { mode: 'classic', gameEndScore: 100 },
      canStart: false,
      started: true,
    });
    const view = {
      phase: 'GAME_END',
      scores: { p1: { round: -5, total: 30 }, p2: { round: 12, total: 101 } },
      legal: [],
    } as unknown as PlayerView;
    useStore.getState().setView(view, { p1: 'Ana', p2: 'Bea' });
    render(<Score />);
    expect(screen.getByText('¡Has ganado!')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('1')).toBeTruthy();
    expect(within(rows[0]!).getByText('-5')).toBeTruthy();
    expect(within(rows[1]!).getByText('+12')).toBeTruthy();
    expect(rows[1]!.className).toContain('at-risk');
  });
});
