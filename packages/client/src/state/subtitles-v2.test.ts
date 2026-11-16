/** P1 · subtítulos de los eventos v2 (docs/01 §11: todo sonido tiene alternativa visual). */
import { describe as suite, expect, it } from 'vitest';
import type { GameEvent } from '@totem/core';
import { describe, privateLine } from './subtitles.js';

const names: Record<string, string> = { A: 'Ana', B: 'Bea' };
const n = (id: string): string => names[id] ?? '?';

suite('P1 · subtítulos de los eventos v2', () => {
  const cases: [GameEvent, string][] = [
    [
      { e: 'STEAL_WINDOW_OPENED', owner: 'A', effect: 'SPY', deadlineTick: 1 },
      '¡Ana activa Espionaje! Ventana de robo abierta.',
    ],
    [{ e: 'EFFECT_STOLEN', thief: 'B', owner: 'A', effect: 'PEEK' }, '¡Bea roba Vislumbre a Ana!'],
    [{ e: 'CHAIN_LINK', player: 'A', link: 1, bonus: 0 }, 'Ana encadena el eslabón 1.'],
    [
      { e: 'CHAIN_LINK', player: 'A', link: 2, bonus: -1 },
      'Ana encadena el eslabón 2 (-1 puntos).',
    ],
    [{ e: 'CHAIN_BROKEN', links: 3 }, 'Se rompe la cadena de 3 eslabones.'],
    [{ e: 'OMEN_CHANGED', omen: 'HASTE' }, 'Presagio: Prisa (turnos más cortos).'],
    [{ e: 'OMEN_CHANGED', omen: null }, 'El presagio se disipa.'],
    [
      { e: 'DOUBLE_DRAW_PENDING', player: 'A' },
      'Ana guarda un Doble Robo para su próximo robo del mazo.',
    ],
    [{ e: 'DOUBLE_DRAW_CLEARED', player: 'A', reason: 'lost' }, 'Ana pierde su Doble Robo.'],
    [{ e: 'DOUBLE_DRAW_CLEARED', player: 'A', reason: 'used' }, 'Ana usa su Doble Robo.'],
    [{ e: 'DOUBLE_DRAW_REJECTED', player: 'A', value: 4 }, 'Ana rechaza un 4 del Doble Robo.'],
    [{ e: 'WILD_GIFT', from: 'A', fromSlot: 0, to: 'B', toSlot: 1 }, 'Ana regala un tótem a Bea.'],
    [
      {
        e: 'EFFECT_RESOLVED',
        player: 'A',
        effect: 'SEER_LOOK',
        publicInfo: { slots: [{ player: 'B', slot: 0 }] },
      },
      'Ana resuelve Trueque Vidente: Bea#1.',
    ],
  ];
  it.each(cases)('%j', (ev, text) => expect(describe(ev, n, 'es', 'C')).toBe(text));

  it('en inglés también nombra el presagio', () => {
    expect(describe({ e: 'OMEN_CHANGED', omen: 'CALM' }, n, 'en')).toBe(
      'Omen: Calm (longer turns).',
    );
  });

  it('segunda persona: robo, regalo y espionaje sobre ti', () => {
    const d = (e: GameEvent): string | null => describe(e, n, 'es', 'C');
    expect(d({ e: 'EFFECT_STOLEN', thief: 'C', owner: 'A', effect: 'SPY' })).toBe(
      '¡Robas Espionaje a Ana!',
    );
    expect(d({ e: 'EFFECT_STOLEN', thief: 'B', owner: 'C', effect: 'SPY' })).toBe(
      '¡Bea te roba Espionaje!',
    );
    expect(d({ e: 'STEAL_WINDOW_OPENED', owner: 'C', effect: 'SPY', deadlineTick: 1 })).toBe(
      '¡Activas Espionaje! Pueden robártelo.',
    );
    expect(d({ e: 'WILD_GIFT', from: 'A', fromSlot: 0, to: 'C', toSlot: 1 })).toBe(
      'Ana te regala un tótem.',
    );
    expect(
      d({
        e: 'EFFECT_RESOLVED',
        player: 'A',
        effect: 'SPY',
        publicInfo: { slots: [{ player: 'C', slot: 2 }] },
      }),
    ).toBe('Ana espía tu tótem 3.');
  });

  it('las líneas privadas solo para su destinatario y con caducidad (I2)', () => {
    const r: GameEvent = {
      e: 'PRIVATE_REVEAL',
      to: 'C',
      player: 'B',
      slot: 1,
      value: 9,
      ttlMs: 3000,
    };
    expect(privateLine(r, n, 'es', 'C', 1)).toEqual({
      text: 'Viste el #2 de Bea = 9',
      ttlMs: 3000,
    });
    expect(privateLine(r, n, 'es', 'Z', 1)).toBeNull();
    const dd: GameEvent = { e: 'DOUBLE_DREW_VALUES', to: 'C', values: [3, 11] };
    expect(privateLine(dd, n, 'es', 'C', 3000)).toEqual({
      text: 'Doble Robo: ves un 3 y un 11.',
      ttlMs: 3000,
    });
    expect(describe(r, n, 'es', 'C')).toBeNull();
    expect(describe(dd, n, 'es', 'C')).toBeNull();
  });
});
