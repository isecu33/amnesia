/** Predicados compartidos por engine.ts, legal.ts y view.ts. Todos puros. */
import type { Card, EffectTarget, GameState, PlayerCore } from './types.js';

export function playerOf(s: GameState, id: string): PlayerCore | undefined {
  return s.players.find((p) => p.id === id);
}

export function activePlayer(s: GameState): PlayerCore | undefined {
  return s.players[s.activeIdx];
}

export function occupiedSlotIndexes(p: PlayerCore): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.slots.length; i++) if (p.slots[i]) out.push(i);
  return out;
}

export function slotCard(p: PlayerCore, slot: number): Card | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.slots.length) return undefined;
  return p.slots[slot] ?? undefined;
}

export function discardTopCard(s: GameState): Card | undefined {
  return s.discard[s.discard.length - 1];
}

/** Primer slot libre; -1 si la mano está llena (E13). */
export function firstFreeSlot(p: PlayerCore, maxSlots: number): number {
  for (let i = 0; i < p.slots.length; i++) if (p.slots[i] === null) return i;
  return p.slots.length < maxSlots ? p.slots.length : -1;
}

/** E3: robar del mazo es ilegal si está vacío y no queda descarte rebarajable. */
export function canDrawDeck(s: GameState): boolean {
  if (s.deck.length > 0) return true;
  if (s.reshuffles === 0) return s.discard.length > 1;
  return true; // 2º agotamiento: acción legal cuyo efecto es terminar la ronda
}

/** El Descarte Rápido solo está abierto en TURN_DRAW y TURN_RESOLVE (docs/01 §6, E20). */
export function matchWindowOpen(s: GameState): boolean {
  return s.phase === 'TURN_DRAW' || s.phase === 'TURN_RESOLVE';
}

export function isMatchLocked(s: GameState, p: PlayerCore, atTick: number): boolean {
  return p.matchLockedUntilTick !== undefined && atTick < p.matchLockedUntilTick;
}

/** Objetivos válidos del efecto pendiente (docs/01 §5; E10, E11, E12). */
export function validEffectTargets(s: GameState, ownerId: string): EffectTarget[] {
  const owner = playerOf(s, ownerId);
  if (!owner || !s.pendingEffect) return [];
  const out: EffectTarget[] = [];
  if (s.pendingEffect === 'PEEK') {
    for (const slot of occupiedSlotIndexes(owner)) out.push({ kind: 'PEEK', slot });
    return out;
  }
  const rivals = s.players.filter((r) => r.id !== ownerId && !r.sealed);
  if (s.pendingEffect === 'SPY') {
    for (const r of rivals) {
      for (const slot of occupiedSlotIndexes(r)) out.push({ kind: 'SPY', player: r.id, slot });
    }
    return out;
  }
  // SWAP
  for (const ownSlot of occupiedSlotIndexes(owner)) {
    for (const r of rivals) {
      for (const theirSlot of occupiedSlotIndexes(r)) {
        out.push({ kind: 'SWAP', ownSlot, player: r.id, theirSlot });
      }
    }
  }
  return out;
}

/** Subconjuntos de tamaño 1..k, en orden determinista. */
export function subsetsUpTo(items: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number): void => {
    if (cur.length > 0) out.push(cur.slice());
    if (cur.length === k) return;
    for (let i = start; i < items.length; i++) {
      cur.push(items[i] as number);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}
