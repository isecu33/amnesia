/**
 * Catálogo de poses de las marionetas y qué evento dispara cada una
 * (docs/01 §11, tabla de docs/05 §2.4). Datos puros: `characters.ts` los anima.
 */
import type { CardValue, GameEvent, PlayerView } from '@totem/core';

export type PoseId =
  | 'idle'
  | 'turn'
  | 'reach'
  | 'hold'
  | 'toss'
  | 'point'
  | 'slap'
  | 'flinch'
  | 'ultima'
  | 'cheer'
  | 'slump'
  // Un gesto distinto por efecto (docs/01 §11).
  | 'peek'
  | 'spy'
  | 'swap'
  | 'seer'
  // Reacciones de quien mira y emotes.
  | 'startle'
  | 'glance'
  | 'wave'
  | 'laugh'
  | 'suspect'
  | 'clap'
  | 'sigh';

export interface PoseDef {
  durationMs: number;
  /** inclinación del torso hacia la mesa (rad) */
  lean: number;
  /** cabeceo (rad, positivo = mira abajo) */
  headPitch: number;
}

export const POSES: Record<PoseId, PoseDef> = {
  idle: { durationMs: 400, lean: 0, headPitch: 0.12 },
  turn: { durationMs: 300, lean: 0.16, headPitch: 0.22 },
  reach: { durationMs: 380, lean: 0.32, headPitch: 0.3 },
  hold: { durationMs: 300, lean: 0.05, headPitch: 0.05 },
  toss: { durationMs: 420, lean: 0.22, headPitch: 0.25 },
  point: { durationMs: 450, lean: 0.25, headPitch: 0.3 },
  // Descarte Rápido: golpe seco y corto, nunca tapa la ventana de match.
  slap: { durationMs: 200, lean: 0.38, headPitch: 0.35 },
  flinch: { durationMs: 350, lean: -0.18, headPitch: -0.15 },
  ultima: { durationMs: 600, lean: 0.3, headPitch: 0.1 },
  cheer: { durationMs: 700, lean: -0.12, headPitch: -0.3 },
  slump: { durationMs: 700, lean: 0.25, headPitch: 0.55 },
  // Peek: sube la carta a la cara; Spy: se inclina y señala; Swap: manos cruzadas;
  // Seer: mano sobre los ojos y luego señala.
  peek: { durationMs: 900, lean: 0.12, headPitch: 0.3 },
  spy: { durationMs: 600, lean: 0.28, headPitch: 0.2 },
  swap: { durationMs: 700, lean: 0.3, headPitch: 0.25 },
  seer: { durationMs: 900, lean: 0.2, headPitch: 0.15 },
  startle: { durationMs: 450, lean: -0.2, headPitch: -0.2 },
  glance: { durationMs: 500, lean: 0.03, headPitch: 0.1 },
  wave: { durationMs: 900, lean: 0, headPitch: -0.05 },
  laugh: { durationMs: 900, lean: -0.1, headPitch: -0.2 },
  suspect: { durationMs: 900, lean: 0.2, headPitch: 0.1 },
  clap: { durationMs: 800, lean: 0.05, headPitch: -0.05 },
  sigh: { durationMs: 900, lean: 0.2, headPitch: 0.4 },
};

export type PoseTarget =
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'slot'; player: string; slot: number }
  /** la cabeza de otro jugador (la cámara local si eres tú) */
  | { kind: 'player'; player: string };

export interface PoseCue {
  pose: PoseId;
  target?: PoseTarget;
}

/** Gesto de quien resuelve cada efecto; los no listados señalan. */
const EFFECT_POSE: Partial<Record<string, PoseId>> = {
  PEEK: 'peek',
  SPY: 'spy',
  SWAP: 'swap',
  RUMBLE: 'swap',
  SEER: 'seer',
};

