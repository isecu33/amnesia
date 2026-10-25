/** Espionaje y Trueque con teclado: elegir rival (Q/W) y luego su slot (1–8). */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@totem/core';
import { cycleRival, rivalSlotIntent, targetableRivals } from './keyboard-target.js';

const view = (others: Array<Partial<PlayerView['others'][number]> & { id: string }>): PlayerView =>
  ({
    you: { id: 'p1', slots: ['hidden', 'hidden'] },
    others: others.map((o) => ({ slots: ['hidden', 'empty', 'hidden'], sealed: false, ...o })),
  }) as unknown as PlayerView;

describe('rivales apuntables con teclado', () => {
  it('excluye a los sellados y a los que no tienen ningún tótem', () => {
    const v = view([
      { id: 'p2' },
      { id: 'p3', sealed: true },
      { id: 'p4', slots: ['empty', 'empty'] },
      { id: 'p5' },
    ]);
    expect(targetableRivals(v).map((r) => r.id)).toEqual(['p2', 'p5']);
  });

  it('cycleRival avanza y retrocede dando la vuelta, y arranca en el primero', () => {
    const v = view([{ id: 'p2' }, { id: 'p3' }, { id: 'p4' }]);
    expect(cycleRival(v, undefined, 1)).toBe('p2');
    expect(cycleRival(v, 'p2', 1)).toBe('p3');
    expect(cycleRival(v, 'p4', 1)).toBe('p2');
    expect(cycleRival(v, 'p2', -1)).toBe('p4');
    expect(cycleRival(v, undefined, -1)).toBe('p4');
  });

  it('cycleRival devuelve undefined si no hay rivales apuntables', () => {
    expect(cycleRival(view([{ id: 'p2', sealed: true }]), undefined, 1)).toBeUndefined();
  });

  it('un rival que ya no es apuntable se ignora al ciclar', () => {
    const v = view([{ id: 'p2' }, { id: 'p3', sealed: true }]);
    expect(cycleRival(v, 'p3', 1)).toBe('p2');
  });

  it('la tecla de un slot se convierte en intención solo si ese slot está oculto', () => {
    const v = view([{ id: 'p2' }]);
    expect(rivalSlotIntent(v, 'p2', 0)).toEqual({ kind: 'slot', player: 'p2', slot: 0 });
    expect(rivalSlotIntent(v, 'p2', 1)).toBeUndefined(); // hueco (E21)
    expect(rivalSlotIntent(v, 'p2', 7)).toBeUndefined(); // no existe
    expect(rivalSlotIntent(v, 'p9', 0)).toBeUndefined(); // rival desconocido
    expect(rivalSlotIntent(v, undefined, 0)).toBeUndefined();
  });

  it('nunca apunta a un rival sellado (E10/E12)', () => {
    const v = view([{ id: 'p2', sealed: true }]);
    expect(rivalSlotIntent(v, 'p2', 0)).toBeUndefined();
  });
});
