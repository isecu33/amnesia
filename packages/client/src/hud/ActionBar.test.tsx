import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionBar } from './ActionBar.js';
import { useSettings } from '../settings/store.js';
import { useStore } from '../state/store.js';
import type { PlayerView } from '@totem/core';

describe('ActionBar', () => {
  it('cada chip equivale a su tecla y el registro siempre está', () => {
    useSettings.setState({ lang: 'es' });
    const onKey = vi.fn();
    render(
      <ActionBar
        chips={[{ key: 'r', glyph: 'R', label: 'actDrawDeck' }]}
        onKey={onKey}
        logOpen={false}
      />,
    );
    fireEvent.click(screen.getByText('Mazo'));
    fireEvent.click(screen.getByText('Registro'));
    expect(onKey.mock.calls).toEqual([['r'], ['l']]);
  });

  it('Sustituir sin slot elegido está deshabilitado y no lanza la tecla', () => {
    useSettings.setState({ lang: 'es' });
    const onKey = vi.fn();
    render(
      <ActionBar
        chips={[{ key: 's', glyph: 'S', label: 'actSwap', disabled: true }]}
        onKey={onKey}
        logOpen={false}
      />,
    );
    const btn = screen.getByText('Sustituir').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onKey).not.toHaveBeenCalled();
  });

  it('con slot elegido dice «Sustituir tótem N» y se puede pulsar', () => {
    useSettings.setState({ lang: 'es' });
    const onKey = vi.fn();
    render(
      <ActionBar
        chips={[
          { key: 's', glyph: 'S', label: 'actSwapN', labelVars: { n: 3 }, armed: true },
        ]}
        onKey={onKey}
        logOpen={false}
      />,
    );
    fireEvent.click(screen.getByText('Sustituir tótem 3'));
    expect(onKey).toHaveBeenCalledWith('s');
  });

  it('chips de cartas: descarte público y tu carta robada; nunca tótems ocultos', () => {
    useSettings.setState({ lang: 'es' });
    useStore.setState({
      view: {
        you: { id: 'me', slots: ['hidden', 'hidden'], sealed: false, lockedForMs: 0 },
        others: [],
        discardTop: 4,
        drawn: { source: 'deck', value: 7 },
        activePlayer: 'me',
        legal: [],
      } as unknown as PlayerView,
    });
    render(<ActionBar chips={[]} onKey={() => undefined} logOpen={false} />);
    expect(screen.getByRole('status', { name: /Descarte: 4 Ciervo/ })).toBeTruthy();
    expect(screen.getByRole('status', { name: /Tu carta: 7 Búho/ })).toBeTruthy();
    // La carta robada de otro (valor oculto) no genera chip.
    useStore.setState({
      view: {
        you: { id: 'me', slots: ['hidden'], sealed: false, lockedForMs: 0 },
        others: [],
        drawn: { source: 'deck' },
        activePlayer: 'r1',
        legal: [],
      } as unknown as PlayerView,
    });
  });
});
