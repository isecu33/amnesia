/** Reloj inyectable: el servidor es quien pone el tiempo (core es puro). */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/** Reloj falso para tests: el tiempo solo avanza cuando tú lo dices. */
export class FakeClock implements Clock {
  private t = 1_000_000;
  private seq = 0;
  private pending = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.pending.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** Avanza el tiempo disparando los timeouts vencidos en orden. */
  advance(ms: number): void {
    const target = this.t + ms;
    for (let guard = 0; guard < 10000; guard++) {
      const due = [...this.pending.entries()]
        .filter(([, v]) => v.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      const first = due[0];
      if (!first) break;
      this.pending.delete(first[0]);
      this.t = Math.max(this.t, first[1].at);
      first[1].fn();
    }
    this.t = Math.max(this.t, target);
  }
  get pendingCount(): number {
    return this.pending.size;
  }
}
