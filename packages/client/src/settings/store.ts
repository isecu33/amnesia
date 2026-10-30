/** Ajustes accesibles siempre (docs/02 §5.4, requisitos duros de docs/01 §11). */
import { create } from 'zustand';
import type { Lang } from '../i18n/index.js';

export interface Settings {
  lang: Lang;
  volume: number;
  muted: boolean;
  /** paleta alternativa + patrones */
  colorBlind: boolean;
  /** números grandes en HUD y caras */
  bigNumbers: boolean;
  /** subtítulos de eventos en el log lateral */
  subtitles: boolean;
  /** sin oscilación de cámara ni VFX superfluos */
  reducedMotion: boolean;
  /** sala «tiempo ×1,5»: lo aplica el servidor a TODOS los timers */
  slowTimers: boolean;
  /** alto interno del render pixel-3D (D-042); 0 = nativo */
  pixelHeight: number;
  set: (patch: Partial<Omit<Settings, 'set' | 'load'>>) => void;
  load: () => void;
}

const KEY = 'totem.settings';
const DEFAULTS = {
  lang: 'es' as Lang,
  volume: 0.7,
  muted: false,
  colorBlind: false,
  bigNumbers: false,
  subtitles: false,
  reducedMotion: false,
  slowTimers: false,
  pixelHeight: 540,
};

function read(): typeof DEFAULTS {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<typeof DEFAULTS>) };
  } catch {
    return DEFAULTS;
  }
}

function write(s: typeof DEFAULTS): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin almacenamiento: los ajustes duran la sesión
  }
}

export const useSettings = create<Settings>((set, get) => ({
  ...DEFAULTS,
  set: (patch) => {
    set(patch);
    const current = get();
    const next: typeof DEFAULTS = {
      lang: current.lang,
      volume: current.volume,
      muted: current.muted,
      colorBlind: current.colorBlind,
      bigNumbers: current.bigNumbers,
      subtitles: current.subtitles,
      reducedMotion: current.reducedMotion,
      slowTimers: current.slowTimers,
      pixelHeight: current.pixelHeight,
      ...patch,
    };
    write(next);
  },
  load: () => set(read()),
}));
