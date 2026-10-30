/**
 * Mapa = descriptor de datos (docs/01 §12, D-042, D-044). Solo cosmético: `core` no
 * lo ve y el protocolo solo transporta su id. `scene/map-builder.ts` lo convierte en
 * geometría; la herradura de asientos (`layout.ts`) es común a todos los mapas.
 */
import type { MapId } from '@totem/protocol';

export type { MapId } from '@totem/protocol';

/** Silueta del tablero. El polígono se inscribe para que su apotema valga el radio de mesa. */
export type TableShape = 'round' | 'octagon' | 'hex';
/** Cómo se pinta el tablero (`map-textures.ts`). */
export type TableMaterial = 'planks' | 'ice' | 'stone' | 'mossy-wood' | 'carved';
/** Qué geometría usan los «árboles» del fondo (`map-scenery.ts`). */
export type SceneryKind = 'pines' | 'stalagmites' | 'jungle' | 'dead-trees' | 'mesas';
export type RockKind = 'rock' | 'crystal' | 'ruin';
export type GroundKind = 'grass' | 'ice' | 'moss' | 'water' | 'sand';
export type SkyKind = 'stars' | 'cave' | 'dusk' | 'murk';
export type AccentKind = 'none' | 'stalactites' | 'pillars' | 'reeds' | 'totems';
export type MoteMode = 'orbit' | 'fall';

export interface MapDescriptor {
  id: MapId;
  mesa: {
    shape: TableShape;
    material: TableMaterial;
    /** tablero y canto */
    wood: number;
    woodDark: number;
    rim: number;
    /** círculo rúnico pintado en el centro */
    rune: number;
    /** taburetes de los personajes */
    stool: number;
  };
  fondo: {
    scenery: SceneryKind;
    skyKind: SkyKind;
    groundKind: GroundKind;
    sky: number;
    skyHorizon: number;
    ground: number;
    groundAlt: number;
    /** detalle fino del suelo (grietas, hojas, ondas…) */
    groundDetail: number;
    trees: number;
    /** anillo del que salen los árboles: distancia mínima y rango */
    treeRing: { min: number; range: number };
    treeColors: readonly [number, number, number];
    trunk: number;
    rockKind: RockKind;
    rocks: number;
    rock: number;
    accent: { kind: AccentKind; count: number; colors: readonly [number, number] };
    motes: { count: number; color: number; size: number; mode: MoteMode };
    /** astro del cielo (luna, sol, cristal); `size` 0 = ninguno */
    celestial: { color: number; size: number; x: number; y: number };
    stars: number;
    fog: { color: number; near: number; far: number };
  };
  luces: {
    ambient: { color: number; intensity: number };
    hemi: { sky: number; ground: number; intensity: number };
    moon: { color: number; intensity: number };
    /** la luz de vela es común a todos los mapas (D-044) */
    candle: { color: number; intensity: number; distance: number };
  };
  /** paleta cerrada de 24–32 colores para la cuantización del postproceso */
  paleta: readonly number[];
  /** reservado: el audio por mapa aún no está decidido (fuera de alcance) */
  ambiente: { sound: 'night-forest' };
}
