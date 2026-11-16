/**
 * Cola de animación — docs/02 §5.2 (patrón clave).
 * Los eventos del servidor NO tocan la escena: entran aquí y el presenter los
 * consume de uno en uno. Si la cola se dispara (lag, reconexión) se colapsa.
 * Lógica pura: se testea sin WebGL ni GSAP.
 */
import type { GameEvent } from '@totem/core';
import { beatFor, type Beat, type BeatCtx, type SfxId } from './timelines.js';
import { revealsToReplay } from './play-effects.js';

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
  // P1: la ventana de robo (1,5 s) y la cadena nunca esperan tras un fallo de 3 s.
  'STEAL_WINDOW_OPENED',
  'EFFECT_STOLEN',
  'CHAIN_LINK',
  // E32: la carta rechazada del Doble Robo cae boca arriba y es matchable.
  'DOUBLE_DRAW_REJECTED',
];

/** Eventos de efecto cuyo sonido sobrevive al colapso de la cola (su subtítulo ya está en el log). */
export const CUE_ON_COLLAPSE: GameEvent['e'][] = [
  'STEAL_WINDOW_OPENED',
  'EFFECT_STOLEN',
  'EFFECT_RESOLVED',
  'EFFECT_SKIPPED',
  'CHAIN_LINK',
  'CHAIN_BROKEN',
  'OMEN_CHANGED',
  'DOUBLE_DRAW_PENDING',
  'DOUBLE_DRAW_CLEARED',
  'DOUBLE_DRAW_REJECTED',
  'WILD_GIFT',
];
/** Tope de sonidos al colapsar: se oye qué pasó sin hacer ruido. */
export const MAX_COLLAPSE_CUES = 3;
/** Vistas privadas que se conservan tras un colapso (Ojo Compartido trae 2). */
export const KEEP_REVEALS_ON_COLLAPSE = 2;

/**
 * Lo que aún se señala de una cola colapsada: los eventos de efecto más recientes,
 * uno por sonido distinto, como mucho MAX_COLLAPSE_CUES y en orden de llegada.
 */
export function collapseCues(
  events: readonly GameEvent[],
  ctx: BeatCtx = {},
): { e: GameEvent; beat: Beat }[] {
  const seen = new Set<SfxId>();
  const out: { e: GameEvent; beat: Beat }[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < MAX_COLLAPSE_CUES; i--) {
    const e = events[i] as GameEvent;
    if (!CUE_ON_COLLAPSE.includes(e.e)) continue;
    const beat = beatFor(e, ctx);
    const key = beat.sfx;
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    out.unshift({ e, beat });
  }
  return out;
}

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
  /**
   * El beat en curso termina (a su hora, recortado, colapsado o al vaciar la cola).
   * Lo temporal ligado a la animación (vista privada, P1) se apaga aquí: así
   * nunca dura más ni menos que lo que se ve.
   */
  end?(e: GameEvent): void;
  /** Colapso: señal mínima (sonido/banner) de un evento de efecto que no se anima. */
  cue?(e: GameEvent, beat: Beat): void;
}

export interface PresenterOptions {
  /** jugador local: evita repetir sonidos que ya oyó con su vista privada */
  selfId?: string;
}

export class Presenter {
  private queue: GameEvent[] = [];
  private busyUntil = 0;
  private playing = false;
  private startedAt = 0;
  private currentMs = 0;
  private current?: GameEvent;
  /** vistas privadas re-encoladas tras un colapso: su vista lógica ya avanzó */
  private readonly advanced = new WeakSet<GameEvent>();

  constructor(
    private readonly hooks: Hooks,
    private readonly opts: PresenterOptions = {},
  ) {}

  private get ctx(): BeatCtx {
    return this.opts.selfId === undefined ? {} : { selfId: this.opts.selfId };
  }

  private finishCurrent(): void {
    const e = this.current;
    this.current = undefined;
    if (e) this.hooks.end?.(e);
  }

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
      const wasPlaying = this.current;
      this.finishCurrent();
      for (const e of all) this.hooks.advance(e);
      this.hooks.fastForward(all);
      for (const c of collapseCues(all, this.ctx)) this.hooks.cue?.(c.e, c.beat);
      // Lo que viste en privado no se pierde por el lag: se vuelve a mostrar entero,
      // salvo si su casilla cambió después (valor viejo sobre otra carta).
      const reveals = revealsToReplay(all, KEEP_REVEALS_ON_COLLAPSE, wasPlaying);
      for (const r of reveals) this.advanced.add(r);
      this.queue = reveals;
      if (reveals.length > 0) this.tick(nowMs);
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
    this.finishCurrent();
    const next = this.queue.shift();
    if (!next) return;
    if (URGENT_EVENTS.includes(next.e)) this.hooks.trim?.();
    const b = beatFor(next, this.ctx);
    if (b.advanceOnStart && !this.advanced.has(next)) this.hooks.advance(next);
    this.current = next;
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
    this.finishCurrent();
    this.queue = [];
    this.playing = false;
    this.busyUntil = 0;
  }
}
