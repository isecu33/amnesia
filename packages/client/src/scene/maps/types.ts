/**
 * Mapa = descriptor de datos (docs/01 §12, D-042). Solo cosmético: no toca reglas
 * ni protocolo. `scene/map-builder.ts` lo convierte en geometría; la herradura de
 * asientos (`layout.ts`) es común a todos los mapas.
 */
export type MapId = 'candle-night';

export interface MapDescriptor {
  id: MapId;
  mesa: {
    shape: 'round';
    /** madera del tablero y del canto */
    wood: number;
    woodDark: number;
    rim: number;
    /** círculo rúnico pintado en el centro */
    rune: number;
    /** taburetes de los personajes */
    stool: number;
  };
  fondo: {
    kind: 'forest';
    sky: number;
    skyHorizon: number;
    ground: number;
    groundAlt: number;
    trees: number;
    treeColors: readonly [number, number, number];
    trunk: number;
    rocks: number;
    rock: number;
    fireflies: number;
    firefly: number;
    moon: number;
    fog: { color: number; near: number; far: number };
  };
  luces: {
    ambient: { color: number; intensity: number };
    hemi: { sky: number; ground: number; intensity: number };
    moon: { color: number; intensity: number };
    candle: { color: number; intensity: number; distance: number };
  };
  /** paleta cerrada de 24–32 colores para la cuantización del postproceso */
  paleta: readonly number[];
  ambiente: { sound: 'night-forest' };
}
