import { describe, expect, it } from 'vitest';
import { STEPS, Tutorial, YOU } from './engine.js';

describe('WP-14 · tutorial de 6 pasos (guion de docs/01 §11)', () => {
  it('el guion tiene los 6 pasos del documento', () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(STEPS.map((s) => s.textKey)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
  });

  it('un jugador nuevo puede completarlo entero siguiendo las indicaciones', () => {
    const tut = new Tutorial();

    // 1 · vislumbre inicial
    expect(tut.stepNumber).toBe(1);
    expect(tut.submit({ t: 'PEEK_INITIAL', slots: [0, 1] }).advanced).toBe(true);

    // 2 · robar y sustituir
    expect(tut.stepNumber).toBe(2);
    expect(tut.submit({ t: 'DRAW_DECK' }).ok).toBe(true);
    expect(tut.view().drawn?.value).toBe(1);
    expect(tut.submit({ t: 'SWAP_DRAWN', slot: 3 }).advanced).toBe(true);

    // 3 · robar un 7 y descartarlo: activa Vislumbre
    expect(tut.stepNumber).toBe(3);
    expect(tut.submit({ t: 'DRAW_DECK' }).ok).toBe(true);
    expect(tut.view().drawn?.value).toBe(7);
    const disc = tut.submit({ t: 'DISCARD_DRAWN' });
    expect(disc.events.some((e) => e.e === 'EFFECT_PENDING')).toBe(true);
    const peek = tut.submit({ t: 'EFFECT_TARGET', target: { kind: 'PEEK', slot: 0 } });
    expect(peek.events.some((e) => e.e === 'PRIVATE_REVEAL')).toBe(true);
    expect(peek.advanced).toBe(true);

    // 4 · Descarte Rápido acertado
    expect(tut.stepNumber).toBe(4);
    expect(tut.view().discardTop).toBe(4);
    const ok = tut.submit({ t: 'MATCH_ATTEMPT', slot: 0 });
    expect(ok.events.some((e) => e.e === 'MATCH_OK')).toBe(true);
    expect(ok.advanced).toBe(true);

    // 5 · fallo provocado: castigo y bloqueo
    expect(tut.stepNumber).toBe(5);
    const fail = tut.submit({ t: 'MATCH_ATTEMPT', slot: 2 });
    const failEv = fail.events.find((e) => e.e === 'MATCH_FAIL');
    expect(failEv).toBeDefined();
    expect(fail.events.some((e) => e.e === 'PENALTY_CARD')).toBe(true);
    expect(fail.viewAfter.you.lockedForMs).toBeGreaterThan(0); // 5 s de bloqueo
    expect(fail.advanced).toBe(true);

    // 6 · cantar ÚLTIMA
    expect(tut.stepNumber).toBe(6);
    expect(tut.legal().some((a) => a.t === 'CALL_ULTIMA')).toBe(true);
    const last = tut.submit({ t: 'CALL_ULTIMA' });
    expect(last.events.some((e) => e.e === 'ULTIMA_CALLED')).toBe(true);
    expect(tut.done).toBe(true);
  });

  it('si te sales del guion (descartar en vez de sustituir) no se queda atascado', () => {
    const tut = new Tutorial();
    tut.submit({ t: 'PEEK_INITIAL', slots: [0, 1] });
    expect(tut.stepNumber).toBe(2);

    tut.submit({ t: 'DRAW_DECK' });
    const off = tut.submit({ t: 'DISCARD_DRAWN' });
    expect(off.ok).toBe(true);
    expect(off.advanced).toBe(false);

    // El bot ha jugado su turno y vuelves a poder actuar en el mismo paso.
    expect(tut.stepNumber).toBe(2);
    expect(tut.legal().some((a) => a.t === 'DRAW_DECK')).toBe(true);
    expect(tut.submit({ t: 'DRAW_DECK' }).ok).toBe(true);
    expect(tut.view().drawn?.value).toBe(1);
    expect(tut.submit({ t: 'SWAP_DRAWN', slot: 3 }).advanced).toBe(true);
    expect(tut.stepNumber).toBe(3);
  });

  it('rechaza acciones ilegales sin romper el guion', () => {
    const tut = new Tutorial();
    expect(tut.submit({ t: 'DRAW_DECK' }).ok).toBe(false); // aún en vislumbre
    expect(tut.stepNumber).toBe(1);
  });

  it('la vista del tutorial no filtra información oculta (I2)', () => {
    const tut = new Tutorial();
    const json = JSON.stringify(tut.view());
    expect(/"c\d\d"/.test(json)).toBe(false);
    expect(tut.view().you.slots.every((s) => s === 'hidden' || s === 'empty')).toBe(true);
    expect(tut.view().you.id).toBe(YOU);
  });

  it('se puede saltar', () => {
    const tut = new Tutorial();
    tut.skip();
    expect(tut.done).toBe(true);
  });
});
