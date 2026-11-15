/**
 * Indicadores de las reglas v2 (#8) derivados de `PlayerView`: halo de presagio,
 * llamas de cadena y aro de Robo de efecto. La escena los pinta
 * (`scene/hud-layer.ts`) y `HudModel.frame` los traduce; aquí solo se leen los
 * campos reales de la vista (`omen`, `chain`, fase STEAL_WINDOW + timer 'steal').
 */
import { DEFAULT_CONFIG, type OmenId, type PlayerView } from '@totem/core';

export interface HudV2State {
  omen?: { color: number };
  chainLinks?: number;
  /** `deadlineTick` permite al modelo interpolar el resto con su reloj. */
  steal?: { remainingMs: number; totalMs: number; deadlineTick?: number };
}

/** Un color por presagio: Prisa (rojo), Calma (azul), Destello (ámbar). */
export const OMEN_COLORS: Record<OmenId, number> = {
  HASTE: 0xd8483c,
  CALM: 0x4a8fd8,
  FLASH: 0xf2c14e,
};

export interface DeriveHudV2Options {
  /** `stealWindowMs` de la sala; por defecto el de la config de core. */
  stealTotalMs?: number;
}

export function deriveHudV2(
  view: PlayerView,
  { stealTotalMs = DEFAULT_CONFIG.stealWindowMs }: DeriveHudV2Options = {},
): HudV2State | undefined {
  const out: HudV2State = {};
  if (view.omen) out.omen = { color: OMEN_COLORS[view.omen] };
  if (view.chain !== undefined && view.chain > 0) out.chainLinks = view.chain;
  const timer =
    view.phase === 'STEAL_WINDOW' ? view.timers.find((t) => t.kind === 'steal') : undefined;
  if (timer) {
    const remainingMs = timer.deadlineTick - view.tick;
    if (remainingMs > 0) {
      out.steal = { remainingMs, totalMs: stealTotalMs, deadlineTick: timer.deadlineTick };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
