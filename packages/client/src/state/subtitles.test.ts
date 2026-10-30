import { describe as suite, expect, it } from 'vitest';
import { describe, resolveName } from './subtitles.js';
import { DICTS } from '../i18n/index.js';

const seats = [{ playerId: 'p1', name: 'Ana' }];

suite('subtítulos vía i18n', () => {
  it('resolveName cae a los asientos del lobby y nunca devuelve el id crudo', () => {
    expect(resolveName('p1', { p1: 'Vista' }, seats, 'es')).toBe('Vista');
    expect(resolveName('p1', {}, seats, 'es')).toBe('Ana');
    expect(resolveName('p9', {}, seats, 'es')).toBe(DICTS.es.someone);
    expect(resolveName('p9', {}, undefined, 'en')).toBe(DICTS.en.someone);
  });

  it('ROUND_STARTED usa el nombre en es y en', () => {
    const n = (id: string): string => resolveName(id, {}, seats, 'es');
    const ev = { e: 'ROUND_STARTED', startingPlayer: 'p1' } as never;
    expect(describe(ev, n, 'es')).toBe('Nueva ronda. Empieza Ana.');
    expect(describe(ev, n, 'en')).toBe('New round. Ana starts.');
  });

  it('numera los slots 1..N y traduce el efecto', () => {
    const ev = { e: 'SWAPPED_DRAWN', player: 'p1', slot: 0, discardedValue: 5 } as never;
    expect(describe(ev, () => 'Ana', 'es')).toContain('tótem 1');
    const eff = { e: 'EFFECT_PENDING', player: 'p1', effect: 'PEEK' } as never;
    expect(describe(eff, () => 'Ana', 'es')).toBe('Ana activa Vislumbre.');
  });
});
