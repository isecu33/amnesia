/** Placa de turno: título, instrucción (el efecto manda) y última jugada. */
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TurnPlate } from './TurnPlate.js';
import { useSettings } from '../settings/store.js';
import { useStore } from '../state/store.js';
import type { TurnGuide } from './turn-guide.js';

const guide: TurnGuide = {
  tone: 'you',
  title: { key: 'plateYourTurn' },
  hint: { key: 'guideDraw' },
  chips: [],
  ultima: false,
};

describe('TurnPlate', () => {
  it('muestra quién juega y qué hacer', () => {
    useSettings.setState({ lang: 'es', subtitles: true });
    render(<TurnPlate guide={guide} effectHint={undefined} readHud={() => undefined} />);
    expect(screen.getByText('Tu turno')).toBeTruthy();
    expect(screen.getByText(/Roba una carta/)).toBeTruthy();
  });

  it('traduce el nombre del efecto dentro del título', () => {
    useSettings.setState({ lang: 'es', subtitles: true });
    const g: TurnGuide = {
      tone: 'you',
      title: { key: 'plateEffectYou', tvars: { effect: 'effPEEK' } },
      chips: [],
      ultima: false,
    };
    render(<TurnPlate guide={g} effectHint={undefined} readHud={() => undefined} />);
    expect(screen.getByText('Tu efecto: Vislumbre')).toBeTruthy();
  });

  it('el aviso del efecto sustituye a la instrucción de la guía', () => {
    useSettings.setState({ lang: 'en', subtitles: true });
    render(<TurnPlate guide={guide} effectHint="hintRumbleFirst" readHud={() => undefined} />);
    expect(screen.getByText(/Rumble/)).toBeTruthy();
    expect(screen.queryByText(/Draw a card/)).toBeNull();
  });

  it('no enseña como última jugada tu propio cambio de control de asiento', () => {
    useSettings.setState({ lang: 'es', subtitles: false });
    useStore.setState({ lang: 'es', playerId: 'p1', names: { p1: 'Tester', p2: 'Ana' }, log: [] });
    const { rerender } = render(
      <TurnPlate guide={guide} effectHint={undefined} readHud={() => undefined} />,
    );
    act(() => useStore.getState().addLog('Tester pasa a humano.'));
    rerender(<TurnPlate guide={guide} effectHint={undefined} readHud={() => undefined} />);
    expect(screen.queryByText('Tester pasa a humano.')).toBeNull();
    act(() => useStore.getState().addLog('Ana pasa a bot.'));
    rerender(<TurnPlate guide={guide} effectHint={undefined} readHud={() => undefined} />);
    expect(screen.getByText('Ana pasa a bot.')).toBeTruthy();
  });
});
