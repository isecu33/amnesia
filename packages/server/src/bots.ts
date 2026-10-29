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

/** Un tótem recordado con este valor o más se intenta endosar en un trueque. */
export const BAD_TOTEM_VALUE = 8;

/** Efectos que mueven tótems (EFFECT_RESOLVED.effect). */
const TRADE_EFFECTS: readonly string[] = ['SWAP', 'RUMBLE', 'SEER_SWAP'];

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
  /** La carrera de la carta superior ya no admite aciertos (#16): no insistir. */
  private topLocked = false;

  constructor(
    readonly id: string,
    private readonly rand: () => number = Math.random,
  ) {}

  reset(): void {
    this.memory.clear();
    this.topLocked = false;
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
        this.topLocked = true; // el acertado no es casable (#16)
        if ((e.owner ?? e.player) === this.id) this.memory.delete(e.slot);
        break;
      case 'WILD_GIFT':
        if (e.from === this.id) this.memory.delete(e.fromSlot);
        if (e.to === this.id) this.memory.delete(e.toSlot); // regalo desconocido
        break;
      case 'MATCH_REJECTED':
        if (e.player === this.id) this.topLocked = true; // no insistir sobre la misma carta
        break;
      case 'DISCARDED_DRAWN':
      case 'SWAPPED_DRAWN':
      case 'DOUBLE_DRAW_REJECTED':
        this.topLocked = false; // carrera nueva
        break;
      case 'DREW':
        if (e.source === 'discard') this.topLocked = true; // la expuesta no abre carrera
        break;
      case 'PENALTY_CARD':
        if (e.player === this.id) this.memory.delete(e.slot); // carta nueva desconocida
        break;
      case 'EFFECT_RESOLVED':
        // Un trueque sobre un slot propio invalida el recuerdo (memoria frágil);
        // las miradas, en cambio, ya fijaron el recuerdo con su PRIVATE_REVEAL.
        if (TRADE_EFFECTS.includes(e.effect)) {
          for (const sl of e.publicInfo.slots) {
            if (sl.player === this.id) this.memory.delete(sl.slot);
          }
        }
        break;
      case 'ROUND_STARTED':
        this.memory.clear();
        this.topLocked = false;
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

    // Descarte Rápido (incluye robar efectos en la ventana): solo sobre valores que
    // recuerda, sobre tótems propios, y nunca si la carrera ya está cerrada (#16).
    if (v.discardTop !== undefined && !this.topLocked) {
      for (const a of of('MATCH_ATTEMPT')) {
        if (
          a.t === 'MATCH_ATTEMPT' &&
          a.owner === undefined &&
          this.memory.get(a.slot) === v.discardTop
        ) {
          return a;
        }
      }
    }

    // El efecto (propio o robado) lo resuelve su dueño aunque no sea el jugador activo.
    if (v.phase === 'EFFECT_TARGETING' && of('EFFECT_SKIP').length > 0)
      return this.pickEffect(v, legal);
    if (v.activePlayer !== v.you.id) return null;

    // Doble Robo: se queda con la carta más baja.
    if (v.drawnChoice) {
      const idx =
        v.drawnChoice[0] !== undefined && (v.drawnChoice[1] ?? 99) < v.drawnChoice[0] ? 1 : 0;
      return (
        of('DOUBLE_DRAW_KEEP').find((a) => a.t === 'DOUBLE_DRAW_KEEP' && a.index === idx) ?? null
      );
    }

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

    return null;
  }

  /**
   * Efectos (propios o robados): mira lo que no recuerda y solo truequea para
   * deshacerse de un tótem malo que conoce; si no, «Pasar».
   */
  private pickEffect(_v: PlayerView, legal: Action[]): Action | null {
    const targets = legal.filter(
      (a): a is Extract<Action, { t: 'EFFECT_TARGET' }> => a.t === 'EFFECT_TARGET',
    );
    const skip = legal.find((a) => a.t === 'EFFECT_SKIP') ?? null;
    const pick = <T>(xs: T[]): T | null => xs[Math.floor(this.rand() * xs.length)] ?? null;
    const unknown = (slot: number): boolean => !this.memory.has(slot);
    const bad = (slot: number): boolean => (this.memory.get(slot) ?? 0) >= BAD_TOTEM_VALUE;

    const ownLook = targets.filter((a) => {
      const t = a.target;
      if (t.kind === 'PEEK') return unknown(t.slot);
      if (t.kind === 'SHARED_EYE') return unknown(t.ownSlot);
      if (t.kind === 'SEER_LOOK') return t.player === this.id && unknown(t.slot);
      return false;
    });
    const look = pick(ownLook);
    if (look) return look;

    const rivalLook = pick(
      targets.filter((a) => a.target.kind === 'SPY' || a.target.kind === 'SEER_LOOK'),
    );
    if (rivalLook) return rivalLook;

    const swaps = targets.filter((a) => {
      const t = a.target;
      if (t.kind === 'SWAP' || t.kind === 'SEER_SWAP') return bad(t.ownSlot);
      if (t.kind === 'RUMBLE') {
        return (
          (t.a.player === this.id && bad(t.a.slot)) || (t.b.player === this.id && bad(t.b.slot))
        );
      }
      return false;
    });
    return pick(swaps) ?? skip ?? pick(targets);
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
