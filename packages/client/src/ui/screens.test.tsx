/**
 * Tests de pantalla (jsdom) para WP-13/14/15. No cubren la escena 3D (necesita
 * WebGL): eso lo verifica el smoke de Playwright en CI.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home.js';
import { Lobby } from './Lobby.js';
import { Score } from './Score.js';
import { TutorialScreen } from './TutorialScreen.js';
import { SettingsPanel } from '../hud/SettingsPanel.js';
import { useStore } from '../state/store.js';
import { useSettings } from '../settings/store.js';
import { intentToAction, legalIntents } from './Table3D.js';
import type { PlayerView } from '@totem/core';

const configure = vi.fn();
const addBot = vi.fn();
const startGame = vi.fn();
const rematch = vi.fn();
vi.mock('../net/client.js', () => ({
  createRoom: vi.fn(async () => 'ABCDE'),
  joinRoom: vi.fn(async () => undefined),
  act: vi.fn(),
  addBot: (...a: unknown[]) => addBot(...a),
  configure: (...a: unknown[]) => configure(...a),
  startGame: () => startGame(),
  rematch: () => rematch(),
  sendEmote: vi.fn(),
  leave: vi.fn(),
  send: vi.fn(),
}));

beforeEach(() => {
  useStore.getState().reset();
  useSettings.getState().set({ lang: 'es' });
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('WP-13 · Home', () => {
  it('exige nombre antes de crear sala y ofrece el tutorial', () => {
    render(<Home />);
    const create = screen.getByRole('button', { name: 'Crear sala' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Iker' } });
    expect(create.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeTruthy();
  });

  it('permite elegir avatar', () => {
    render(<Home />);
    const avatars = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    expect(avatars.length).toBe(12);
    fireEvent.click(avatars[3]!);
    expect(avatars[3]!.getAttribute('aria-checked')).toBe('true');
  });

  it('unirse necesita código de 5 letras', () => {
    render(<Home />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'Iker' } });
    const join = screen.getByRole('button', { name: 'Unirse' }) as HTMLButtonElement;
    fireEvent.change(inputs[1]!, { target: { value: 'ABC' } });
    expect(join.disabled).toBe(true);
    fireEvent.change(inputs[1]!, { target: { value: 'ABCDE' } });
    expect(join.disabled).toBe(false);
  });
});

describe('WP-13 · Lobby', () => {
  const lobby = {
    code: 'ABCDE',
    seats: [
      {
        playerId: 'p1',
        name: 'Ana',
        avatar: 0,
        controller: 'human' as const,
        connected: true,
        host: true,
      },
      {
        playerId: 'p2',
        name: 'Bea',
        avatar: 1,
        controller: 'bot' as const,
        connected: true,
        host: false,
      },
    ],
    config: { mode: 'classic' as const, turnSeconds: 30, gameEndScore: 100 },
    canStart: true,
    started: false,
  };

  it('el anfitrión ve los controles y el resto no', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby(lobby);
    render(<Lobby />);
    expect(screen.getByRole('button', { name: 'Empezar partida' })).toBeTruthy();
    cleanup();

    useStore.getState().setIdentity('p2', 'tok');
    useStore.getState().setLobby(lobby);
    render(<Lobby />);
    expect(screen.queryByRole('button', { name: 'Empezar partida' })).toBeNull();
    expect(screen.getByText(/Esperando/)).toBeTruthy();
  });

  it('una config fuera de rango es imposible desde la UI (docs/01 §9)', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby(lobby);
    render(<Lobby />);
    const turn = screen.getByLabelText('Segundos por turno') as HTMLInputElement;
    fireEvent.change(turn, { target: { value: '5' } }); // fuera de [15,60]
    expect(configure).not.toHaveBeenCalled();
    fireEvent.change(turn, { target: { value: '45' } });
    expect(configure).toHaveBeenCalledWith({ turnSeconds: 45 });
  });

  it('añade bots y arranca', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby(lobby);
    render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir bot listo' }));
    expect(addBot).toHaveBeenCalledWith('greedy');
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }));
    expect(startGame).toHaveBeenCalled();
  });
});

describe('WP-13 · pantalla de puntuación y revancha', () => {
  const view = {
    you: { id: 'p1', slots: ['hidden'], sealed: false, lockedForMs: 0 },
    others: [],
    deckCount: 0,
    phase: 'GAME_END',
    activePlayer: 'p1',
    orbit: 3,
    timers: [],
    scores: { p1: { round: 4, total: 44 }, p2: { round: 9, total: 88 } },
    legal: [],
    tick: 0,
  } as unknown as PlayerView;

  it('ordena por total y ofrece revancha al anfitrión', () => {
    useStore.getState().setIdentity('p1', 'tok');
    useStore.getState().setLobby({
      code: 'ABCDE',
      seats: [
        { playerId: 'p1', name: 'Ana', avatar: 0, controller: 'human', connected: true, host: true },
      ],
      config: { mode: 'classic' },
      canStart: false,
      started: true,
    });
    useStore.getState().setView(view, { p1: 'Ana', p2: 'Bea' });
    render(<Score />);
    expect(screen.getByText('Fin de partida')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Ana')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revancha' }));
    expect(rematch).toHaveBeenCalled();
  });
});

describe('WP-14 · pantalla de tutorial', () => {
  it('avanza del paso 1 al 2 haciendo el vislumbre inicial', () => {
    render(<TutorialScreen />);
    expect(screen.getByText(/Paso 1\/6/)).toBeTruthy();
    const slots = document.querySelectorAll('.slots.big button');
    fireEvent.click(slots[0]!);
    fireEvent.click(slots[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Ver estos tótems/ }));
    expect(screen.getByText(/Paso 2\/6/)).toBeTruthy();
  });
});

describe('WP-15 · panel de ajustes', () => {
  it('los requisitos duros de accesibilidad están todos y persisten', () => {
    render(<SettingsPanel onClose={() => undefined} />);
    for (const label of [
      'Modo daltónico',
      'Números grandes',
      'Subtítulos',
      'Menos movimiento',
      'Silenciar',
    ]) {
      expect(screen.getByLabelText(label), label).toBeTruthy();
    }
    fireEvent.click(screen.getByLabelText('Modo daltónico'));
    expect(useSettings.getState().colorBlind).toBe(true);
    expect(globalThis.localStorage.getItem('totem.settings')).toContain('"colorBlind":true');
  });

  it('cambiar idioma traduce la interfaz', () => {
    const { rerender } = render(<SettingsPanel onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } });
    rerender(<SettingsPanel onClose={() => undefined} />);
    expect(screen.getByText('Settings')).toBeTruthy();
    useSettings.getState().set({ lang: 'es' });
  });
});

describe('WP-10 · la UI 3D solo permite lo que dice view.legal', () => {
  const base = {
    you: { id: 'me', slots: ['hidden', 'hidden'], sealed: false, lockedForMs: 0 },
    others: [{ id: 'r1', slots: ['hidden'], sealed: false, controller: 'human' }],
    discardTop: 4,
    deckCount: 10,
    phase: 'TURN_DRAW',
    activePlayer: 'me',
    orbit: 2,
    timers: [],
    scores: {},
    legal: [],
    tick: 0,
  } as unknown as PlayerView;

  it('sin nada legal no se resalta ni se puede actuar', () => {
    expect(legalIntents(base)).toEqual([]);
    expect(
      intentToAction(base, { kind: 'deck' }, { peekPicks: [], swapArmed: false, swapSource: null }),
    ).toEqual({});
  });

  it('con DRAW_DECK legal, el mazo brilla y clicarlo roba', () => {
    const v = { ...base, legal: ['DRAW_DECK'] } as PlayerView;
    expect(legalIntents(v)).toContainEqual({ kind: 'deck' });
    expect(
      intentToAction(v, { kind: 'deck' }, { peekPicks: [], swapArmed: false, swapSource: null })
        .action,
    ).toEqual({ t: 'DRAW_DECK' });
  });

  it('la campana solo responde si ÚLTIMA es legal', () => {
    const off = intentToAction(
      base,
      { kind: 'bell' },
      { peekPicks: [], swapArmed: false, swapSource: null },
    );
    expect(off.action).toBeUndefined();
    const v = { ...base, legal: ['CALL_ULTIMA'] } as PlayerView;
    expect(
      intentToAction(v, { kind: 'bell' }, { peekPicks: [], swapArmed: false, swapSource: null })
        .action,
    ).toEqual({
      t: 'CALL_ULTIMA',
    });
  });

  it('un tótem propio dispara Descarte Rápido cuando es legal', () => {
    const v = { ...base, legal: ['MATCH_ATTEMPT'] } as PlayerView;
    expect(legalIntents(v)).toContainEqual({ kind: 'slot', player: 'me', slot: 0 });
    expect(
      intentToAction(
        v,
        { kind: 'slot', player: 'me', slot: 1 },
        { peekPicks: [], swapArmed: false, swapSource: null },
      ).action,
    ).toEqual({ t: 'MATCH_ATTEMPT', slot: 1 });
  });

  it('los tótems de un jugador sellado nunca se resaltan como objetivo (E10/E12)', () => {
    const v = {
      ...base,
      phase: 'EFFECT_TARGETING',
      legal: ['EFFECT_TARGET'],
      others: [{ id: 'r1', slots: ['hidden'], sealed: true, controller: 'human' }],
    } as unknown as PlayerView;
    expect(legalIntents(v).some((i) => i.kind === 'slot' && i.player === 'r1')).toBe(false);
  });
});
