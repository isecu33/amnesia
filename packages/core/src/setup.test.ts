import { describe, expect, it } from 'vitest';
import { DECK_SIZE, buildDeck, effectOf } from './deck.js';
import { DEFAULT_CONFIG, makeConfig, validateConfig } from './config.js';
import { shuffle } from './rng.js';
import { apply, createGame } from './engine.js';
import { newGame, skipPeek, totalCards } from './test-helpers.js';

describe('mazo (docs/01 §2)', () => {
  const deck = buildDeck();
  it('tiene exactamente 52 cartas con ids c00..c51', () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck[0]?.id).toBe('c00');
    expect(deck[51]?.id).toBe('c51');
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
  });

  it('la composición por valor es la de la tabla', () => {
    const counts = new Map<number, number>();
    for (const c of deck) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    expect(counts.get(0)).toBe(2);
    expect(counts.get(13)).toBe(2);
    for (let v = 1; v <= 12; v++) expect(counts.get(v)).toBe(4);
  });

  it('los efectos v2 (#13): 7 PEEK, 8 DOUBLE_DRAW, 9 SPY, 10 SHARED_EYE, 11 SWAP, 12 RUMBLE, 13 SEER', () => {
    expect(([7, 8, 9, 10, 11, 12, 13] as const).map((v) => effectOf(v))).toEqual([
      'PEEK',
      'DOUBLE_DRAW',
      'SPY',
      'SHARED_EYE',
      'SWAP',
      'RUMBLE',
      'SEER',
    ]);
    for (const v of [0, 1, 2, 3, 4, 5, 6] as const) expect(effectOf(v)).toBeUndefined();
  });
});

