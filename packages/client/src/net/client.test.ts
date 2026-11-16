/** Guardas de la capa de red: errores que no se pisan y resincronía tras reconectar. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store.js';
import { ERROR_SHOW_MS, resyncAfterReconnect, showError } from './client.js';

afterEach(() => {
  vi.useRealTimers();
  useStore.getState().setError(undefined);
});

describe('net/client', () => {
  it('el temporizador de un error viejo no borra uno más nuevo', () => {
    vi.useFakeTimers();
    showError('A: viejo');
    vi.advanceTimersByTime(ERROR_SHOW_MS - 500);
    showError('B: nuevo');
    vi.advanceTimersByTime(600);
    expect(useStore.getState().error).toBe('B: nuevo');
    vi.advanceTimersByTime(ERROR_SHOW_MS);
    expect(useStore.getState().error).toBeUndefined();
  });

  it('tras reconectar se vacían cola, log, vista privada y efecto pendiente', () => {
    const s = useStore.getState();
    s.pushEvent({ e: 'DREW', player: 'A', source: 'deck' });
    s.addLog('línea vieja');
    s.setReveal({ player: 'A', slot: 0, value: 5, until: 1 });
    s.setPendingEffect('PEEK');
    resyncAfterReconnect();
    const after = useStore.getState();
    expect(after.queue).toEqual([]);
    expect(after.log).toEqual([]);
    expect(after.reveal).toBeUndefined();
    expect(after.pendingEffect).toBeUndefined();
  });
});
