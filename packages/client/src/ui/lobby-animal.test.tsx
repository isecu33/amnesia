/** D-045 · elegir animal en la sala: el ocupado no se puede elegir ni se reasigna. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';

const chooseSpecies = vi.fn();
vi.mock('../net/client.js', () => ({
  addBot: vi.fn(),
  configure: vi.fn(),
  startGame: vi.fn(),
  chooseSpecies: (...a: unknown[]) => chooseSpecies(...a),
}));

const seat = (playerId: string, name: string, species: 'owl' | 'fox', host = false) => ({
  playerId,
  name,
  avatar: 0,
  species,
  controller: 'human' as const,
  connected: true,
  host,
});

beforeEach(() => {
  useStore.getState().reset();
  useSettings.getState().set({ lang: 'es' });
  chooseSpecies.mockClear();
  useStore.getState().setIdentity('p1', 'tok');
  useStore.getState().setLobby({
    code: 'ABCDE',
    seats: [seat('p1', 'Ana', 'owl', true), seat('p2', 'Bea', 'fox')],
    config: { mode: 'classic' },
    canStart: true,
    started: false,
  });
});
afterEach(cleanup);

describe('selector de animal en la sala', () => {
  it('muestra los 6 animales, el propio marcado y el del rival no disponible', () => {
    render(<Lobby />);
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    expect(radios).toHaveLength(6);
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true'); // búho, el mío
    const fox = radios[1]!;
    expect(fox.getAttribute('aria-disabled')).toBe('true');
    expect(fox.textContent).toBe('Ocupado');
    expect(fox.getAttribute('title')).toBe('Lo lleva Bea');
  });

  it('elegir uno libre lo envía; el ocupado y el propio no envían nada', () => {
    render(<Lobby />);
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    fireEvent.click(radios[1]!); // zorro, ocupado
    fireEvent.click(radios[0]!); // búho, ya mío
    expect(chooseSpecies).not.toHaveBeenCalled();
    fireEvent.click(radios[2]!); // oso
    expect(chooseSpecies).toHaveBeenCalledWith('bear');
  });
});
