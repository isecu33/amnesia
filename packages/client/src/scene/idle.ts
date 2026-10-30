/**
 * Animación de reposo de las marionetas (D-045): parpadeo y mirada. Datos y
 * lógica puros, sin Three.js: el azar entra por un RNG inyectado para poder
 * testear el temporizador, y «reducir movimiento» lo apaga todo.
 */
import type { Phase } from '@totem/core';

export type Rng = () => number;

/** Un parpadeo cada 3–6 s, con tiempo aleatorio por personaje. */
export const BLINK_MIN_MS = 3000;
export const BLINK_MAX_MS = 6000;
/** El párpado baja y sube (escala en Y) en ~120 ms. */
export const BLINK_CLOSE_MS = 120;

export function nextBlinkDelay(rng: Rng): number {
  return BLINK_MIN_MS + rng() * (BLINK_MAX_MS - BLINK_MIN_MS);
}

/**
 * Temporizador de parpadeo de un personaje. `step` avanza el reloj y devuelve
 * cuánto cubre el párpado el ojo (0 = abierto, 1 = cerrado); un parpadeo es un
 * triángulo de `BLINK_CLOSE_MS`.
 */
export class BlinkTimer {
  private waitMs: number;
  private closingMs = 0;

  constructor(private readonly rng: Rng) {
    this.waitMs = nextBlinkDelay(rng);
  }

  step(dtMs: number, enabled = true): number {
    if (!enabled) {
      // Con «reducir movimiento» el ojo se queda abierto y el reloj se reinicia.
      this.closingMs = 0;
      return 0;
    }
    if (this.closingMs > 0) {
      this.closingMs = Math.max(0, this.closingMs - dtMs);
      if (this.closingMs === 0) this.waitMs = nextBlinkDelay(this.rng);
      return this.closure();
    }
    this.waitMs -= dtMs;
    if (this.waitMs <= 0) {
      // El tiempo que se pasó del retardo ya cuenta como parpadeo empezado.
      this.closingMs = Math.max(1, BLINK_CLOSE_MS + this.waitMs);
      return this.closure();
    }
    return 0;
  }

  private closure(): number {
    const t = 1 - this.closingMs / BLINK_CLOSE_MS; // 0 → 1 a lo largo del parpadeo
    return 1 - Math.abs(2 * t - 1);
  }
}

// --- mirada -----------------------------------------------------------------

export type GazeSubject = { kind: 'deck' } | { kind: 'camera' } | { kind: 'seat'; seat: number };

/** Fases en las que alguien tiene el turno y es lo que miran los demás. */
const TURN_PHASES: readonly Phase[] = ['TURN_DRAW', 'TURN_RESOLVE', 'EFFECT_TARGETING'];

/**
 * A quién miran los personajes: al jugador activo (la cámara local si eres tú)
 * durante un turno y al mazo el resto del tiempo.
 */
export function gazeSubject(args: {
  phase: Phase;
  activePlayer: string | undefined;
  seatOf: ReadonlyMap<string, number>;
}): GazeSubject {
  const seat = args.activePlayer === undefined ? undefined : args.seatOf.get(args.activePlayer);
  if (seat === undefined || !TURN_PHASES.includes(args.phase)) return { kind: 'deck' };
  return seat === 0 ? { kind: 'camera' } : { kind: 'seat', seat };
}

/** Nadie se mira a sí mismo: el jugador activo mira al mazo. */
export function gazeFor(subject: GazeSubject, ownSeat: number): GazeSubject {
  return subject.kind === 'seat' && subject.seat === ownSeat ? { kind: 'deck' } : subject;
}
