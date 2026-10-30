/** #13 — Ojo Compartido (10), Revuelo (12), Trueque Vidente (13) y «Pasar» (E33–E35). */
import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import { validEffectTargets } from './rules.js';
import { openEffectWith, player, run, totalCards, withDrawnValue } from './test-helpers.js';
import type { CardValue, GameState } from './types.js';

const rivalOf = (s: GameState, me: string): string =>
  s.players.find((p) => p.id !== me)?.id as string;

/** Estado con la carta ya en mano, mutado, y luego descartada (ventana de robo vencida). */
function discardAfter(
  value: CardValue,
  mutate: (s: GameState, me: string) => void,
  ids: string[] = ['A', 'B', 'C'],
): { s: GameState; me: string; events: ReturnType<typeof run>['events'] } {
  const w = withDrawnValue(value, ids);
  const s = structuredClone(w.s);
  mutate(s, w.me);
  let r = run(s, { t: 'DISCARD_DRAWN', p: w.me });
  if ((r.state.phase as string) === 'STEAL_WINDOW') {
    const t = run(r.state, { t: 'TIMER_FIRED', timer: 'steal' as never });
    r = { state: t.state, events: [...r.events, ...t.events] };
  }
  return { s: r.state, me: w.me, events: r.events };
}

describe('Ojo Compartido (10)', () => {
  it('revela en privado un slot propio y uno rival; público solo los slots', () => {
    const { s, me } = openEffectWith(10);
    expect(s.pendingEffect).toBe('SHARED_EYE');
    const rv = rivalOf(s, me);
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SHARED_EYE', ownSlot: 1, player: rv, theirSlot: 2 },
    });
    const reveals = r.events.filter((e) => e.e === 'PRIVATE_REVEAL');
    expect(reveals).toHaveLength(2);
    expect(reveals[0]).toMatchObject({ to: me, player: me, slot: 1 });
    expect(reveals[1]).toMatchObject({ to: me, player: rv, slot: 2 });
    const pub = r.events.find((e) => e.e === 'EFFECT_RESOLVED');
    expect(JSON.stringify(pub)).not.toContain('"value"');
    expect(r.state.phase).toBe('TURN_DRAW');
  });

  it('hay que elegir los dos: un objetivo de otro tipo se rechaza', () => {
    const { s, me } = openEffectWith(10);
    expect(
      apply(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'PEEK', slot: 0 } }),
    ).toMatchObject({ error: { code: 'WRONG_EFFECT_KIND' } });
  });

  it('sin rival válido se reduce a Vislumbre', () => {
    const { s } = discardAfter(10, (st, me) => {
      for (const p of st.players) if (p.id !== me) p.sealed = true;
    });
    expect(s.pendingEffect).toBe('PEEK');
  });

  it('sin slot propio se reduce a Espionaje', () => {
    const { s } = discardAfter(10, (st, me) => {
      const p = player(st, me);
      for (let i = 0; i < p.slots.length; i++) {
        const c = p.slots[i];
        if (c) st.deck.push(c);
        p.slots[i] = null;
      }
    });
    expect(s.pendingEffect).toBe('SPY');
  });

  it('el sellado no es objetivo (E10)', () => {
    const { s, me } = openEffectWith(10);
    const rv = rivalOf(s, me);
    const sealed = structuredClone(s);
    player(sealed, rv).sealed = true;
    expect(
      apply(sealed, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'SHARED_EYE', ownSlot: 0, player: rv, theirSlot: 0 },
      }),
    ).toMatchObject({ error: { code: 'TARGET_SEALED' } });
  });
});

