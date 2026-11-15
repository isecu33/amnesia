import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionBar } from './ActionBar.js';
import { useSettings } from '../settings/store.js';

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
});
