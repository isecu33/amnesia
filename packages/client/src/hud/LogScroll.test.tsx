/** El pergamino de la HUD diegética (#8): marcador + registro, y nada de valores ocultos. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { useStore } from '../state/store.js';
import { LogScroll } from './LogScroll.js';

const view = {
  you: { id: 'p1', slots: ['hidden'], sealed: false, lockedForMs: 0 },
  others: [{ id: 'p2', slots: ['hidden'], sealed: false, controller: 'bot' }],
  deckCount: 10,
  phase: 'TURN_DRAW',
  activePlayer: 'p2',
  orbit: 2,
  timers: [],
  scores: { p1: { total: 12 }, p2: { total: 34 } },
  legal: [],
  tick: 0,
} as unknown as PlayerView;

describe('pergamino de registro', () => {
  beforeEach(() => useStore.getState().reset());
  afterEach(cleanup);

  it('lista el marcador de todos y marca a quien juega', () => {
    render(<LogScroll view={view} names={{ p1: 'Ana', p2: 'Bea' }} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('34')).toBeTruthy();
    expect(screen.getByText('Bea').closest('li')?.className).toContain('active');
  });

  it('enseña las jugadas más recientes primero', () => {
    useStore.getState().addLog('Ana robó del mazo');
    useStore.getState().addLog('Bea descartó');
    render(<LogScroll view={view} names={{ p1: 'Ana', p2: 'Bea' }} />);
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines.indexOf('Bea descartó')).toBeLessThan(lines.indexOf('Ana robó del mazo'));
  });
});
