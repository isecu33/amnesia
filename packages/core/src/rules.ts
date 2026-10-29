/** Predicados compartidos por engine.ts, legal.ts y view.ts. Todos puros. */
import type { Card, EffectTarget, GameState, PlayerCore, SlotRef } from './types.js';

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
  return s.phase === 'TURN_DRAW' || s.phase === 'TURN_RESOLVE' || s.phase === 'STEAL_WINDOW';
}

export function isMatchLocked(s: GameState, p: PlayerCore, atTick: number): boolean {
  return p.matchLockedUntilTick !== undefined && atTick < p.matchLockedUntilTick;
}

/** Rivales no sellados (E10/E12): los únicos que pueden ser objetivo. */
export function targetableRivals(s: GameState, ownerId: string): PlayerCore[] {
  return s.players.filter((r) => r.id !== ownerId && !r.sealed);
}

/** Casillas ocupadas de todos los altares no sellados, propio incluido. */
function allCells(s: GameState): SlotRef[] {
  const out: SlotRef[] = [];
  for (const p of s.players) {
    if (p.sealed) continue;
    for (const slot of occupiedSlotIndexes(p)) out.push({ player: p.id, slot });
  }
  return out;
}

function pairsOwnRival(
  s: GameState,
  ownerId: string,
): { ownSlot: number; player: string; theirSlot: number }[] {
  const owner = playerOf(s, ownerId);
  if (!owner) return [];
  const out: { ownSlot: number; player: string; theirSlot: number }[] = [];
  for (const ownSlot of occupiedSlotIndexes(owner)) {
    for (const r of targetableRivals(s, ownerId)) {
      for (const theirSlot of occupiedSlotIndexes(r))
        out.push({ ownSlot, player: r.id, theirSlot });
    }
  }
  return out;
}

/** Objetivos válidos del efecto pendiente (docs/01 §5, #13; E8, E10, E11, E12). */
export function validEffectTargets(s: GameState, ownerId: string): EffectTarget[] {
  const owner = playerOf(s, ownerId);
  if (!owner || !s.pendingEffect) return [];
  const out: EffectTarget[] = [];
  switch (s.pendingEffect) {
    case 'PEEK':
      for (const slot of occupiedSlotIndexes(owner)) out.push({ kind: 'PEEK', slot });
      return out;
    case 'SPY':
      for (const r of targetableRivals(s, ownerId)) {
        for (const slot of occupiedSlotIndexes(r)) out.push({ kind: 'SPY', player: r.id, slot });
      }
      return out;
    case 'SWAP':
      return pairsOwnRival(s, ownerId).map((p) => ({ kind: 'SWAP', ...p }));
    case 'SHARED_EYE':
      return pairsOwnRival(s, ownerId).map((p) => ({ kind: 'SHARED_EYE', ...p }));
    case 'RUMBLE': {
      const cells = allCells(s);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i] as SlotRef;
          const b = cells[j] as SlotRef;
          if (a.player === ownerId && b.player === ownerId) continue; // E11
          out.push({ kind: 'RUMBLE', a, b });
        }
      }
      return out;
    }
    case 'DOUBLE_DRAW':
      return out; // diferido: no abre fase de selección
    case 'SEER':
      if (s.effectStep === 2) {
        return pairsOwnRival(s, ownerId).map((p) => ({ kind: 'SEER_SWAP', ...p }));
      }
      return allCells(s).map((c) => ({ kind: 'SEER_LOOK', player: c.player, slot: c.slot }));
  }
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
