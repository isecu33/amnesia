import { describe, expect, it } from 'vitest';
import { apply } from './engine.js';
import { legalActions } from './legal.js';
import { validEffectTargets } from './rules.js';
import { activeId, forceSlot, newGame, player, run, skipPeek, totalCards } from './test-helpers.js';
import type { CardValue, GameState } from './types.js';

/** Prepara: `me` es el activo y tiene en mano una carta del valor pedido, ya robada. */
function withDrawn(value: CardValue, ids = ['A', 'B', 'C']): { s: GameState; me: string } {
  let s = skipPeek(newGame({}, ids));
  const me = activeId(s);
  const i = s.deck.findIndex((c) => c.value === value);
  const [card] = s.deck.splice(i, 1);
  if (card) s.deck.push(card);
  s = run(s, { t: 'DRAW_DECK', p: me }).state;
  return { s, me };
}

/** Deja el efecto abierto (fase EFFECT_TARGETING). */
function openEffect(value: CardValue): { s: GameState; me: string } {
  const { s, me } = withDrawn(value);
  return { s: run(s, { t: 'DISCARD_DRAWN', p: me }).state, me };
}

describe('Vislumbre (7/8) — docs/01 §5', () => {
  it('abre targeting, revela en privado y hace público solo el slot', () => {
    const { s, me } = openEffect(7);
    expect(s.phase).toBe('EFFECT_TARGETING');
    expect(s.pendingEffect).toBe('PEEK');
    expect(s.timers[0]?.kind).toBe('effect');

    const value = player(s, me).slots[2]?.value;
    const r = run(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'PEEK', slot: 2 } });
    const priv = r.events.find((e) => e.e === 'PRIVATE_REVEAL');
    expect(priv).toMatchObject({ to: me, player: me, slot: 2, value, ttlMs: 3000 });
    const pub = r.events.find((e) => e.e === 'EFFECT_RESOLVED');
    expect(pub).toMatchObject({ effect: 'PEEK', publicInfo: { slots: [{ player: me, slot: 2 }] } });
    expect(JSON.stringify(pub)).not.toContain(`"value"`);
    expect(r.state.phase).toBe('TURN_DRAW');
  });
});

describe('Espionaje (9/10) — docs/01 §5', () => {
  it('revela en privado el tótem de un rival y publica solo el slot', () => {
    const { s, me } = openEffect(9);
    expect(s.pendingEffect).toBe('SPY');
    const rival = s.players.find((p) => p.id !== me)?.id as string;
    const value = player(s, rival).slots[1]?.value;
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SPY', player: rival, slot: 1 },
    });
    expect(r.events.find((e) => e.e === 'PRIVATE_REVEAL')).toMatchObject({
      to: me,
      player: rival,
      slot: 1,
      value,
    });
    expect(r.events.find((e) => e.e === 'EFFECT_RESOLVED')).toMatchObject({ effect: 'SPY' });
  });

  it('espiarse a uno mismo es ilegal', () => {
    const { s, me } = openEffect(9);
    expect(
      apply(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'SPY', player: me, slot: 0 } }),
    ).toMatchObject({ error: { code: 'SPY_SELF' } });
  });
});

describe('Trueque Ciego (11/12) — docs/01 §5', () => {
  it('intercambia los dos tótems sin revelar ningún valor', () => {
    const { s, me } = openEffect(11);
    expect(s.pendingEffect).toBe('SWAP');
    const rival = s.players.find((p) => p.id !== me)?.id as string;
    const mineBefore = player(s, me).slots[0]?.value;
    const theirsBefore = player(s, rival).slots[3]?.value;
    const r = run(s, {
      t: 'EFFECT_TARGET',
      p: me,
      target: { kind: 'SWAP', ownSlot: 0, player: rival, theirSlot: 3 },
    });
    expect(player(r.state, me).slots[0]?.value).toBe(theirsBefore);
    expect(player(r.state, rival).slots[3]?.value).toBe(mineBefore);
    expect(r.events.some((e) => e.e === 'PRIVATE_REVEAL')).toBe(false);
    const pub = r.events.find((e) => e.e === 'EFFECT_RESOLVED');
    expect(pub).toMatchObject({
      publicInfo: {
        slots: [
          { player: me, slot: 0 },
          { player: rival, slot: 3 },
        ],
      },
    });
    expect(totalCards(r.state)).toBe(52);
  });
});

describe('E11 · Trueque Ciego entre dos slots propios es ilegal', () => {
  it('rechaza el trueque contra uno mismo y no lo ofrece como objetivo', () => {
    const { s, me } = openEffect(11);
    expect(
      apply(s, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'SWAP', ownSlot: 0, player: me, theirSlot: 1 },
      }),
    ).toMatchObject({ error: { code: 'SWAP_SELF' } });
    for (const t of validEffectTargets(s, me)) {
      if (t.kind === 'SWAP') expect(t.player).not.toBe(me);
    }
  });
});

describe('E10/E12 · el cantor sellado no puede ser objetivo de ningún efecto', () => {
  it('Espionaje al sellado es ilegal y no aparece entre los objetivos', () => {
    const { s, me } = openEffect(9);
    const rival = s.players.find((p) => p.id !== me)?.id as string;
    const sealed = structuredClone(s);
    player(sealed, rival).sealed = true;
    sealed.ultimaCaller = rival;

    expect(
      apply(sealed, { t: 'EFFECT_TARGET', p: me, target: { kind: 'SPY', player: rival, slot: 0 } }),
    ).toMatchObject({ error: { code: 'TARGET_SEALED' } });
    expect(validEffectTargets(sealed, me).some((t) => 'player' in t && t.player === rival)).toBe(
      false,
    );
  });

  it('Trueque contra el sellado es ilegal (E10)', () => {
    const { s, me } = openEffect(11);
    const rival = s.players.find((p) => p.id !== me)?.id as string;
    const sealed = structuredClone(s);
    player(sealed, rival).sealed = true;
    expect(
      apply(sealed, {
        t: 'EFFECT_TARGET',
        p: me,
        target: { kind: 'SWAP', ownSlot: 0, player: rival, theirSlot: 0 },
      }),
    ).toMatchObject({ error: { code: 'TARGET_SEALED' } });
  });
});

