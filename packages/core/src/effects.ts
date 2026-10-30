/**
 * Resolución de objetivos de efecto — docs/01 §5 y #13. Puro: muta solo el
 * clon de estado que recibe y empuja eventos; el flujo de turno vive en engine.ts.
 */
import { secondsToTicks } from './config.js';
import {
  occupiedSlotIndexes,
  playerOf,
  slotCard,
  targetableRivals,
  validEffectTargets,
} from './rules.js';
import type { Fail } from './fail.js';
import { ERR } from './fail.js';
import type {
  EffectKind,
  EffectTarget,
  GameEvent,
  GameState,
  PlayerCore,
  SlotRef,
} from './types.js';

/** Ojo Compartido se reduce si falta rival (→ Vislumbre) o slot propio (→ Espionaje). */
export function reduceEffect(s: GameState, ownerId: string, effect: EffectKind): EffectKind {
  if (effect !== 'SHARED_EYE') return effect;
  const owner = playerOf(s, ownerId);
  const rivalHasSlots = targetableRivals(s, ownerId).some((r) => occupiedSlotIndexes(r).length > 0);
  if (!rivalHasSlots) return 'PEEK';
  if (!owner || occupiedSlotIndexes(owner).length === 0) return 'SPY';
  return effect;
}

export type TargetOutcome = Fail | 'DONE' | 'STEP2';

interface Ctx {
  s: GameState;
  ev: GameEvent[];
  pid: string;
  owner: PlayerCore;
  ttlMs: number;
}

function rival(c: Ctx, id: string): PlayerCore | Fail {
  if (id === c.pid) return ERR('SWAP_SELF');
  const r = playerOf(c.s, id);
  if (!r) return ERR('NO_SUCH_PLAYER');
  if (r.sealed) return ERR('TARGET_SEALED'); // E10/E12
  return r;
}
const bad = (v: PlayerCore | Fail): v is Fail => v === null || !('id' in (v as object));

function reveal(c: Ctx, player: string, slot: number, value: number): void {
  c.ev.push({
    e: 'PRIVATE_REVEAL',
    to: c.pid,
    player,
    slot,
    value: value as never,
    ttlMs: c.ttlMs,
  });
}

function resolved(c: Ctx, effect: string, slots: SlotRef[]): void {
  c.ev.push({ e: 'EFFECT_RESOLVED', player: c.pid, effect, publicInfo: { slots } });
}

function swapCells(c: Ctx, a: SlotRef, b: SlotRef): Fail {
  const pa = playerOf(c.s, a.player);
  const pb = playerOf(c.s, b.player);
  if (!pa || !pb) return ERR('NO_SUCH_PLAYER');
  if (pa.sealed || pb.sealed) return ERR('TARGET_SEALED');
  const ca = slotCard(pa, a.slot);
  const cb = slotCard(pb, b.slot);
  if (!ca || !cb) return ERR('BAD_SLOT');
  if (a.player === b.player && a.slot === b.slot) return ERR('SAME_SLOT');
  pa.slots[a.slot] = cb;
  pb.slots[b.slot] = ca;
  return null;
}

function seerStep2Available(s: GameState, pid: string): boolean {
  const saved = s.effectStep;
  s.effectStep = 2;
  const any = validEffectTargets(s, pid).length > 0;
  if (saved === undefined) delete s.effectStep;
  else s.effectStep = saved;
  return any;
}

export function resolveTarget(
  s: GameState,
  ev: GameEvent[],
  pid: string,
  target: EffectTarget,
): TargetOutcome {
  const owner = playerOf(s, pid) as PlayerCore;
  const c: Ctx = { s, ev, pid, owner, ttlMs: secondsToTicks(s.config.privateRevealSeconds) };
  const expected =
    s.pendingEffect === 'SEER' ? (s.effectStep === 2 ? 'SEER_SWAP' : 'SEER_LOOK') : s.pendingEffect;
  if (!target || target.kind !== expected) return ERR('WRONG_EFFECT_KIND');

  switch (target.kind) {
    case 'PEEK': {
      const card = slotCard(owner, target.slot);
      if (!card) return ERR('BAD_SLOT');
      reveal(c, pid, target.slot, card.value);
      resolved(c, 'PEEK', [{ player: pid, slot: target.slot }]);
      return 'DONE';
    }
    case 'SPY': {
      if (target.player === pid) return ERR('SPY_SELF');
      const r = rival(c, target.player);
      if (bad(r)) return r;
      const card = slotCard(r, target.slot);
      if (!card) return ERR('BAD_SLOT');
      reveal(c, r.id, target.slot, card.value);
      resolved(c, 'SPY', [{ player: r.id, slot: target.slot }]);
      return 'DONE';
    }
    case 'SWAP':
    case 'SEER_SWAP': {
      const r = rival(c, target.player);
      if (bad(r)) return r;
      const err = swapCells(
        c,
        { player: pid, slot: target.ownSlot },
        { player: r.id, slot: target.theirSlot },
      );
      if (err) return err;
      resolved(c, target.kind, [
        { player: pid, slot: target.ownSlot },
        { player: r.id, slot: target.theirSlot },
      ]);
      return 'DONE';
    }
    case 'SHARED_EYE': {
      const r = rival(c, target.player);
      if (bad(r)) return r;
      const mine = slotCard(owner, target.ownSlot);
      const theirs = slotCard(r, target.theirSlot);
      if (!mine || !theirs) return ERR('BAD_SLOT');
      reveal(c, pid, target.ownSlot, mine.value);
      reveal(c, r.id, target.theirSlot, theirs.value);
      resolved(c, 'SHARED_EYE', [
        { player: pid, slot: target.ownSlot },
        { player: r.id, slot: target.theirSlot },
      ]);
      return 'DONE';
    }
    case 'RUMBLE': {
      if (target.a.player === pid && target.b.player === pid) return ERR('SWAP_SELF'); // E11
      const err = swapCells(c, target.a, target.b);
      if (err) return err;
      resolved(c, 'RUMBLE', [target.a, target.b]);
      return 'DONE';
    }
    case 'SEER_LOOK': {
      const p = target.player === pid ? owner : rival(c, target.player);
      if (bad(p)) return p;
      const card = slotCard(p, target.slot);
      if (!card) return ERR('BAD_SLOT');
      reveal(c, p.id, target.slot, card.value);
      resolved(c, 'SEER_LOOK', [{ player: p.id, slot: target.slot }]);
      if (!seerStep2Available(s, pid)) return 'DONE';
      s.effectStep = 2;
      const deadlineTick = s.tick + secondsToTicks(s.config.effectTargetSeconds);
      s.timers = [{ kind: 'effect', deadlineTick }];
      ev.push({ e: 'EFFECT_PENDING', player: pid, effect: 'SEER', deadlineTick, step: 2 });
      return 'STEP2';
    }
  }
}