describe('config (docs/01 §9)', () => {
  it('la config por defecto es válida', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it('rechaza valores fuera de rango', () => {
    const issues = validateConfig(makeConfig({ turnSeconds: 5, maxSlots: 99 }));
    expect(issues.map((i) => i.key).sort()).toEqual(['maxSlots', 'turnSeconds']);
  });

  it('rechaza combinaciones incoherentes y las reglas v1.1', () => {
    const issues = validateConfig(
      makeConfig({ autoPeekAtSecond: 99, wildModeEnabled: true, kamikazeRule: true }),
    );
    const keys = issues.map((i) => i.key);
    expect(keys).toContain('autoPeekAtSecond');
    expect(keys).toContain('wildModeEnabled');
    expect(keys).toContain('kamikazeRule');
  });

  it('detecta minPlayers>maxPlayers, initialSlots>maxSlots, peek>slots, delays y modo', () => {
    const bad = makeConfig({ minPlayers: 6, maxPlayers: 2 });
    expect(validateConfig(bad).map((i) => i.key)).toContain('minPlayers');
    const bad2 = { ...makeConfig(), initialSlots: 9, maxSlots: 8, initialPeekCount: 10 };
    const keys2 = validateConfig(bad2).map((i) => i.key);
    expect(keys2).toContain('initialSlots');
    expect(keys2).toContain('initialPeekCount');
    const bad3 = makeConfig({ botTurnDelayMsMin: 5000, botTurnDelayMsMax: 10 });
    expect(validateConfig(bad3).map((i) => i.key)).toContain('botTurnDelayMsMin');
    const bad4 = { ...makeConfig(), mode: 'raro' } as unknown as typeof DEFAULT_CONFIG;
    expect(validateConfig(bad4).map((i) => i.key)).toContain('mode');
    const bad5 = { ...makeConfig(), turnSeconds: Number.NaN };
    expect(validateConfig(bad5).map((i) => i.key)).toContain('turnSeconds');
  });

  it('createGame rechaza config inválida y números de jugadores imposibles', () => {
    expect(() => createGame(makeConfig({ turnSeconds: 1 }), ['A', 'B'], 1)).toThrow(/Config/);
    expect(() => createGame(makeConfig(), ['A'], 1)).toThrow(/jugadores/);
    expect(() => createGame(makeConfig(), ['A', 'A'], 1)).toThrow(/duplicados/);
    expect(() => createGame(makeConfig(), ['A', 'B'], 1.5)).toThrow(/seed/);
  });
});

describe('reparto (docs/01 §3)', () => {
  it('reparte initialSlots a cada jugador y voltea 1 al descarte', () => {
    const s = newGame();
    expect(s.phase).toBe('INITIAL_PEEK');
    for (const p of s.players) expect(p.slots).toHaveLength(s.config.initialSlots);
    expect(s.discard).toHaveLength(1);
    expect(s.deck).toHaveLength(52 - 3 * 4 - 1);
    expect(totalCards(s)).toBe(52);
  });

  it('programa los dos temporizadores de vislumbre', () => {
    const s = newGame();
    expect(s.timers.map((t) => t.kind)).toEqual(['peek', 'peek']);
    expect(s.timers[0]?.deadlineTick).toBe(7000);
    expect(s.timers[1]?.deadlineTick).toBe(10000);
  });
});

describe('vislumbre inicial (docs/01 §3.4)', () => {
  it('devuelve los valores elegidos SOLO al jugador que elige', () => {
    const r = apply(newGame(), { t: 'PEEK_INITIAL', p: 'A', slots: [1, 0] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toHaveLength(1);
    const e = r.events[0];
    expect(e?.e).toBe('INITIAL_PEEK_RESULT');
    if (e?.e === 'INITIAL_PEEK_RESULT') {
      expect(e.to).toBe('A');
      expect(e.cards.map((c) => c.slot)).toEqual([0, 1]);
    }
  });

  it('autocompleta en autoPeekAtSecond y termina la fase al segundo disparo', () => {
    const r1 = apply(newGame(), { t: 'TIMER_FIRED', timer: 'peek' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.peekAutoCompleted).toBe(true);
    expect(r1.state.phase).toBe('INITIAL_PEEK');
    expect(r1.events.filter((e) => e.e === 'INITIAL_PEEK_RESULT')).toHaveLength(3);
    for (const p of r1.state.players) expect(r1.state.peekChoices[p.id]).toEqual([0, 1]);

    const r2 = apply(r1.state, { t: 'TIMER_FIRED', timer: 'peek' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.phase).toBe('TURN_DRAW');
    expect(r2.events.some((e) => e.e === 'TURN_STARTED')).toBe(true);
  });

  it('el autocompletado respeta lo ya elegido y solo revela lo que falta', () => {
    const a = apply(newGame(), { t: 'PEEK_INITIAL', p: 'A', slots: [3] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = apply(a.state, { t: 'TIMER_FIRED', timer: 'peek' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.peekChoices['A']).toEqual([0, 3]);
    const forA = b.events.filter((e) => e.e === 'INITIAL_PEEK_RESULT' && e.to === 'A');
    expect(forA).toHaveLength(1);
    if (forA[0]?.e === 'INITIAL_PEEK_RESULT') expect(forA[0].cards.map((c) => c.slot)).toEqual([0]);
  });

  it('rechaza elegir dos veces, slots repetidos o de más', () => {
    const s = newGame();
    const ok = apply(s, { t: 'PEEK_INITIAL', p: 'A', slots: [0, 1] });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(apply(ok.state, { t: 'PEEK_INITIAL', p: 'A', slots: [2] })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_PEEKED' },
    });
    expect(apply(s, { t: 'PEEK_INITIAL', p: 'A', slots: [0, 0] })).toMatchObject({
      error: { code: 'DUPLICATE_SLOTS' },
    });
    expect(apply(s, { t: 'PEEK_INITIAL', p: 'A', slots: [0, 1, 2] })).toMatchObject({
      error: { code: 'BAD_PEEK_COUNT' },
    });
    expect(apply(s, { t: 'PEEK_INITIAL', p: 'A', slots: [9] })).toMatchObject({
      error: { code: 'BAD_SLOT' },
    });
    expect(apply(s, { t: 'PEEK_INITIAL', p: 'Z', slots: [0] })).toMatchObject({
      error: { code: 'NO_SUCH_PLAYER' },
    });
    expect(apply(skipPeek(s), { t: 'PEEK_INITIAL', p: 'A', slots: [0] })).toMatchObject({
      error: { code: 'WRONG_PHASE' },
    });
  });
});

describe('RNG (docs/02 §3.7)', () => {
  it('Fisher-Yates es determinista y conserva los elementos', () => {
    const base = buildDeck();
    const [a] = shuffle(base, 7, 0);
    const [b] = shuffle(base, 7, 0);
    const [c] = shuffle(base, 8, 0);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(52);
  });

  it('el mismo seed produce la misma partida', () => {
    expect(JSON.stringify(skipPeek(newGame()))).toBe(JSON.stringify(skipPeek(newGame())));
    expect(JSON.stringify(newGame({}, ['A', 'B', 'C'], 1))).not.toBe(
      JSON.stringify(newGame({}, ['A', 'B', 'C'], 2)),
    );
  });
});