describe('E8 · efecto sin objetivos válidos se omite automáticamente', () => {
  it('Espionaje con todos los rivales sellados emite EFFECT_SKIPPED(noTargets)', () => {
    const { s, me } = withDrawn(9);
    const mut = structuredClone(s);
    for (const p of mut.players) if (p.id !== me) p.sealed = true;
    const r = run(mut, { t: 'DISCARD_DRAWN', p: me });
    expect(r.events.find((e) => e.e === 'EFFECT_SKIPPED')).toMatchObject({
      player: me,
      reason: 'noTargets',
    });
    expect(r.state.phase).toBe('TURN_DRAW');
    expect(r.state.pendingEffect).toBeUndefined();
  });

  it('Vislumbre sin ningún tótem propio se omite solo', () => {
    const { s, me } = withDrawn(7);
    const mut = structuredClone(s);
    const p = player(mut, me);
    for (let i = 0; i < p.slots.length; i++) {
      const c = p.slots[i];
      if (c) mut.deck.push(c);
      p.slots[i] = null;
    }
    const r = run(mut, { t: 'DISCARD_DRAWN', p: me });
    expect(r.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'noTargets')).toBe(true);
  });
});

describe('E9 · timeout de selección de objetivo pierde el efecto', () => {
  it('TIMER_FIRED(effect) emite EFFECT_SKIPPED(timeout) y pasa turno', () => {
    const { s, me } = openEffect(7);
    const r = run(s, { t: 'TIMER_FIRED', timer: 'effect' });
    expect(r.events.find((e) => e.e === 'EFFECT_SKIPPED')).toMatchObject({
      player: me,
      reason: 'timeout',
    });
    expect(r.state.phase).toBe('TURN_DRAW');
    expect(activeId(r.state)).not.toBe(me);
  });
});

describe('omitir a mano y validaciones de targeting', () => {
  it('EFFECT_SKIP(chosen) siempre está disponible', () => {
    const { s, me } = openEffect(10);
    expect(legalActions(s, me).map((a) => a.t)).toContain('EFFECT_SKIP');
    const r = run(s, { t: 'EFFECT_SKIP', p: me });
    expect(r.events.some((e) => e.e === 'EFFECT_SKIPPED' && e.reason === 'chosen')).toBe(true);
  });

  it('rechaza targeting de otro jugador, tipo equivocado, slot vacío o jugador inexistente', () => {
    const { s, me } = openEffect(7);
    const other = s.players.find((p) => p.id !== me)?.id as string;
    expect(
      apply(s, { t: 'EFFECT_TARGET', p: other, target: { kind: 'PEEK', slot: 0 } }),
    ).toMatchObject({ error: { code: 'NOT_EFFECT_OWNER' } });
    expect(apply(s, { t: 'EFFECT_SKIP', p: other })).toMatchObject({
      error: { code: 'NOT_EFFECT_OWNER' },
    });
    expect(
      apply(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'SPY', player: other, slot: 0 } }),
    ).toMatchObject({ error: { code: 'WRONG_EFFECT_KIND' } });
    expect(
      apply(s, { t: 'EFFECT_TARGET', p: me, target: { kind: 'PEEK', slot: 99 } }),
    ).toMatchObject({ error: { code: 'BAD_SLOT' } });

    const spy = openEffect(9);
    expect(
      apply(spy.s, {
        t: 'EFFECT_TARGET',
        p: spy.me,
        target: { kind: 'SPY', player: 'Z', slot: 0 },
      }),
    ).toMatchObject({ error: { code: 'NO_SUCH_PLAYER' } });
    const swap = openEffect(11);
    const rival = swap.s.players.find((p) => p.id !== swap.me)?.id as string;
    expect(
      apply(swap.s, {
        t: 'EFFECT_TARGET',
        p: swap.me,
        target: { kind: 'SWAP', ownSlot: 99, player: rival, theirSlot: 0 },
      }),
    ).toMatchObject({ error: { code: 'BAD_SLOT' } });
    expect(
      apply(swap.s, {
        t: 'EFFECT_TARGET',
        p: swap.me,
        target: { kind: 'SWAP', ownSlot: 0, player: 'Z', theirSlot: 0 },
      }),
    ).toMatchObject({ error: { code: 'NO_SUCH_PLAYER' } });
  });

  it('el efecto solo se activa al descartar la robada, nunca al sustituir', () => {
    const { s, me } = withDrawn(11);
    forceSlot(s, me, 0, 3);
    const r = run(s, { t: 'SWAP_DRAWN', p: me, slot: 0 });
    expect(r.state.pendingEffect).toBeUndefined();
    expect(r.state.phase).toBe('TURN_DRAW');
  });

  it('durante EFFECT_TARGETING el resto no tiene acciones legales', () => {
    const { s, me } = openEffect(7);
    const other = s.players.find((p) => p.id !== me)?.id as string;
    expect(legalActions(s, other)).toEqual([]);
  });
});
