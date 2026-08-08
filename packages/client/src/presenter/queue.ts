/**
 * Cola de animación — docs/02 §5.2 (patrón clave).
 * Los eventos del servidor NO tocan la escena: entran aquí y el presenter los
 * consume de uno en uno. Si la cola se dispara (lag, reconexión) se colapsa.
 * Lógica pura: se testea sin WebGL ni GSAP.
 */
import type { GameEvent } from '@totem/core';
import { beatFor, type Beat } from './timelines.js';

/** Umbral de docs/02 §5.2. */
export const FAST_FORWARD_THRESHOLD = 8;

export interface Hooks {
  /** Ejecuta la timeline visual; el presenter solo mide el tiempo. */
  play(e: GameEvent, beat: Beat): void;
  /** La vista lógica local avanza cuando la animación EMPIEZA. */
  advance(e: GameEvent): void;
  /** Colapso: aplica de golpe y pide snapshot. */
  fastForward(events: GameEvent[]): void;
}

export class Presenter {
  private queue: GameEvent[] = [];
  private busyUntil = 0;
  private playing = false;

  constructor(private readonly hooks: Hooks) {}

  get pending(): number {
    return this.queue.length;
  }
  get isPlaying(): boolean {
    return this.playing;
  }

  enqueue(e: GameEvent): void {
    this.queue.push(e);
  }

  /** Llamar desde el bucle de render con el reloj de la página. */
  tick(nowMs: number): void {
    if (this.queue.length > FAST_FORWARD_THRESHOLD) {
      const all = this.queue;
      this.queue = [];
      this.playing = false;
      this.busyUntil = nowMs;
      for (const e of all) this.hooks.advance(e);
      this.hooks.fastForward(all);
      return;
    }
    if (nowMs < this.busyUntil) return;
    this.playing = false;
    const next = this.queue.shift();
    if (!next) return;
    const b = beatFor(next);
    if (b.advanceOnStart) this.hooks.advance(next);
    this.hooks.play(next, b);
    this.busyUntil = nowMs + b.durationMs;
    this.playing = b.durationMs > 0;
    // Los eventos de duración 0 no bloquean: encadenamos en el mismo tick.
    if (b.durationMs === 0) this.tick(nowMs);
  }

  /** Vacía la cola sin animar (cambio de ronda, salir de la mesa). */
  clear(): void {
    this.queue = [];
    this.playing = false;
    this.busyUntil = 0;
  }
}
