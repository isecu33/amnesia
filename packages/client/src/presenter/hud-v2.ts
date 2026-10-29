/**
 * Punto de entrada de los indicadores que dependen de las reglas v2 (#8):
 * halo de presagio, llamas de cadena y aro de Robo de efecto.
 *
 * Hoy `PlayerView` y los eventos del protocolo NO llevan esos datos (los
 * implementa otro agente en `core`/`protocol`), así que `deriveHudV2` devuelve
 * `undefined` y la escena los deja apagados. La escena ya los pinta
 * (`scene/hud-layer.ts`) y el modelo ya los traduce (`HudModel.frame`).
 *
 * Para cablearlos cuando existan, solo hay que rellenar `deriveHudV2` leyendo
 * los campos reales (vista y/o eventos) y devolver este tipo:
 *  - `omen`: color del halo del presagio vigente (un color por presagio).
 *  - `chainLinks`: eslabones de la cadena en curso (0 = sin cadena).
 *  - `steal`: ventana abierta de Robo de efecto, con lo que queda y el total (ms).
 * No se inventa ningún campo de protocolo aquí: este tipo es solo del cliente.
 */
import type { PlayerView } from '@totem/core';

export interface HudV2State {
  omen?: { color: number };
  chainLinks?: number;
  steal?: { remainingMs: number; totalMs: number };
}

/** TODO(reglas v2): leer los campos reales de `PlayerView`/eventos cuando existan. */
export function deriveHudV2(_view: PlayerView): HudV2State | undefined {
  return undefined;
}
