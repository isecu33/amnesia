/**
 * PWA (D-043): registro del service worker, aplicación segura de actualizaciones
 * y captura de `beforeinstallprompt` para `InstallButton`. Solo en producción:
 * en `vite dev` no se registra nada (evita cachés zombis).
 */
import { useStore } from './state/store.js';

/** Pantallas en las que recargar no corta una partida. */
const SAFE_SCREENS: ReadonlyArray<string> = ['home', 'score'];

export function isSafeToReload(screen: string): boolean {
  return SAFE_SCREENS.includes(screen);
}

// --- instalación -----------------------------------------------------------

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());

export function getInstallPrompt(): InstallPromptEvent | null {
  return deferred;
}
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Lanza el diálogo nativo; el evento solo sirve una vez. */
export async function promptInstall(): Promise<void> {
  const ev = deferred;
  if (!ev) return;
  deferred = null;
  notify();
  await ev.prompt();
  await ev.userChoice;
}

export function listenInstallEvents(target: Window): void {
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

// --- service worker --------------------------------------------------------

export interface SwContainer {
  controller: unknown;
  register: (url: string, opts?: { scope?: string }) => Promise<SwRegistrationLike>;
  addEventListener: (type: 'controllerchange', fn: () => void) => void;
}
export interface SwRegistrationLike {
  waiting: { postMessage: (m: unknown) => void } | null;
  installing: SwWorkerLike | null;
  addEventListener: (type: 'updatefound', fn: () => void) => void;
}
interface SwWorkerLike {
  state: string;
  addEventListener: (type: 'statechange', fn: () => void) => void;
}

export interface PwaDeps {
  sw: SwContainer | undefined;
  getScreen: () => string;
  subscribeScreen: (fn: (screen: string) => void) => () => void;
  reload: () => void;
}

/**
 * Registra el SW. Un SW nuevo espera; se activa y se recarga solo cuando la app
 * está en una pantalla segura (inicio o puntuación), jamás en sala o mesa.
 */
export async function registerServiceWorker(deps: PwaDeps): Promise<void> {
  const { sw } = deps;
  if (!sw) return;
  let reloadRequested = false;
  const hadController = sw.controller !== null && sw.controller !== undefined;

  sw.addEventListener('controllerchange', () => {
    // Solo recargamos si lo pedimos nosotros y había una versión anterior.
    if (reloadRequested && hadController) deps.reload();
  });

  const reg = await sw.register('/sw.js', { scope: '/' });

  let unsubscribe: (() => void) | undefined;
  const applyWhenSafe = (waiting: NonNullable<SwRegistrationLike['waiting']>): void => {
    const apply = (): void => {
      reloadRequested = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      unsubscribe?.();
    };
    if (isSafeToReload(deps.getScreen())) apply();
    else {
      unsubscribe?.();
      unsubscribe = deps.subscribeScreen((s) => {
        if (isSafeToReload(s)) apply();
      });
    }
  };

  if (reg.waiting && hadController) applyWhenSafe(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hadController && reg.waiting) applyWhenSafe(reg.waiting);
    });
  });
}

/** Punto de entrada desde `main.tsx`. */
export function initPwa(): void {
  listenInstallEvents(window);
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const start = (): void => {
    void registerServiceWorker({
      sw: navigator.serviceWorker as unknown as SwContainer,
      getScreen: () => useStore.getState().screen,
      subscribeScreen: (fn) => useStore.subscribe((s) => fn(s.screen)),
      reload: () => window.location.reload(),
    }).catch(() => {
      // Sin SW la app sigue funcionando online; solo se pierde el modo offline.
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
