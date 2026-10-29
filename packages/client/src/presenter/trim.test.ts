/** D-045 · el presenter recorta el peso al llegar un evento de Descarte Rápido. */
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@totem/core';
import { Presenter } from './queue.js';

const drew: GameEvent = { e: 'DREW', player: 'A', source: 'deck' };
const discarded = { e: 'DISCARDED_DRAWN' } as unknown as GameEvent;

describe('recorte del peso por el presenter', () => {
  it('llama a trim justo antes de reproducir un evento urgente, y a ningún otro', () => {
    const order: string[] = [];
    const trim = vi.fn(() => order.push('trim'));
    const p = new Presenter({
      play: (e) => order.push(e.e),
      advance: () => undefined,
      fastForward: () => undefined,
      trim,
    });
    p.enqueue(drew);
    p.enqueue(discarded);
    p.tick(0);
    expect(trim).not.toHaveBeenCalled();
    p.tick(600);
    expect(order).toEqual(['DREW', 'trim', 'DISCARDED_DRAWN']);
  });

  it('trim es opcional', () => {
    const p = new Presenter({
      play: () => undefined,
      advance: () => undefined,
      fastForward: () => undefined,
    });
    p.enqueue(discarded);
    expect(() => p.tick(0)).not.toThrow();
  });
});
