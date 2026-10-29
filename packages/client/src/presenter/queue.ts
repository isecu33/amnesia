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
/** Beats que se pueden recortar y lo mínimo que se ven antes de recortarlos. */
export const LONG_BEAT_MS = 1000;
export const MIN_SHOWN_MS = 400;
/** Eventos que cambian la carta superior del descarte: abren ventana de match. */
export const URGENT_EVENTS: GameEvent['e'][] = [
  'DISCARDED_DRAWN',
  'SWAPPED_DRAWN',
  'MATCH_OK',
  'MATCH_FAIL',
];

export interface Hooks {
  /** Ejecuta la timeline visual; el presenter solo mide el tiempo. */
  play(e: GameEvent, beat: Beat): void;
  /** La vista lógica local avanza cuando la animación EMPIEZA. */
  advance(e: GameEvent): void;
  /** Colapso: aplica de golpe y pide snapshot. */
  fastForward(events: GameEvent[]): void;
  /**
   * D-045: llega un evento que abre ventana de Descarte Rápido; la escena recorta
   * el «peso» (retirada de mano con retardo) que aún esté sonando.
   */
  trim?(): void;
}

export class Presenter {
  private queue: GameEvent[] = [];
  private busyUntil = 0;
  private playing = false;
  private startedAt = 0;
  private currentMs = 0;

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
    // D-042: una animación larga (vista privada, fallo, revelación) nunca retrasa
    // lo que abre una ventana de Descarte Rápido: se recorta en cuanto llega.
    if (
      nowMs < this.busyUntil &&
      this.currentMs > LONG_BEAT_MS &&
      nowMs - this.startedAt >= MIN_SHOWN_MS &&
      this.queue.some((e) => URGENT_EVENTS.includes(e.e))
    ) {
      this.busyUntil = nowMs;
    }
    if (nowMs < this.busyUntil) return;
    this.playing = false;
    const next = this.queue.shift();
    if (!next) return;
    if (URGENT_EVENTS.includes(next.e)) this.hooks.trim?.();
    const b = beatFor(next);
    if (b.advanceOnStart) this.hooks.advance(next);
    this.hooks.play(next, b);
    this.busyUntil = nowMs + b.durationMs;
    this.startedAt = nowMs;
    this.currentMs = b.durationMs;
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