describe('Revuelo (12)', () => {
  it('permite propio↔rival', () => {
    const { s, me } = openEffectWith(12);
    const rv = rivalOf(s, me);
    const mine = player(s, me).slots[0]?.value;
    const theirs = player(s, rv).slots[1]?.value;
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'RUMBLE', a: { player: me, slot: 0 }, b: { player: rv, slot: 1 } },
    });
    expect(player(r.state, me).slots[0]?.value).toBe(theirs);
    expect(player(r.state, rv).slots[1]?.value).toBe(mine);
    expect(r.events.some((e) => e.e === 'PRIVATE_REVEAL')).toBe(false);
    expect(totalCards(r.state)).toBe(52);
  });

  it('permite rival↔otro rival', () => {
    const { s, me } = openEffectWith(12);
    const [r1, r2] = s.players.filter((p) => p.id !== me).map((p) => p.id) as [string, string];
    const v1 = player(s, r1).slots[0]?.value;
    const v2 = player(s, r2).slots[3]?.value;
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'RUMBLE', a: { player: r1, slot: 0 }, b: { player: r2, slot: 3 } },
    });
    expect(player(r.state, r1).slots[0]?.value).toBe(v2);
    expect(player(r.state, r2).slots[3]?.value).toBe(v1);
  });

  it('permite dos slots del mismo rival', () => {
    const { s, me } = openEffectWith(12);
    const rv = rivalOf(s, me);
    const v0 = player(s, rv).slots[0]?.value;
    const v1 = player(s, rv).slots[1]?.value;
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'RUMBLE', a: { player: rv, slot: 0 }, b: { player: rv, slot: 1 } },
    });
    expect(player(r.state, rv).slots[0]?.value).toBe(v1);
    expect(player(r.state, rv).slots[1]?.value).toBe(v0);
  });

  it('E11: dos slots propios es ilegal y no se ofrece', () => {
    const { s, me } = openEffectWith(12);
    expect(
      apply(s, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'RUMBLE', a: { player: me, slot: 0 }, b: { player: me, slot: 1 } },
      }),
    ).toMatchObject({ error: { code: 'SWAP_SELF' } });
    for (const t of validEffectTargets(s, me)) {
      if (t.kind === 'RUMBLE') expect(t.a.player === me && t.b.player === me).toBe(false);
    }
  });

  it('el mismo slot dos veces es ilegal', () => {
    const { s, me } = openEffectWith(12);
    const rv = rivalOf(s, me);
    expect(
      apply(s, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'RUMBLE', a: { player: rv, slot: 0 }, b: { player: rv, slot: 0 } },
      }),
    ).toMatchObject({ error: { code: 'SAME_SLOT' } });
  });

  it('los sellados no participan (E10)', () => {
    const { s, me } = openEffectWith(12);
    const rv = rivalOf(s, me);
    const sealed = structuredClone(s);
    player(sealed, rv).sealed = true;
    expect(
      apply(sealed, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'RUMBLE', a: { player: me, slot: 0 }, b: { player: rv, slot: 0 } },
      }),
    ).toMatchObject({ error: { code: 'TARGET_SEALED' } });
  });

  it('E33: un único altar rival con ≥2 slots es válido', () => {
    const { s, me } = discardAfter(12, (st, m) => {
      for (const p of st.players) if (p.id !== m && p.id !== 'B') p.sealed = true;
    });
    expect(s.phase).toBe('EFFECT_TARGETING');
    expect(
      validEffectTargets(s, me).some(
        (t) => t.kind === 'RUMBLE' && t.a.player === 'B' && t.b.player === 'B',
      ),
    ).toBe(true);
  });

  it('E33: con menos de 2 casillas válidas o solo propias → E8', () => {
    const { s, events } = discardAfter(12, (st, me) => {
      for (const p of st.players) if (p.id !== me) p.sealed = true;
    });
    expect(events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'noTargets')).toBe(true);
    expect(s.phase).toBe('TURN_DRAW');
  });
});