/** Qué hace el personaje `who` ante un evento público; undefined = nada. */
export function poseForEvent(e: GameEvent, who: string): PoseCue | undefined {
  switch (e.e) {
    case 'TURN_STARTED':
      return e.player === who ? { pose: 'turn' } : undefined;
    case 'DREW':
      return e.player === who ? { pose: 'reach', target: { kind: e.source } } : undefined;
    case 'DISCARDED_DRAWN':
      return e.player === who ? { pose: 'toss', target: { kind: 'discard' } } : undefined;
    case 'SWAPPED_DRAWN':
      return e.player === who
        ? { pose: 'reach', target: { kind: 'slot', player: e.player, slot: e.slot } }
        : undefined;
    case 'EFFECT_RESOLVED': {
      if (e.player !== who) return undefined;
      const first = e.publicInfo.slots[0];
      const pose = EFFECT_POSE[e.effect] ?? 'point';
      return first
        ? { pose, target: { kind: 'slot', player: first.player, slot: first.slot } }
        : { pose };
    }
    case 'MATCH_OK':
      return e.player === who
        ? { pose: 'slap', target: { kind: 'slot', player: e.player, slot: e.slot } }
        : undefined;
    case 'MATCH_FAIL':
      return e.player === who ? { pose: 'flinch' } : undefined;
    case 'ULTIMA_CALLED':
      return e.player === who ? { pose: 'ultima' } : undefined;
    case 'ROUND_SCORED': {
      const mine = e.scores[who];
      if (!mine) return undefined;
      const best = Math.min(...Object.values(e.scores).map((s) => s.round));
      return { pose: mine.round <= best ? 'cheer' : 'slump' };
    }
    case 'GAME_ENDED':
      return { pose: e.winner === who ? 'cheer' : 'slump' };
    default:
      return undefined;
  }
}

/**
 * Qué cara enseña la carta que sostiene `owner` (I2, E22). La de un rival es
 * SIEMPRE el dorso, sepa lo que sepa el cliente; la tuya, solo si su valor te
 * ha llegado por `DREW_VALUE`.
 */
export function heldCardFace(args: {
  owner: string;
  you: string;
  drawn: PlayerView['drawn'];
}): 'back' | CardValue {
  if (args.owner !== args.you) return 'back';
  return args.drawn?.value ?? 'back';
}

/**
 * «Peso» al jugar carta (D-045): la mano tarda un instante en retirarse y la
 * carta rebota. Es solo puesta en escena: no cambia la duración de ningún beat
 * ni retrasa el Descarte Rápido, y el presenter puede recortarlo.
 */
export interface WeightDef {
  /** espera antes de retirar la mano (ms) */
  retractMs: number;
  /** rebote de la carta / la mano al asentarse (m) */
  hop: number;
}

export const WEIGHT: Partial<Record<PoseId, WeightDef>> = {
  reach: { retractMs: 140, hop: 0.025 },
  toss: { retractMs: 120, hop: 0.03 },
  slap: { retractMs: 90, hop: 0 },
};

/** Tope del peso: por debajo de la ventana de match, nunca la tapa. */
export const WEIGHT_MAX_MS = 250;
/** Velocidad a la que se consume el resto de una animación recortada. */
export const WEIGHT_TRIM_SPEED = 6;

/** Peso de una pose; `undefined` si no lo tiene o «reducir movimiento» está activo. */
export function weightFor(pose: PoseId, reduced: boolean): WeightDef | undefined {
  return reduced ? undefined : WEIGHT[pose];
}

/**
 * Cómo reacciona `who` cuando el evento NO lo protagoniza él: sustos al ser
 * objetivo, miradas a lo que ocurre en la mesa. Solo mira ids y huecos públicos:
 * jamás valores de carta (I2).
 */
export function reactionForEvent(e: GameEvent, who: string): PoseCue | undefined {
  switch (e.e) {
    case 'EFFECT_RESOLVED':
      return e.player !== who && e.publicInfo.slots.some((s) => s.player === who)
        ? { pose: 'startle', target: { kind: 'player', player: e.player } }
        : undefined;
    case 'PRIVATE_REVEAL':
      // Espiado: solo el dueño del hueco y el espía (`to`) lo ven; sin valor.
      return e.player === who && e.to !== who
        ? { pose: 'startle', target: { kind: 'player', player: e.to } }
        : undefined;
    case 'EFFECT_STOLEN':
      if (e.owner === who) return { pose: 'startle', target: { kind: 'player', player: e.thief } };
      return e.thief === who ? { pose: 'slap', target: { kind: 'discard' } } : undefined;
    case 'PENALTY_CARD':
      return e.player === who ? { pose: 'sigh' } : undefined;
    case 'MATCH_FAIL':
      if (e.player === who) return undefined; // lo cubre `poseForEvent` (flinch)
      return e.owner === who
        ? { pose: 'startle', target: { kind: 'player', player: e.player } }
        : { pose: 'glance', target: { kind: 'slot', player: e.owner ?? e.player, slot: e.slot } };
    case 'MATCH_OK':
      return e.player === who
        ? undefined
        : { pose: 'glance', target: { kind: 'slot', player: e.owner ?? e.player, slot: e.slot } };
    case 'ULTIMA_CALLED':
      return e.player === who
        ? undefined
        : { pose: 'glance', target: { kind: 'player', player: e.player } };
    default:
      return undefined;
  }
}

