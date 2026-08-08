import { describe, expect, it } from 'vitest';
import { applyEventToView, viewFor } from './view.js';
import { buildDeck } from './deck.js';
import {
  Rnd,
  activeId,
  forceDiscardTop,
  forceSlot,
  newGame,
  playRandomGame,
  player,
  run,
  scrambleHidden,
  skipPeek,
} from './test-helpers.js';
import type { GameState } from './types.js';

const CARD_IDS = buildDeck().map((c) => c.id);
const start = () => skipPeek(newGame());

function assertNoLeak(s: GameState): void {
  for (const p of s.players) {
    const json = JSON.stringify(viewFor(s, p.id));
    for (const id of CARD_IDS) {
      expect(json.includes(`"${id}"`), `la vista de ${p.id} filtra el id ${id}`).toBe(false);
    }
  }
}

describe('I2 · cero fugas de información en la vista (docs/02 §3.6, §6)', () => {
  it('los slots solo dicen hidden/empty y nunca aparecen ids de carta', () => {
    const s = start();
    const v = viewFor(s, 'A');
    expect(v.you.slots.every((x) => x === 'hidden' || x === 'empty')).toBe(true);
    for (const o of v.others)
      expect(o.slots.every((x) => x === 'hidden' || x === 'empty')).toBe(true);
    assertNoLeak(s);
  });

  it('la vista es idéntica aunque se reetiqueten TODAS las cartas ocultas', () => {
    // Prueba dura de no-fuga: si la vista dependiera de un valor oculto, cambiaría.
    const rnd = new Rnd(1234);
    const { steps } = playRandomGame(newGame({ mode: 'quick' }, ['A', 'B', 'C'], 9), rnd, 1500);
    expect(steps.length).toBeGreaterThan(30);
    for (const step of steps) {
      for (const p of step.after.players) {
        const real = JSON.stringify(viewFor(step.after, p.id));
        const scrambled = JSON.stringify(viewFor(scrambleHidden(step.after, p.id, rnd), p.id));
        expect(scrambled, `fuga detectada en la vista de ${p.id}`).toBe(real);
      }
    }
  });

  it('ninguna vista de una partida completa contiene un id de carta', () => {
    const rnd = new Rnd(77);
    const { steps } = playRandomGame(newGame({ mode: 'quick' }, ['A', 'B'], 5), rnd, 1500);
    for (const step of steps) assertNoLeak(step.after);
  });

  it('ningún evento público lleva ids de carta', () => {
    const rnd = new Rnd(4242);
    const { steps } = playRandomGame(newGame({ mode: 'quick' }, ['A', 'B', 'C'], 31), rnd, 1500);
    for (const step of steps) {
      for (const e of step.events) {
        const json = JSON.stringify(e);
        for (const id of CARD_IDS) expect(json.includes(`"${id}"`)).toBe(false);
      }
    }
  });
});

describe('E22 · la carta robada del mazo solo la ve el ladrón', () => {
  it('drawn.value aparece en la vista del ladrón y no en la de los demás', () => {
    let s = start();
    const me = activeId(s);
    s = run(s, { t: 'DRAW_DECK', p: me }).state;
    const other = s.players.find((p) => p.id !== me)?.id as string;
    expect(viewFor(s, me).drawn?.value).toBeTypeOf('number');
    expect(viewFor(s, other).drawn?.value).toBeUndefined();
    expect(viewFor(s, other).drawn?.source).toBe('deck');
  });

  it('la robada del descarte sí es pública', () => {
    let s = start();
    const me = activeId(s);
    const top = s.discard[s.discard.length - 1]?.value;
    s = run(s, { t: 'DRAW_DISCARD', p: me }).state;
    const other = s.players.find((p) => p.id !== me)?.id as string;
    expect(viewFor(s, other).drawn?.value).toBe(top);
  });
});

describe('E18 · el snapshot de reconexión no re-muestra nada oculto', () => {
  it('la vista tras un vislumbre privado es indistinguible de la de antes', () => {
    let s = start();
    const me = activeId(s);
    const i = s.deck.findIndex((c) => c.value === 7);
    const [card] = s.deck.splice(i, 1);
    if (card) s.deck.push(card);
    s = run(s, { t: 'DRAW_DECK', p: me }, { t: 'DISCARD_DRAWN', p: me }).state;
    const r = run(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'PEEK', slot: 0 } });
    expect(r.events.some((e) => e.e === 'PRIVATE_REVEAL')).toBe(true);
    // El PRIVATE_REVEAL no persiste en la vista: lo olvidado, olvidado está.
    const snapshot = viewFor(r.state, me);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_REVEAL');
    expect(snapshot.you.slots[0]).toBe('hidden');
  });
});

describe('vista: campos derivados', () => {
  it('expone lockedForMs, sellados, contadores y el campo legal', () => {
    const s = start();
    forceSlot(s, 'B', 0, 3);
    forceDiscardTop(s, 12);
    const failed = run(s, { t: 'MATCH_ATTEMPT', p: 'B', slot: 0, tick: 1000 }).state;
    const v = viewFor(failed, 'B');
    expect(v.you.lockedForMs).toBe(5000);
    expect(v.deckCount).toBe(failed.deck.length);
    expect(v.discardTop).toBe(12);
    expect(v.legal).not.toContain('MATCH_ATTEMPT');
    expect(v.others.map((o) => o.id).sort()).toEqual(['A', 'C']);
    expect(v.tick).toBe(1000);
  });

  it('marca a los sellados y el controlador del asiento', () => {
    const s = run(start(), { t: 'FORFEIT', p: 'C' }).state;
    const mut = structuredClone(s);
    player(mut, 'B').sealed = true;
    const v = viewFor(mut, 'A');
    expect(v.others.find((o) => o.id === 'B')?.sealed).toBe(true);
    expect(v.others.find((o) => o.id === 'C')?.controller).toBe('bot');
  });

  it('la vista de un jugador inexistente no rompe', () => {
    const v = viewFor(start(), 'Z');
    expect(v.you.slots).toEqual([]);
    expect(v.legal).toEqual([]);
  });
});

