import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlayerView } from '@totem/core';
import { DoubleDrawChoice } from './DoubleDrawChoice.js';
import { EffectHint } from './EffectHint.js';

const view = (patch: Partial<PlayerView>): PlayerView =>
  ({
    you: { id: 'me', slots: ['hidden'], sealed: false, lockedForMs: 0 },
    others: [],
    phase: 'TURN_RESOLVE',
    legal: ['DOUBLE_DRAW_KEEP'],
    drawnChoice: [4, 11],
    ...patch,
  }) as unknown as PlayerView;

describe('DoubleDrawChoice', () => {
  it('muestra las dos cartas y manda el índice del botón pulsado', () => {
    const onKeep = vi.fn();
    render(<DoubleDrawChoice view={view({})} onKeep={onKeep} />);
    expect(screen.getByText('4')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.getAttribute('aria-label')).toMatch(/11/);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(onKeep).toHaveBeenCalledWith(1);
  });

  it('no pinta nada sin elección legal', () => {
    const { container } = render(<DoubleDrawChoice view={view({ legal: [] })} onKeep={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('EffectHint', () => {
  it('muestra el texto en el idioma pedido y nada sin clave', () => {
    const { rerender, container } = render(<EffectHint hintKey="hintRumbleFirst" lang="en" />);
    expect(screen.getByRole('status').textContent).toMatch(/Rumble/);
    rerender(<EffectHint hintKey={undefined} lang="en" />);
    expect(container.firstChild).toBeNull();
  });
});
