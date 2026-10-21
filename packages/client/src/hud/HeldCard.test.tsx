/** La carta robada solo se ve en el turno propio y con su valor (DREW_VALUE, I2). */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { HeldCard } from './HeldCard.js';

const viewWith = (overrides: Partial<PlayerView>): PlayerView =>
  ({
    you: { id: 'p1', slots: ['hidden'], sealed: false, lockedForMs: 0 },
    others: [],
    activePlayer: 'p1',
    ...overrides,
  }) as unknown as PlayerView;

describe('carta en mano', () => {
  afterEach(cleanup);

  it('muestra el valor de lo que has robado', () => {
    render(<HeldCard view={viewWith({ drawn: { source: 'deck', value: 7 } })} />);
    expect(screen.getByRole('status').textContent).toContain('7');
  });

  it('no muestra nada si no has robado', () => {
    const { container } = render(<HeldCard view={viewWith({})} />);
    expect(container.textContent).toBe('');
  });

  it('no muestra la carta de otro jugador', () => {
    const { container } = render(
      <HeldCard view={viewWith({ activePlayer: 'p2', drawn: { source: 'discard', value: 4 } })} />,
    );
    expect(container.textContent).toBe('');
  });

  it('si el valor aún no ha llegado, avisa sin inventarlo', () => {
    render(<HeldCard view={viewWith({ drawn: { source: 'deck' } })} />);
    expect(screen.getByRole('status').textContent).not.toMatch(/\d/);
  });
});