describe('applyEventToView · el cliente no piensa (docs/02 §3.3)', () => {
  it('plegar los eventos de una partida mantiene slots y descarte sincronizados', () => {
    const rnd = new Rnd(2026);
    const { steps } = playRandomGame(newGame({ mode: 'quick' }, ['A', 'B', 'C'], 3), rnd, 1500);
    const pid = 'A';
    let folded = viewFor(steps[0]?.before as GameState, pid);
    for (const step of steps) {
      for (const e of step.events) {
        if ('to' in e && e.to !== pid) continue; // privado de otro
        folded = applyEventToView(folded, e);
      }
      const real = viewFor(step.after, pid);
      if (real.phase === 'TURN_DRAW' || real.phase === 'TURN_RESOLVE') {
        expect(folded.you.slots).toEqual(real.you.slots);
        // discardTop puede quedar «desconocida» tras un DRAW_DISCARD (D-008):
        // el servidor la corrige con un snapshot.
        if (folded.discardTop !== undefined) expect(folded.discardTop).toBe(real.discardTop);
        expect(folded.activePlayer).toBe(real.activePlayer);
      }
    }
  });

  it('plegar nunca muta la vista de entrada', () => {
    const v = viewFor(start(), 'A');
    const copy = JSON.stringify(v);
    applyEventToView(v, { e: 'MATCH_OK', player: 'A', slot: 0, value: 3 });
    expect(JSON.stringify(v)).toBe(copy);
  });

  it('cubre los eventos estructurales', () => {
    let v = viewFor(start(), 'A');
    v = applyEventToView(v, { e: 'ULTIMA_CALLED', player: 'B' });
    expect(v.others.find((o) => o.id === 'B')?.sealed).toBe(true);
    v = applyEventToView(v, { e: 'MATCH_OK', player: 'A', slot: 1, value: 4 });
    expect(v.you.slots[1]).toBe('empty');
    v = applyEventToView(v, { e: 'PENALTY_CARD', player: 'A', slot: 1 });
    expect(v.you.slots[1]).toBe('hidden');
    v = applyEventToView(v, { e: 'PENALTY_CARD', player: 'A', slot: 4 });
    expect(v.you.slots).toHaveLength(5);
    v = applyEventToView(v, { e: 'DECK_RESHUFFLED', deckCount: 20 });
    expect(v.deckCount).toBe(20);
    v = applyEventToView(v, { e: 'DREW', player: 'A', source: 'deck' });
    expect(v.drawn?.source).toBe('deck');
    v = applyEventToView(v, { e: 'DREW_VALUE', to: 'A', value: 6 });
    expect(v.drawn?.value).toBe(6);
    v = applyEventToView(v, { e: 'SWAPPED_DRAWN', player: 'A', slot: 0, discardedValue: 6 });
    expect(v.discardTop).toBe(6);
    v = applyEventToView(v, { e: 'EFFECT_PENDING', player: 'A', effect: 'PEEK', deadlineTick: 9 });
    expect(v.phase).toBe('EFFECT_TARGETING');
    v = applyEventToView(v, {
      e: 'EFFECT_RESOLVED',
      player: 'A',
      effect: 'PEEK',
      publicInfo: { slots: [] },
    });
    expect(v.timers).toEqual([]);
    v = applyEventToView(v, { e: 'ROUND_REVEAL', hands: {} });
    expect(v.phase).toBe('ROUND_REVEAL');
    v = applyEventToView(v, { e: 'ROUND_SCORED', scores: { A: { round: 3, total: 3 } } });
    expect(v.scores['A']).toEqual({ round: 3, total: 3 });
    v = applyEventToView(v, { e: 'PLAYER_SEAT', player: 'B', controller: 'bot' });
    expect(v.others.find((o) => o.id === 'B')?.controller).toBe('bot');
    v = applyEventToView(v, {
      e: 'ROUND_STARTED',
      order: ['A', 'B', 'C'],
      discardTop: 2,
      startingPlayer: 'B',
    });
    expect(v.phase).toBe('INITIAL_PEEK');
    expect(v.discardTop).toBe(2);
    v = applyEventToView(v, { e: 'TURN_STARTED', player: 'C', orbit: 2, deadlineTick: 100 });
    expect(v.activePlayer).toBe('C');
    v = applyEventToView(v, { e: 'MATCH_FAIL', player: 'B', slot: 0, value: 1, penalty: 'card' });
    v = applyEventToView(v, { e: 'MATCH_REJECTED', player: 'B', reason: 'window' });
    v = applyEventToView(v, { e: 'INITIAL_PEEK_RESULT', to: 'A', cards: [] });
    v = applyEventToView(v, {
      e: 'PRIVATE_REVEAL',
      to: 'A',
      player: 'A',
      slot: 0,
      value: 1,
      ttlMs: 3000,
    });
    v = applyEventToView(v, { e: 'EFFECT_SKIPPED', player: 'A', reason: 'chosen' });
    v = applyEventToView(v, { e: 'GAME_ENDED', winner: 'A', totals: { A: 1 } });
    expect(v.phase).toBe('GAME_END');
    expect(v.legal).toEqual([]);
  });
});
