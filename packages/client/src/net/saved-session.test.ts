import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  SAVED_KEY,
  SAVED_TTL_MS,
  backoffMs,
  clearSession,
  loadSession,
  saveSession,
} from './saved-session.js';

const NOW = 1_700_000_000_000;

beforeEach(() => globalThis.localStorage.clear());

describe('E18 · sesión guardada para reconectar', () => {
  it('guarda y recupera token, código, nombre y avatar', () => {
    saveSession({ token: 'ABCDE-p1-xyz', code: 'ABCDE', name: 'Iker', avatar: 3 }, NOW);
    const s = loadSession(NOW + 1000);
    expect(s).toMatchObject({ token: 'ABCDE-p1-xyz', code: 'ABCDE', name: 'Iker', avatar: 3 });
  });

  it('caduca al expirar la sala (TTL 2 h)', () => {
    saveSession({ token: 't', code: 'ABCDE', name: 'x', avatar: 0 }, NOW);
    expect(loadSession(NOW + SAVED_TTL_MS - 1)).not.toBeNull();
    expect(loadSession(NOW + SAVED_TTL_MS + 1)).toBeNull();
  });

  it('ignora datos corruptos o incompletos sin lanzar', () => {
    globalThis.localStorage.setItem(SAVED_KEY, 'no-es-json');
    expect(loadSession(NOW)).toBeNull();
    globalThis.localStorage.setItem(SAVED_KEY, JSON.stringify({ code: 'ABCDE', at: NOW }));
    expect(loadSession(NOW)).toBeNull();
  });

  it('sin almacenamiento no rompe', () => {
    expect(loadSession(NOW, undefined)).toBeNull();
    expect(() => clearSession(undefined)).not.toThrow();
  });

  it('clear borra la sesión', () => {
    saveSession({ token: 't', code: 'ABCDE', name: 'x', avatar: 0 }, NOW);
    clearSession();
    expect(loadSession(NOW)).toBeNull();
  });

  it('el backoff crece y tiene tope', () => {
    const delays = Array.from({ length: MAX_RECONNECT_ATTEMPTS }, (_, i) => backoffMs(i));
    expect(delays[0]).toBe(500);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
    expect(backoffMs(99)).toBe(15_000);
  });
});
