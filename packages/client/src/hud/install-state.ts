/**
 * Lógica pura del botón «Instalar app» (D-043): decide qué ofrecer según el
 * entorno. Sin DOM, para poder testearla; `InstallButton` solo la conecta.
 */
export type InstallState = 'unavailable' | 'installable' | 'installed' | 'ios';

export interface InstallEnv {
  /** La app ya corre como app instalada (`display-mode: standalone`, `navigator.standalone`). */
  standalone: boolean;
  /** El navegador entregó `beforeinstallprompt` y aún no se ha consumido. */
  hasPrompt: boolean;
  /** iPhone/iPad: no hay `beforeinstallprompt`; se instala a mano desde Compartir. */
  isIos: boolean;
}

export function installState(env: InstallEnv): InstallState {
  if (env.standalone) return 'installed';
  if (env.hasPrompt) return 'installable';
  if (env.isIos) return 'ios';
  return 'unavailable';
}

/** iPadOS 13+ se identifica como Mac: se distingue por la pantalla táctil. */
export function detectIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}
