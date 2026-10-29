import { describe, expect, it } from 'vitest';
import { DEFAULT_PIXEL_HEIGHT } from '../scene/postfx.js';
import { useSettings } from './store.js';

// #7: el render pixel por defecto sube de 360 a 540 px; sigue siendo ajustable.
describe('resolución de render por defecto', () => {
  it('es 540 px en los ajustes y en el postproceso', () => {
    expect(useSettings.getState().pixelHeight).toBe(540);
    expect(DEFAULT_PIXEL_HEIGHT).toBe(540);
  });

  it('sigue siendo ajustable por el usuario', () => {
    useSettings.getState().set({ pixelHeight: 360 });
    expect(useSettings.getState().pixelHeight).toBe(360);
    useSettings.getState().set({ pixelHeight: 540 });
  });
});
