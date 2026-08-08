/**
 * Sesión guardada para reconectar (E18). Lógica pura: se testea sin navegador.
 * No guarda datos personales más allá del nombre efímero (docs/02 §6).
 */
export interface SavedSession {
  token: string;
  code: string;
  name: string;
  avatar: number;
  /** epoch ms del último guardado */
  at: number;
}

export const SAVED_KEY = 'totem.session';
/** Más allá de esto la sala ya ha expirado (TTL 2 h, docs/02 §4.2). */
export const SAVED_TTL_MS = 2 * 60 * 60 * 1000;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

const store = (): Storage | undefined => {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

export function saveSession(s: Omit<SavedSession, 'at'>, now = Date.now()): void {
  try {
    store()?.setItem(SAVED_KEY, JSON.stringify({ ...s, at: now }));
  } catch {
    // sin almacenamiento: la reconexión automática simplemente no estará
  }
}

export function loadSession(
  now = Date.now(),
  storage: Storage | undefined = store(),
): SavedSession | null {
  try {
    const raw = storage?.getItem(SAVED_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    if (!s.token || !s.code || typeof s.at !== 'number') return null;
    if (now - s.at > SAVED_TTL_MS) return null;
    return {
      token: s.token,
      code: s.code,
      name: s.name ?? '',
      avatar: s.avatar ?? 0,
      at: s.at,
    };
  } catch {
    return null;
  }
}

export function clearSession(storage: Storage | undefined = store()): void {
  try {
    storage?.removeItem(SAVED_KEY);
  } catch {
    // ignorado
  }
}

/** Backoff con tope para el reintento automático tras una caída. */
export function backoffMs(attempt: number): number {
  return Math.min(15_000, 500 * 2 ** Math.max(0, attempt));
}
export const MAX_RECONNECT_ATTEMPTS = 6;
