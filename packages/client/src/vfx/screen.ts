/**
 * Efectos de pantalla (game feel): destello de impacto, viñeta teñida y trauma
 * de cámara. Estado puro con `step(dt)` (se testea sin WebGL); `apply` lo vuelca
 * a los uniformes compartidos de `scene/postfx.ts`.
 *
 * Seguridad fotosensible: el destello es tenue (≤ FLASH_MAX) y nunca se repite a
 * más de 3 Hz. Con «Menos movimiento» (D-015) no hay destello ni sacudida; solo
 * queda la viñeta teñida, que es lenta y comunica qué pasó sin moverse.
 */
import { addTrauma, decayTrauma } from '../scene/camera-rig.js';
import { SCREEN_FX_UNIFORMS, srgbVec } from '../scene/postfx.js';

export const FLASH_MAX = 0.35;
/** Intervalo mínimo entre destellos (≤ 3 Hz, pauta WCAG 2.3.1). */
export const FLASH_MIN_INTERVAL_MS = 334;
export const FLASH_DECAY_MS = 160;
export const TINT_MAX = 0.65;

export interface Impact {
  /** color del destello / viñeta (hex) */
  color: number;
  /** 0..1 — se recorta a FLASH_MAX */
  flash?: number;
  /** 0..1 — trauma que se suma a la sacudida */
  trauma?: number;
}

export class ScreenFx {
  flash = 0;
  flashColor = 0xffffff;
  tint = 0;
  tintColor = 0x000000;
  trauma = 0;
  private tintPeak = 0;
  private tintHoldMs = 0;
  private tintFadeMs = 1;
  private tintElapsed = 0;
  private sinceFlashMs = Number.POSITIVE_INFINITY;

  constructor(private reduced = false) {}

  setReduced(r: boolean): void {
    this.reduced = r;
    if (r) {
      this.flash = 0;
      this.trauma = 0;
    }
  }

  impact(i: Impact): void {
    if (this.reduced) return;
    if (i.flash && this.sinceFlashMs >= FLASH_MIN_INTERVAL_MS) {
      this.flash = Math.min(FLASH_MAX, Math.max(this.flash, i.flash));
      this.flashColor = i.color;
      this.sinceFlashMs = 0;
    }
    if (i.trauma) this.trauma = addTrauma(this.trauma, i.trauma);
  }

  /** Viñeta teñida: sube rápido, se mantiene `holdMs` y se apaga en `fadeMs`. */
  tintPulse(color: number, amount: number, holdMs: number, fadeMs: number): void {
    this.tintColor = color;
    this.tintPeak = Math.min(TINT_MAX, amount);
    this.tint = this.tintPeak;
    this.tintHoldMs = holdMs;
    this.tintFadeMs = Math.max(1, fadeMs);
    this.tintElapsed = 0;
  }

  step(dtMs: number): void {
    this.sinceFlashMs += dtMs;
    this.flash = Math.max(0, this.flash - (FLASH_MAX * dtMs) / FLASH_DECAY_MS);
    this.trauma = decayTrauma(this.trauma, dtMs);
    if (this.tintPeak > 0) {
      this.tintElapsed += dtMs;
      const k = (this.tintElapsed - this.tintHoldMs) / this.tintFadeMs;
      this.tint = k <= 0 ? this.tintPeak : Math.max(0, this.tintPeak * (1 - k));
      if (this.tint === 0) this.tintPeak = 0;
    }
  }

  /** Vuelca el estado a los uniformes compartidos del postproceso. */
  apply(u = SCREEN_FX_UNIFORMS): void {
    u.uFlash.value = this.flash;
    u.uFlashColor.value.copy(srgbVec(this.flashColor));
    u.uTint.value = this.tint;
    u.uTintColor.value.copy(srgbVec(this.tintColor));
  }

  reset(): void {
    this.flash = 0;
    this.tint = 0;
    this.tintPeak = 0;
    this.trauma = 0;
    this.apply();
  }
}
