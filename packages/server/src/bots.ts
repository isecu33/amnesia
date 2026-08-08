/**
 * Bots — docs/02 §4.2.
 * D-009: `Bot` añade `observe(event)` a la firma del doc, porque GreedyBot necesita
 * memorizar sus vislumbres privados igual que haría un humano.
 */
import type { Action, CardValue, GameEvent, PlayerView } from '@totem/core';

export interface Bot {
  readonly id: string;
  readonly kind: 'random' | 'greedy';
  observe(e: GameEvent): void;
  decide(v: PlayerView, legal: Action[]): Action | null;
  reset(): void;
}

/** Media del mazo ≈ 6,5: umbral para decidir sobre slots desconocidos. */
export const UNKNOWN_SLOT_ESTIMATE = 6.5;

export class RandomBot implements Bot {
  readonly kind = 'random' as const;
  constructor(
    readonly id: string,
    private readonly rand: () => number = Math.random,
  ) {}
  observe(): void {}
  reset(): void {}
  decide(_v: PlayerView, legal: Action[]): Action | null {
    // Nunca canta ÚLTIMA. D-009: tampoco lanza Descartes Rápidos al azar
    // (castigarse a ciegas degenera las partidas de prueba).
    const pool = legal.filter((a) => a.t !== 'CALL_ULTIMA' && a.t !== 'MATCH_ATTEMPT');
    if (pool.length === 0) return null;
    return pool[Math.floor(this.rand() * pool.length)] ?? null;
  }
}

/** Memoriza lo que ve y juega a bajar su suma. */
export class GreedyBot implements Bot {
  readonly kind = 'greedy' as const;
  private memory = new Map<number, CardValue>();

  constructor(
    readonly id: string,
    private readonly rand: () => number = Math.random,
  ) {}

  reset(): void {
    this.memory.clear();
  }

  observe(e: GameEvent): void {
    switch (e.e) {
      case 'INITIAL_PEEK_RESULT':
        if (e.to === this.id) for (const c of e.cards) this.memory.set(c.slot, c.value);
        break;
      case 'PRIVATE_REVEAL':
        if (e.to === this.id && e.player === this.id) this.memory.set(e.slot, e.value);
        break;
      case 'MATCH_OK':
        if (e.player === this.id) this.memory.delete(e.slot);
        break;
      case 'PENALTY_CARD':
        if (e.player === this.id) this.memory.delete(e.slot); // carta nueva desconocida
        break;
      case 'EFFECT_RESOLVED':
        // Un trueque sobre un slot propio invalida el recuerdo (memoria frágil).
        for (const sl of e.publicInfo.slots) if (sl.player === this.id) this.memory.delete(sl.slot);
        break;
      case 'ROUND_STARTED':
        this.memory.clear();
        break;
      default:
        break;
    }
  }

  private estimatedSum(v: PlayerView): number {
    let sum = 0;
    v.you.slots.forEach((s, i) => {
      if (s === 'empty') return;
      sum += this.memory.get(i) ?? UNKNOWN_SLOT_ESTIMATE;
    });
    return sum;
  }

  decide(v: PlayerView, legal: Action[]): Action | null {
    if (legal.length === 0) return null;
    const of = (t: Action['t']): Action[] => legal.filter((a) => a.t === t);

    // Descarte Rápido: solo sobre valores que recuerda.
    if (v.discardTop !== undefined) {
      for (const a of of('MATCH_ATTEMPT')) {
        if (a.t === 'MATCH_ATTEMPT' && this.memory.get(a.slot) === v.discardTop) return a;
      }
    }
    if (v.activePlayer !== v.you.id) return null;

    // Vislumbre inicial: elige los primeros slots.
    const peek = of('PEEK_INITIAL');
    if (peek.length > 0) {
      const best = peek
        .filter((a) => a.t === 'PEEK_INITIAL')
        .sort((a, b) =>
          a.t === 'PEEK_INITIAL' && b.t === 'PEEK_INITIAL' ? b.slots.length - a.slots.length : 0,
        )[0];
      return best ?? null;
    }

    if (v.phase === 'TURN_DRAW') {
      if (of('CALL_ULTIMA').length > 0 && this.estimatedSum(v) < 7)
        return of('CALL_ULTIMA')[0] ?? null;
      // Robar del descarte si su valor mejora algún slot conocido o desconocido.
      if (v.discardTop !== undefined && of('DRAW_DISCARD').length > 0) {
        if (this.worstSlot(v).value - v.discardTop >= 3) return of('DRAW_DISCARD')[0] ?? null;
      }
      return of('DRAW_DECK')[0] ?? of('DRAW_DISCARD')[0] ?? null;
    }

    if (v.phase === 'TURN_RESOLVE') {
      const drawn = v.drawn?.value;
      const worst = this.worstSlot(v);
      const swaps = of('SWAP_DRAWN');
      const canDiscard = of('DISCARD_DRAWN').length > 0;
      if (drawn !== undefined && swaps.length > 0 && (!canDiscard || drawn < worst.value)) {
        const chosen = swaps.find((a) => a.t === 'SWAP_DRAWN' && a.slot === worst.slot);
        const picked = chosen ?? swaps[0];
        if (picked && picked.t === 'SWAP_DRAWN') this.memory.set(picked.slot, drawn as CardValue);
        return picked ?? null;
      }
      return of('DISCARD_DRAWN')[0] ?? swaps[0] ?? null;
    }

    if (v.phase === 'EFFECT_TARGETING') {
      const targets = of('EFFECT_TARGET');
      // Prefiere mirar un slot propio desconocido.
      for (const a of targets) {
        if (
          a.t === 'EFFECT_TARGET' &&
          a.target.kind === 'PEEK' &&
          !this.memory.has(a.target.slot)
        ) {
          return a;
        }
      }
      if (targets.length > 0) return targets[Math.floor(this.rand() * targets.length)] ?? null;
      return of('EFFECT_SKIP')[0] ?? null;
    }
    return null;
  }

  /** El peor slot conocido (o el desconocido con peor estimación). */
  private worstSlot(v: PlayerView): { slot: number; value: number } {
    let best = { slot: -1, value: -1 };
    v.you.slots.forEach((s, i) => {
      if (s === 'empty') return;
      const value = this.memory.get(i) ?? UNKNOWN_SLOT_ESTIMATE;
      if (value > best.value) best = { slot: i, value };
    });
    return best.slot === -1 ? { slot: 0, value: UNKNOWN_SLOT_ESTIMATE } : best;
  }
}

export function makeBot(kind: 'random' | 'greedy', id: string, rand?: () => number): Bot {
  return kind === 'greedy' ? new GreedyBot(id, rand) : new RandomBot(id, rand);
}
