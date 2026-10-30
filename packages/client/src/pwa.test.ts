import { describe, expect, it, vi } from 'vitest';
import {
  getInstallPrompt,
  isSafeToReload,
  listenInstallEvents,
  registerServiceWorker,
  type PwaDeps,
  type SwRegistrationLike,
} from './pwa.js';

function makeDeps(opts: { controller: boolean; screen: string; waiting?: boolean }) {
  const postMessage = vi.fn();
  const reload = vi.fn();
  const swListeners: Record<string, () => void> = {};
  const regListeners: Record<string, () => void> = {};
  let screenListener: ((s: string) => void) | undefined;
  const reg: SwRegistrationLike = {
    waiting: opts.waiting ? { postMessage } : null,
    installing: null,
    addEventListener: (t, fn) => {
      regListeners[t] = fn;
    },
  };
  const deps: PwaDeps = {
    sw: {
      controller: opts.controller ? {} : null,
      register: vi.fn(async () => reg),
      addEventListener: (t, fn) => {
        swListeners[t] = fn;
      },
    },
    getScreen: () => opts.screen,
    subscribeScreen: (fn) => {
      screenListener = fn;
      return () => {
        screenListener = undefined;
      };
    },
    reload,
  };
  return { deps, postMessage, reload, swListeners, emitScreen: (s: string) => screenListener?.(s) };
}

describe('isSafeToReload', () => {
  it('solo inicio y puntuación', () => {
    expect(isSafeToReload('home')).toBe(true);
    expect(isSafeToReload('score')).toBe(true);
    expect(isSafeToReload('table')).toBe(false);
    expect(isSafeToReload('lobby')).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('no hace nada sin soporte de service worker', async () => {
    await expect(
      registerServiceWorker({ ...makeDeps({ controller: false, screen: 'home' }).deps, sw: undefined }),
    ).resolves.toBeUndefined();
  });

  it('registra /sw.js con scope raíz', async () => {
    const { deps } = makeDeps({ controller: false, screen: 'home' });
    await registerServiceWorker(deps);
    expect(deps.sw?.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('aplica una actualización en espera de inmediato si está en inicio', async () => {
    const { deps, postMessage, swListeners, reload } = makeDeps({
      controller: true,
      screen: 'home',
      waiting: true,
    });
    await registerServiceWorker(deps);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    swListeners['controllerchange']?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('no corta una partida: espera a una pantalla segura', async () => {
    const { deps, postMessage, emitScreen } = makeDeps({
      controller: true,
      screen: 'table',
      waiting: true,
    });
    await registerServiceWorker(deps);
    expect(postMessage).not.toHaveBeenCalled();
    emitScreen('table');
    expect(postMessage).not.toHaveBeenCalled();
    emitScreen('score');
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it('no recarga en la primera instalación (sin controlador previo)', async () => {
    const { deps, swListeners, reload } = makeDeps({ controller: false, screen: 'home' });
    await registerServiceWorker(deps);
    swListeners['controllerchange']?.();
    expect(reload).not.toHaveBeenCalled();
  });

  it('no recarga por un cambio de controlador que no pidió la app', async () => {
    const { deps, swListeners, reload } = makeDeps({ controller: true, screen: 'home' });
    await registerServiceWorker(deps);
    swListeners['controllerchange']?.();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('listenInstallEvents', () => {
  it('guarda beforeinstallprompt y lo limpia con appinstalled', () => {
    const target = new EventTarget() as unknown as Window;
    listenInstallEvents(target);
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(ev);
    target.dispatchEvent(new Event('appinstalled'));
    expect(getInstallPrompt()).toBeNull();
  });
});