/** Gesto propio (`poseForEvent`) o, si no lo protagoniza, su reacción. */
export function cueForEvent(e: GameEvent, who: string): PoseCue | undefined {
  return poseForEvent(e, who) ?? reactionForEvent(e, who);
}

/** Emotes del HUD por índice (orden de los iconos): saludo, risa, sospecha, aplauso, uf, susto. */
export const EMOTE_POSES: readonly PoseId[] = [
  'wave',
  'laugh',
  'suspect',
  'clap',
  'sigh',
  'startle',
];

/** Pose de un emote; un id fuera de rango cae en el saludo (como el icono). */
export function poseForEmote(id: number): PoseCue {
  return { pose: EMOTE_POSES[id] ?? 'wave' };
}

/** Segundos que la cabeza sigue al objetivo del gesto antes de volver a mirar la mesa. */
export const GAZE_HOLD_S: Partial<Record<PoseId, number>> = {
  point: 1.4,
  peek: 1.2,
  spy: 1.4,
  swap: 1.4,
  seer: 1.6,
  glance: 1.1,
  startle: 1.0,
};

/** Anticipación (>0 comprime) o estirón (<0) del cuerpo al empezar la pose; no en «reducir movimiento». */
export const SQUASH: Partial<Record<PoseId, number>> = {
  reach: 0.04,
  toss: 0.05,
  slap: 0.08,
  peek: 0.03,
  spy: 0.04,
  swap: 0.04,
  startle: -0.05,
  cheer: 0.05,
};

// --- clips del GLB (D-063..D-067) ------------------------------------------

export type RigClipId = 'coger_carta' | 'mirar_izq' | 'mirar_der';
/** Clips que debe traer cada GLB (rig_animal.py); `reposo` es el bucle base. */
export const REQUIRED_RIG_CLIPS = ['reposo', 'coger_carta', 'mirar_izq', 'mirar_der'] as const;
const CLIP_FPS = 30;
/** Fotogramas clave de `coger_carta`: agarra (22), levanta (42), sostiene (58). */
export const CLIP_GRIP_S = 22 / CLIP_FPS;
export const CLIP_LIFT_S = 42 / CLIP_FPS;
export const CLIP_HOLD_S = 58 / CLIP_FPS;
/** Punto álgido de `mirar_*`. */
const CLIP_LOOK_S = 30 / CLIP_FPS;
/** Tope de aceleración: más rápido deja de leerse como movimiento. */
export const MAX_CLIP_SPEED = 4;

/** Clips de `REQUIRED_RIG_CLIPS` que no están en `names` (para avisar al cargar). */
export function missingClips(names: readonly string[]): string[] {
  return REQUIRED_RIG_CLIPS.filter((c) => !names.includes(c));
}

interface ClipDef {
  clip: RigClipId | 'mirar';
  /** hasta qué segundo del clip debe llegar dentro de la duración de la pose */
  beatS: number;
}

export const POSE_CLIP: Partial<Record<PoseId, ClipDef>> = {
  reach: { clip: 'coger_carta', beatS: CLIP_GRIP_S },
  toss: { clip: 'coger_carta', beatS: CLIP_GRIP_S },
  slap: { clip: 'coger_carta', beatS: CLIP_GRIP_S },
  peek: { clip: 'coger_carta', beatS: CLIP_LIFT_S },
  glance: { clip: 'mirar', beatS: CLIP_LOOK_S },
  suspect: { clip: 'mirar', beatS: CLIP_LOOK_S },
};

export interface ClipPlan {
  clip: RigClipId;
  timeScale: number;
  /** pausar en «sostiene» hasta que la carta se suelte */
  hold: boolean;
}

/**
 * Qué clip lanza una pose en un rig y a qué velocidad: las poses rápidas (slap
 * 200 ms) aceleran el clip para que su gesto llegue en su ventana. Con «reducir
 * movimiento» no hay clip.
 */
export function clipPlan(
  pose: PoseId,
  o: { reduced: boolean; grabbing?: boolean; side?: 'left' | 'right' },
): ClipPlan | undefined {
  const def = POSE_CLIP[pose];
  if (!def || o.reduced) return undefined;
  const clip: RigClipId =
    def.clip === 'mirar' ? (o.side === 'right' ? 'mirar_der' : 'mirar_izq') : def.clip;
  const want = def.beatS / (POSES[pose].durationMs / 1000);
  return {
    clip,
    timeScale: Math.min(MAX_CLIP_SPEED, Math.max(1, want)),
    hold: pose === 'reach' && o.grabbing === true,
  };
}