describe('Trueque Vidente (13)', () => {
  it('paso 1 mira un tótem rival; paso 2 trueque libre (no el mirado)', () => {
    const { s, me } = openEffectWith(13);
    expect(s.pendingEffect).toBe('SEER');
    expect(s.effectStep).toBe(1);
    const rv = rivalOf(s, me);
    const look = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: rv, slot: 0 },
    });
    expect(look.events.find((e) => e.e === 'PRIVATE_REVEAL')).toMatchObject({
      to: me,
      player: rv,
      slot: 0,
      value: player(s, rv).slots[0]?.value,
    });
    expect(look.state.phase).toBe('EFFECT_TARGETING');
    expect(look.state.effectStep).toBe(2);
    expect(look.events.find((e) => e.e === 'EFFECT_PENDING')).toMatchObject({ step: 2 });
    expect(look.state.timers).toHaveLength(1);

    const mine = player(look.state, me).slots[2]?.value;
    const theirs = player(look.state, rv).slots[3]?.value;
    const swap = run(look.state, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_SWAP', ownSlot: 2, player: rv, theirSlot: 3 },
    });
    expect(player(swap.state, me).slots[2]?.value).toBe(theirs);
    expect(player(swap.state, rv).slots[3]?.value).toBe(mine);
    expect(swap.state.phase).toBe('TURN_DRAW');
    expect(swap.state.effectStep).toBeUndefined();
  });

  it('el paso 2 es opcional: Pasar = sin trueque', () => {
    const { s, me } = openEffectWith(13);
    const rv = rivalOf(s, me);
    const look = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: rv, slot: 0 },
    });
    expect(legalActions(look.state, me).map((a) => a.t)).toContain('EFFECT_SKIP');
    const r = run(look.state, { t: 'EFFECT_SKIP', p: me });
    expect(r.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'chosen')).toBe(true);
    expect(r.state.phase).toBe('TURN_DRAW');
  });

  it('dos relojes: si expira el 1.º se pierde todo; si expira el 2.º no hay trueque', () => {
    const { s, me } = openEffectWith(13);
    const t1 = run(s, { t: 'TIMER_FIRED', timer: 'effect' });
    expect(t1.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'timeout')).toBe(true);
    expect(t1.state.phase).toBe('TURN_DRAW');

    const rv = rivalOf(s, me);
    const look = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: rv, slot: 0 },
    });
    const t2 = run(look.state, { t: 'TIMER_FIRED', timer: 'effect' });
    expect(t2.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'timeout')).toBe(true);
    expect(t2.state.phase).toBe('TURN_DRAW');
  });

  it('puede mirar un tótem propio y luego truecar otro', () => {
    const { s, me } = openEffectWith(13);
    const look = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: me, slot: 1 },
    });
    expect(look.state.effectStep).toBe(2);
  });

  it('E34: sin rival válido solo se resuelve el paso 1, mirando uno propio', () => {
    const { s, me } = discardAfter(13, (st, m) => {
      for (const p of st.players) if (p.id !== m) p.sealed = true;
    });
    expect(validEffectTargets(s, me).every((t) => t.kind === 'SEER_LOOK' && t.player === me)).toBe(
      true,
    );
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: me, slot: 0 },
    });
    expect(r.state.phase).toBe('TURN_DRAW');
    expect(r.state.effectStep).toBeUndefined();
  });

  it('E35: el Descarte Rápido sigue cerrado en los dos pasos', () => {
    const { s, me } = openEffectWith(13);
    const rv = rivalOf(s, me);
    const a1 = run(s, { t: 'MATCH_ATTEMPT', p: rv, slot: 0, tick: s.tick + 10 });
    expect(a1.events[0]).toMatchObject({ e: 'MATCH_REJECTED', reason: 'window' });
    const look = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SEER_LOOK', player: rv, slot: 0 },
    });
    const a2 = run(look.state, { t: 'MATCH_ATTEMPT', p: rv, slot: 0, tick: look.state.tick + 10 });
    expect(a2.events[0]).toMatchObject({ e: 'MATCH_REJECTED', reason: 'window' });
  });

  it('un objetivo del paso equivocado se rechaza', () => {
    const { s, me } = openEffectWith(13);
    const rv = rivalOf(s, me);
    expect(
      apply(s, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'SEER_SWAP', ownSlot: 0, player: rv, theirSlot: 0 },
      }),
    ).toMatchObject({ error: { code: 'WRONG_EFFECT_KIND' } });
  });
});

describe('«Pasar» en todos los efectos', () => {
  it.each([7, 9, 10, 11, 12, 13] as const)('el %i admite EFFECT_SKIP', (v) => {
    const { s, me } = openEffectWith(v);
    expect(legalActions(s, me).map((a) => a.t)).toContain('EFFECT_SKIP');
    const r = run(s, { t: 'EFFECT_SKIP', p: me });
    expect(r.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'chosen')).toBe(true);
  });
});
